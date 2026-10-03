import { NextRequest, NextResponse } from 'next/server';
import { requireMentor } from '../../../../lib/auth';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Models verified to be active on this API key. qwen3.8-27b produces the
// richest narrative but is the one Groq rate-limits first (HTTP 429), so the
// fast gpt-oss model acts as the stand-by.
const PRIMARY_MODEL = 'qwen/qwen3.8-27b';
const FALLBACK_MODEL = 'openai/gpt-oss-20b';

// When Groq rate-limits the primary model, remember it for a short window so
// the following narratives go straight to the stand-by model instead of paying
// for a doomed request on every single call.
const RATE_LIMIT_COOLDOWN_MS = 60_000;
let primaryCooldownUntil = 0;

// The free tier enforces a small sliding token window (x-ratelimit-reset-tokens
// is typically ~1.5-2s), so a 429 is usually worth waiting out rather than
// giving up on. Total added latency is bounded by this deadline.
const RATE_LIMIT_WAIT_BUDGET_MS = 6_000;
const MAX_RATE_LIMIT_WAIT_MS = 2_500;
const MAX_RATE_LIMIT_RETRIES = 2;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * gpt-oss models think before answering and will happily spend the ENTIRE
 * max_tokens budget on hidden reasoning, returning an empty `content` string.
 * Low effort keeps the actual answer inside the budget.
 */
const REASONING_MODEL_PREFIXES = ['openai/gpt-oss'];
const isReasoningModel = (model: string) => REASONING_MODEL_PREFIXES.some(p => model.startsWith(p));

/** How long Groq tells us to wait before retrying a 429. */
function retryDelayMs(res: Response): number {
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RATE_LIMIT_WAIT_MS);
    }
  }
  const reset = res.headers.get('x-ratelimit-reset-tokens'); // e.g. "1.799s"
  if (reset) {
    const seconds = parseFloat(reset);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000 + 150, MAX_RATE_LIMIT_WAIT_MS);
    }
  }
  return 900;
}

function callGroq(model: string, prompt: string, maxTokens: number, reasoningEffort?: 'low') {
  return fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.4,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    }),
  });
}

interface GroqAttempt {
  text: string;
  model: string;
  status: number;
  detail: string;
}

/**
 * Asks one model for a narrative.
 *
 *  • 429 → wait out the rate-limit window (bounded) and retry, instead of
 *    failing instantly the moment a burst trips the token budget.
 *  • empty content → the model spent its budget thinking; retry once with
 *    reasoning suppressed.
 *  • any other error (401/400/5xx) → fail fast, reported precisely.
 */
async function requestNarrative(
  model: string,
  prompt: string,
  maxTokens: number,
  deadline: number,
): Promise<GroqAttempt> {
  let reasoningEffort: 'low' | undefined = isReasoningModel(model) ? 'low' : undefined;

  let res = await callGroq(model, prompt, maxTokens, reasoningEffort);

  // At most two extra attempts: enough to ride out a short token window without
  // holding the request open for the whole deadline budget.
  for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
    if (res.ok || res.status !== 429) break;
    const wait = retryDelayMs(res);
    if (Date.now() + wait > deadline) break;
    console.warn(`[Groq] "${model}" rate-limited (429) — waiting ${wait}ms before retrying.`);
    await sleep(wait);
    res = await callGroq(model, prompt, maxTokens, reasoningEffort);
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return { text: '', model, status: res.status, detail };
  }

  let data = await res.json();
  let text: string = (data?.choices?.[0]?.message?.content ?? '').trim();

  if (!text && reasoningEffort !== 'low') {
    console.warn(`[Groq] "${model}" returned no content (reasoning consumed the budget) — retrying with low reasoning effort.`);
    const retry = await callGroq(model, prompt, maxTokens, 'low');
    if (retry.ok) {
      const retryData = await retry.json();
      const retryText = (retryData?.choices?.[0]?.message?.content ?? '').trim();
      if (retryText) {
        data = retryData;
        text = retryText;
      }
    }
  }

  return { text, model: data?.model ?? model, status: 200, detail: '' };
}

/**
 * Helper to build deterministic fallback explanation if Groq is unavailable
 */
function buildDeterministicFallback(
  studentName?: string,
  year?: number,
  department?: string,
  riskScore?: number,
  riskLevel?: string,
  factors?: Array<{ factor: string; points: number; reason: string }>
): string {
  const name = studentName || 'The student';
  const yr = year ? `Year ${year}` : '';
  const dept = department || '';
  const meta = [yr, dept].filter(Boolean).join(', ');
  const metaStr = meta ? ` (${meta})` : '';
  const score = riskScore !== undefined ? riskScore : 0;
  const level = riskLevel || (score >= 61 ? 'High' : score >= 31 ? 'Medium' : 'Low');

  if (!factors || factors.length === 0) {
    return `${name}${metaStr} has a ${level.toLowerCase()} dropout risk score of ${score}/100 and is maintaining stable academic progress with no immediate warning flags.`;
  }

  const top = factors[0];
  const others = factors.slice(1, 3);
  let text = `${name}${metaStr} has a ${level.toLowerCase()} dropout risk score of ${score}/100. The primary concern is ${top.factor.toLowerCase()} (${top.reason.toLowerCase()}).`;
  if (others.length === 1) {
    text += ` This is compounded by ${others[0].factor.toLowerCase()} (${others[0].reason.toLowerCase()}).`;
  } else if (others.length >= 2) {
    text += ` Additional contributing signals include ${others[0].factor.toLowerCase()} and ${others[1].factor.toLowerCase()}.`;
  }
  return text;
}

/**
 * POST /api/groq/explain
 * 
 * Server-side Groq API proxy. The API key never leaves the server.
 * Client components call THIS endpoint instead of Groq directly.
 * 
 * Body: { studentName, department, year, riskScore, riskLevel, contributingFactors, mode, actionType, dominantFactor }
 * mode: 'explain' (risk narrative) | 'rationale' (intervention rationale)
 */
export async function POST(request: NextRequest) {
  await requireMentor();
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { mode, studentName, department, year, riskScore, riskLevel, contributingFactors, actionType, dominantFactor } = body;
  const factors = Array.isArray(contributingFactors) ? contributingFactors : [];

  // Deterministic fallback generator if Groq is not configured or fails
  const getFallbackText = () => {
    if (mode === 'rationale') {
      return `"${actionType || 'Intervention'}" directly addresses ${studentName || 'the student'}'s primary risk signal (${dominantFactor || 'academic need'}) to stabilize progress.`;
    }
    return buildDeterministicFallback(studentName, year, department, riskScore, riskLevel, factors);
  };

  if (!GROQ_API_KEY) {
    console.warn('[Groq] GROQ_API_KEY is not set — returning fallback text.');
    return NextResponse.json({
      text: getFallbackText(),
      fallback: true,
      error: 'Groq API key not configured'
    }, { status: 200 });
  }

  try {
    let prompt = '';

    if (mode === 'explain') {
      const isHealthy = (riskScore ?? 0) <= 30 && factors.length === 0;

      if (isHealthy) {
        prompt = `You are an academic advisor AI for Sentinel, a student dropout prevention system.
A student has been assessed with a Low dropout risk score of ${riskScore ?? 0}/100.

Student: ${studentName || 'Student'}, Year ${year || 1}, ${department || 'General'}
Risk Score: ${riskScore ?? 0}/100 (${riskLevel || 'Low'})
Contributing Factors:
- No critical risk factors detected. Student maintains consistent attendance, passing marks, and active course engagement.

Write a concise, encouraging, and clear 2-sentence summary of this student's academic standing for a human mentor.
Highlight that they are on track and note any positive observations. Do NOT use bullet points. Write in plain English.`;
      } else {
        const factorSummary = factors.length > 0
          ? factors.map(f => `- ${f.factor} (${f.points} pts): ${f.reason}`).join('\n')
          : '- No specific negative factors listed.';

        prompt = `You are an academic advisor AI for Sentinel, a student dropout prevention system.
A student has been flagged with a ${riskLevel || 'Elevated'} dropout risk score of ${riskScore ?? 50}/100.

Student: ${studentName || 'Student'}, Year ${year || 1}, ${department || 'General'}
Risk Score: ${riskScore ?? 50}/100 (${riskLevel || 'Moderate'})
Contributing Factors:
${factorSummary}

Write a concise, empathetic, and clear 2-3 sentence explanation of why this student is at risk, written for a human mentor.
Be specific about which factors are most concerning and why. Do NOT use bullet points. Write in plain English.`;
      }

    } else if (mode === 'rationale') {
      prompt = `You are an academic advisor AI. A mentor is about to assign an intervention for a student.

Student: ${studentName || 'Student'}
Current Risk Score: ${riskScore ?? 50}/100
Primary Risk Factor: ${dominantFactor || 'Academic need'}
Recommended Intervention: ${actionType || 'Targeted support'}

Write a single, concise sentence (max 30 words) explaining WHY this specific intervention was recommended for this student. Be direct and practical.`;
    } else {
      return NextResponse.json({ error: 'Invalid mode. Use "explain" or "rationale".' }, { status: 400 });
    }

    const maxTokens = mode === 'rationale' ? 80 : 220;
    const deadline = Date.now() + RATE_LIMIT_WAIT_BUDGET_MS;

    // Skip the primary while it is cooling down from a rate-limit response.
    const coolingDown = Date.now() < primaryCooldownUntil;
    const order = coolingDown ? [FALLBACK_MODEL, PRIMARY_MODEL] : [PRIMARY_MODEL, FALLBACK_MODEL];

    let attempt: GroqAttempt = { text: '', model: order[0], status: 0, detail: '' };

    for (const candidate of order) {
      attempt = await requestNarrative(candidate, prompt, maxTokens, deadline);
      if (attempt.text) break;

      if (attempt.status === 429 && candidate === PRIMARY_MODEL && !coolingDown) {
        primaryCooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        console.warn(`[Groq] "${PRIMARY_MODEL}" exhausted its rate limit — using "${FALLBACK_MODEL}" for the next ${RATE_LIMIT_COOLDOWN_MS / 1000}s.`);
      } else {
        console.warn(`[Groq] Model "${candidate}" produced no narrative (status ${attempt.status}): ${attempt.detail || 'empty content'}`);
      }
    }

    if (!attempt.text) {
      const rateLimited = attempt.status === 429;
      console.error('[Groq API Error]', attempt.status, attempt.detail);
      return NextResponse.json({
        text: getFallbackText(),
        fallback: true,
        error: rateLimited
          ? 'Groq rate limit reached (429)'
          : `Groq API error (${attempt.status || 'empty response'})`,
      }, { status: 200 });
    }

    // Strip any <think>...</think> tags that reasoning models may emit
    const cleanText = attempt.text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const finalText = cleanText || getFallbackText();

    // Persist the live Groq explanation to the student record so it survives
    // page refreshes without needing a second API call.
    if (body.studentId && mode === 'explain' && cleanText) {
      try {
        const { patchStudent } = await import('@/lib/store');
        await patchStudent(String(body.studentId), { aiExplanation: finalText });
      } catch (err: any) {
        console.warn('[Groq] Failed to persist explanation:', err.message);
      }
    }

    return NextResponse.json({
      text: finalText,
      model: attempt.model,
      powered: !!cleanText,
    });

  } catch (error) {
    console.error('[API /groq/explain]', error);
    return NextResponse.json({
      text: getFallbackText(),
      fallback: true,
      error: 'Internal server error'
    }, { status: 200 });
  }
}
