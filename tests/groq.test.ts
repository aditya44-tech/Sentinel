/**
 * tests/groq.test.ts
 * 
 * Unit and integration tests for the Groq Predictive Risk Narrative & Diagnostic Explanation logic.
 * Run with: npm test
 * 
 * Live API tests auto-skip when dev server is not running on localhost:3000.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Unit tests (no server needed) ──────────────────────────────────────────

test('Groq prompt construction handles high-risk factor breakdown accurately', () => {
  const student = {
    name: 'Kabir Kale',
    year: 3,
    department: 'Computer Science',
    riskScore: 78,
    riskLevel: 'High',
    contributingFactors: [
      { factor: 'Attendance Decline', points: 28, reason: 'Attendance dropped by 18% to 58%' },
      { factor: 'Grade Decline', points: 20, reason: 'UT1 average 38%' },
      { factor: 'Backlogs', points: 17, reason: '3 active backlogs' },
      { factor: 'Fee Overdue', points: 12, reason: 'Fee overdue by 12 days' },
    ]
  };

  const factorSummary = student.contributingFactors
    .map(f => `- ${f.factor} (${f.points} pts): ${f.reason}`)
    .join('\n');

  assert.ok(factorSummary.includes('Attendance Decline (28 pts)'));
  assert.ok(factorSummary.includes('Grade Decline (20 pts)'));
  assert.ok(factorSummary.includes('Backlogs (17 pts)'));
  assert.ok(factorSummary.includes('Fee Overdue (12 pts)'));
});

// ── Integration tests (need dev server + GROQ_API_KEY) ─────────────────────

const LIVE_SERVER = 'http://localhost:3000/api/groq/explain';

/**
 * Live call helper. Retries once, then SKIPS the test when Groq throttles us
 * (the free tier rate-limits the preferred model with HTTP 429) — an exhausted
 * quota should never show up as a failing suite. Any HTTP error other than 429
 * still fails loudly, so a genuinely broken route/key is caught.
 */
async function postGroq(t: any, body: Record<string, unknown>, attempts = 2): Promise<{ status: number; data: any } | null> {
  let last: { status: number; data: any } = { status: 0, data: {} };
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(LIVE_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    last = { status: res.status, data };
    if (res.status === 200 && data?.powered) return last;
    if (res.status !== 200 && res.status !== 429) return last;
  }
  t.skip('Groq live narrative unavailable (rate limit / quota) — live check skipped');
  return null;
}

async function checkServer(t: any) {
  if (!process.env.GROQ_API_KEY) {
    t.skip('GROQ_API_KEY is not set');
    return false;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(LIVE_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'explain', studentName: 'test', riskScore: 0, contributingFactors: [] }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.status !== 200 && res.status !== 400) {
      t.skip('Dev server responded with ' + res.status + ' — GROQ_API_KEY may be missing');
      return false;
    }
    const data = await res.json();
    if (!data.powered) {
      t.skip('GROQ_API_KEY not configured — AI responses unavailable');
      return false;
    }
    return true;
  } catch {
    t.skip('Dev server not running on localhost:3000');
    return false;
  }
}

test('Groq explain endpoint handles live request with qwen/qwen3.8-27b when API key is present', async (t) => {
  if (!(await checkServer(t))) return;

  const live = await postGroq(t, {
    mode: 'explain',
    studentName: 'Kabir Kale',
    department: 'Computer Science',
    year: 3,
    riskScore: 78,
    riskLevel: 'High',
    contributingFactors: [
      { factor: 'Attendance Decline', points: 28, reason: 'Attendance dropped by 18% to 58%' },
      { factor: 'Grade Decline', points: 20, reason: 'UT1 average 38%' },
    ]
  });
  if (!live) return;
  const { status, data } = live;

  assert.equal(status, 200);
  assert.ok(typeof data.text === 'string' && data.text.length > 20);
  assert.equal(data.powered, true);
  // qwen3.8-27b is the preferred model, but Groq rate-limits it (429) and the
  // route then serves the stand-by model — either is a live narrative.
  assert.ok(
    ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b'].includes(data.model),
    `unexpected model served: ${data.model}`,
  );
  assert.ok(data.text.toLowerCase().includes('kabir') || data.text.toLowerCase().includes('attendance') || data.text.toLowerCase().includes('risk'));
});

test('Groq explain endpoint generates encouraging narrative for low-risk student', async (t) => {
  if (!(await checkServer(t))) return;

  const live = await postGroq(t, {
    mode: 'explain',
    studentName: 'Priya Sharma',
    department: 'Information Technology',
    year: 2,
    riskScore: 8,
    riskLevel: 'Low',
    contributingFactors: []
  });
  if (!live) return;
  const { status, data } = live;

  assert.equal(status, 200);
  assert.ok(typeof data.text === 'string' && data.text.length > 20);
  assert.equal(data.powered, true);
});

test('Groq rationale mode produces focused 1-sentence intervention explanation', async (t) => {
  if (!(await checkServer(t))) return;

  const live = await postGroq(t, {
    mode: 'rationale',
    studentName: 'Aarav Patel',
    riskScore: 65,
    actionType: 'Extra Class / Tutoring',
    dominantFactor: 'Grade Decline'
  });
  if (!live) return;
  const { status, data } = live;

  assert.equal(status, 200);
  assert.ok(typeof data.text === 'string' && data.text.length > 10);
  assert.equal(data.powered, true);
});

test('Groq endpoint handles missing or malformed contributingFactors safely without throwing 500', async (t) => {
  if (!(await checkServer(t))) return;

  const res = await fetch(LIVE_SERVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'explain',
      studentName: 'Edge Case Student',
      riskScore: 45,
      contributingFactors: null
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(typeof data.text === 'string');
});

test('Groq endpoint rejects invalid mode with 400', async (t) => {
  if (!(await checkServer(t))) return;

  const res = await fetch(LIVE_SERVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'unknown_mode'
    })
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error.includes('Invalid mode'));
});

test('a live Groq narrative reports its model and never falls back silently', async (t) => {
  if (!(await checkServer(t))) return;

  const live = await postGroq(t, {
    mode: 'explain',
    studentName: 'Model Check',
    department: 'Computer Science',
    year: 4,
    riskScore: 45,
    riskLevel: 'Medium',
    contributingFactors: [{ factor: 'Attendance Decline', points: 20, reason: 'Dropped to 58%' }],
  });
  if (!live) return;
  const { status, data } = live;

  assert.equal(status, 200);

  // The UI keys its "GROQ · model" badge off these fields, so a caller must be
  // able to tell a live narrative from the deterministic template.
  assert.equal(data.powered, true, 'expected a live narrative (check GROQ_API_KEY / model access)');
  assert.ok(!data.fallback, 'a powered response must not be flagged as a fallback');
  assert.ok(typeof data.model === 'string' && data.model.length > 0, 'response must name the model used');
  assert.ok(!/<think>/i.test(data.text), 'reasoning tags must be stripped before display');
});

test('a burst of concurrent narratives is absorbed by rate-limit retries', async (t) => {
  if (!(await checkServer(t))) return;

  const burst = Array.from({ length: 8 }, async (_, i) => {
    try {
      const res = await fetch(LIVE_SERVER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'explain',
          studentName: `Burst Student ${i}`,
          department: 'Computer Science',
          year: 4,
          riskScore: 60 + i,
          riskLevel: 'High',
          contributingFactors: [{ factor: 'Attendance Decline', points: 25, reason: `Dropped to ${50 + i}%` }],
        }),
      });
      return await res.json();
    } catch (e: any) {
      return { fallback: true, error: `network: ${e.message}` };
    }
  });

  const results = await Promise.all(burst);
  const powered = results.filter(r => r?.powered).length;
  const vague = results.filter(r => r?.fallback && /temporary error|Internal server error/i.test(r.error || ''));

  // The free tier rate-limits a burst; the route must wait out the window and
  // still answer. A vague "temporary error" hiding a 429 was the original bug.
  assert.equal(vague.length, 0, `burst produced vague fallback errors: ${JSON.stringify(vague.slice(0, 2))}`);
  assert.ok(
    powered >= Math.ceil(results.length / 2),
    `burst was not absorbed: only ${powered}/${results.length} narratives came back live`,
  );
});

test('route waits out a 429 and retries an empty thinking-model reply instead of falling back', async () => {
  const { POST } = await import('../app/api/groq/explain/route.ts');
  const savedKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-key';

  const originalFetch = globalThis.fetch;
  const calls: { model: string; reasoningEffort?: string }[] = [];

  globalThis.fetch = (async (_url: any, init: any) => {
    const sent = JSON.parse(init.body);
    calls.push({ model: sent.model, reasoningEffort: sent.reasoning_effort });

    // Preferred model is out of quota and tells us to come back quickly.
    if (sent.model === 'qwen/qwen3.8-27b') {
      return new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), {
        status: 429,
        headers: { 'x-ratelimit-reset-tokens': '0.05s' },
      });
    }

    // Stand-by is a thinking model: without low effort it answers with nothing.
    const content = sent.reasoning_effort === 'low' ? 'Live narrative from the stand-by model.' : '';
    return new Response(
      JSON.stringify({ model: sent.model, choices: [{ message: { content, reasoning: 'thinking...' } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as any;

  try {
    const res = await POST(
      new Request('http://localhost/api/groq/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'explain',
          studentName: 'Standby Student',
          riskScore: 70,
          riskLevel: 'High',
          contributingFactors: [{ factor: 'Backlogs', points: 17, reason: '3 active backlogs' }],
        }),
      }) as any,
    );
    const data = await res.json();

    // Retried after the rate-limit wait rather than giving up on the first 429.
    assert.ok(
      calls.filter(c => c.model === 'qwen/qwen3.8-27b').length >= 2,
      `expected a retry after waiting out the 429, got ${calls.length} call(s)`,
    );
    // Empty content was retried with reasoning suppressed, and that answer was used.
    assert.ok(
      calls.some(c => c.model === 'openai/gpt-oss-20b' && c.reasoningEffort === 'low'),
      'expected a low-reasoning-effort retry for the thinking model',
    );
    assert.equal(data.powered, true, 'should serve the live stand-by narrative, not the template');
    assert.equal(data.text, 'Live narrative from the stand-by model.');
    assert.equal(data.model, 'openai/gpt-oss-20b');
    assert.ok(!data.fallback);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = savedKey;
  }
});

test('without a key the endpoint returns a clearly-flagged deterministic fallback', async () => {
  const { POST } = await import('../app/api/groq/explain/route.ts');
  const saved = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const res = await POST(
      new Request('http://localhost/api/groq/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'explain',
          studentName: 'No Key Student',
          riskScore: 70,
          riskLevel: 'High',
          contributingFactors: [{ factor: 'Backlogs', points: 17, reason: '3 active backlogs' }],
        }),
      }) as any,
    );
    const data = await res.json();

    assert.equal(res.status, 200, 'a missing key degrades gracefully, it does not 500');
    assert.equal(data.fallback, true);
    assert.equal(data.powered, undefined, 'fallback text is never reported as powered');
    assert.equal(data.error, 'Groq API key not configured');
    assert.ok(typeof data.text === 'string' && data.text.includes('No Key Student'));
  } finally {
    if (saved === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = saved;
  }
});
