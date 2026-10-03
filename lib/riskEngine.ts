/**
 * lib/riskEngine.ts
 * 
 * Pure server-side deterministic risk scoring engine.
 * No browser APIs, no import.meta.env; works in Next.js API routes and server components.
 * 
 * Groq API calls are handled by /api/groq/explain route (key stays server-side).
 */

import type { ActionType, ContributingFactor, RiskLevel } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Raw student data shape (input to the engine)
// ─────────────────────────────────────────────────────────────────────────────
export interface RawStudentData {
  studentId: string;
  name: string;
  department: string;
  year: number;
  attendanceHistory: { week: string; percentage: number }[];
  subjectAttendance: { subject: string; percentage: number }[];
  termTests: { testName: string; score: number; maxMarks: number }[];
  backlogs: number;
  backlogSubjects: string[];
  feeOverdueDays: number;
  submissionRate?: number;
}

export interface RiskResult {
  riskScore: number;
  riskLevel: RiskLevel;
  contributingFactors: ContributingFactor[];
  dominantFactor: string;
  suggestedAction: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring sub-functions
// ─────────────────────────────────────────────────────────────────────────────

/** Linearly interpolate between two points. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function scoreAttendance(history: { week: string; percentage: number }[]) {
  const vals = history.slice(-4)
    .map(h => h.percentage)
    .filter(v => Number.isFinite(v) && v >= 0 && v <= 100); // ignore invalid entries
  if (vals.length === 0) return { points: 0, reason: 'No attendance data.' };

  const latest = vals[vals.length - 1];
  const earliest = vals[0];
  const drop = earliest - latest;
  const attSlope = slope(vals);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;

  // Smooth base-points calculation using linear interpolation within each band
  // instead of hard step functions, so scores change gradually at tier boundaries.
  let pts = 0;
  if (latest < 60) {
    pts = 30;
  } else if (latest < 75) {
    // Interpolate: 75% → 20 pts, 60% → 30 pts
    pts = lerp(30, 20, (latest - 60) / 15);
    if (drop >= 15 || attSlope < -2) pts = Math.min(30, pts + 8);
  } else if (latest < 85) {
    // Interpolate: 85% → 8 pts, 75% → 20 pts
    pts = lerp(20, 8, (latest - 75) / 10);
    if (drop >= 15 || attSlope < -3) pts = Math.min(30, pts + 10);
  } else {
    // 85%+ base is 0, but sharp drops still trigger concern
    if (drop >= 15 || attSlope < -4) pts = 12;
    else if (drop >= 8) pts = 5;
  }

  // Round to nearest integer to prevent floating point overflow in UI
  pts = Math.round(clamp(pts, 0, 30));
  const trendLabel = attSlope < -2 ? 'declining trend' : attSlope > 2 ? 'improving trend' : 'stable';
  let reason = `Latest attendance: ${latest}% (avg ${avg.toFixed(0)}%, ${trendLabel})`;
  if (drop >= 15) reason += `, dropped ${drop.toFixed(0)}% over recent weeks`;
  return { points: pts, reason };
}

const RECOGNIZED_TESTS = ['unit test 1', 'unit test 2'];

function normalizeTestName(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Score a single test score against the baseline tier table (same for UT1 and standalone UT2). */
function baselineTierPoints(score: number): number {
  if (score < 40) return 25;
  if (score < 55) return 18;
  if (score < 65) return 12;
  if (score < 75) return 5;
  return 0;
}

function scoreTermTests(termTests: { testName: string; score: number; maxMarks: number }[]) {
  // Filter to valid-score entries, then normalize names for fuzzy matching
  const valid = termTests.filter(t => Number.isFinite(t.score) && t.score >= 0 && t.score <= 100);
  if (valid.length === 0) return { points: 0, reason: 'No unit test data.' };

  // Warn on unrecognized test names so data issues are visible during testing
  for (const t of valid) {
    const normalized = normalizeTestName(t.testName);
    if (!RECOGNIZED_TESTS.includes(normalized)) {
      console.warn(`[riskEngine] Unrecognized term test name "${t.testName}" (normalized: "${normalized}") — will be excluded from scoring.`);
    }
  }

  // Match by normalized name (trim + lowercase)
  const ut1 = valid.find(t => normalizeTestName(t.testName) === 'unit test 1');
  const ut2 = valid.find(t => normalizeTestName(t.testName) === 'unit test 2');

  if (!ut1 && !ut2) return { points: 0, reason: 'No recognized unit test data.' };

  let pts = 0;
  let reason = '';

  if (ut1 && !ut2) {
    // UT1 only — score against baseline tiers
    const score = ut1.score;
    pts = baselineTierPoints(score);
    reason = `Unit Test 1 score: ${score}% (Baseline)`;
  } else if (ut2) {
    const score2 = ut2.score;
    
    if (ut1) {
      // Both UT1 and UT2 present — score UT2 and apply delta signal
      const score1 = ut1.score;
      pts = baselineTierPoints(score2);

      const diff = score2 - score1;
      if (diff >= 15) {
        pts = Math.max(0, pts - 15); // Strong recovery
        reason = `Unit Test 2 score: ${score2}% (Significant improvement of +${diff}%)`;
      } else if (diff >= 5) {
        pts = Math.max(0, pts - 5);
        reason = `Unit Test 2 score: ${score2}% (Improvement of +${diff}%)`;
      } else if (diff < -15) {
        pts = Math.min(25, pts + 10);
        reason = `Unit Test 2 score: ${score2}% (Significant decline of ${diff}%)`;
      } else if (diff < -5) {
        pts = Math.min(25, pts + 5);
        reason = `Unit Test 2 score: ${score2}% (Decline of ${diff}%)`;
      } else {
        reason = `Unit Test 2 score: ${score2}% (Stable)`;
      }
    } else {
      // UT2 only (no UT1) — score against baseline tiers directly
      // This ensures a low UT2-only score still contributes risk points
      pts = baselineTierPoints(score2);
      reason = `Unit Test 2 score: ${score2}% (Baseline — no Unit Test 1 data)`;
    }
  }

  return { points: clamp(pts, 0, 25), reason };
}

function scoreBacklogs(backlogs: number, subjects: string[]) {
  let pts = 0;
  if (backlogs >= 4) pts = 20;
  else if (backlogs === 3) pts = 17;
  else if (backlogs === 2) pts = 13;
  else if (backlogs === 1) pts = 6;

  const subjectList = subjects.length > 0 ? `: ${subjects.join(', ')}` : '';
  const reason = backlogs === 0 ? 'No active backlogs.' : `${backlogs} active backlog${backlogs > 1 ? 's' : ''}${subjectList}`;
  return { points: pts, reason };
}

function scoreFeeOverdue(overdueDays: number) {
  let pts = 0;
  if (overdueDays > 30) pts = 15;
  else if (overdueDays > 10) pts = 12;
  else if (overdueDays > 0) pts = 6;
  const reason = overdueDays === 0 ? 'Fee paid (no overdue balance).' : `Fee overdue by ${overdueDays} days`;
  return { points: pts, reason };
}

function scoreEngagement(submissionRate?: number) {
  if (typeof submissionRate !== 'number' || !Number.isFinite(submissionRate) || submissionRate < 0 || submissionRate > 100) {
    return { points: 0, reason: 'No engagement data' };
  }
  let pts = 0;
  if (submissionRate < 40) pts = 10;
  else if (submissionRate < 55) pts = 7;
  else if (submissionRate < 65) pts = 4;
  else if (submissionRate < 75) pts = 2;
  return { points: pts, reason: `Assignment/LMS submission rate: ${submissionRate}%` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Subject Rows Utility (Phase 3 spec)
// ─────────────────────────────────────────────────────────────────────────────
export function pickSubjectRows(student: { attendanceHistory?: any[]; subjectAttendance?: any[] }) {
  if (student.attendanceHistory && student.attendanceHistory.length > 0) {
    const latest = student.attendanceHistory[student.attendanceHistory.length - 1];
    if (latest.subjects && latest.subjects.length > 0) {
      return latest.subjects;
    }
  }
  return student.subjectAttendance || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggested action map (Phase 4 of spec)
// ─────────────────────────────────────────────────────────────────────────────
export function getSuggestedAction(dominantFactor: string, student: RawStudentData): string {
  switch (dominantFactor) {
    case 'Grade Decline': {
      const rows = pickSubjectRows(student);
      if (rows.length > 0) {
        const lowest = rows.reduce((min: any, curr: any) => curr.percentage < min.percentage ? curr : min, rows[0]);
        return `Extra Class / Tutoring: ${lowest.subject}`;
      }
      return 'Extra Class / Tutoring';
    }
    case 'Attendance Decline': return 'Counseling / Check-in';
    case 'Fee Overdue': return 'Financial Aid Referral';
    case 'Backlogs': return 'Academic Support';
    case 'Low Engagement': return 'Counseling / Check-in';
    default: return 'Monitor';
  }
}

/**
 * Maps the engine's human-readable recommendation onto an intervention type the
 * mentor action panel can actually file. Lives next to the recommendation table
 * so the wording and the form can never drift apart.
 *
 * "Monitor" is deliberately not an assignable case: it means "no factors, keep
 * watching", so it falls through to 'Other' and the UI offers no action link.
 */
export function getActionTypeForSuggestion(suggestion: string): ActionType {
  const s = (suggestion || '').toLowerCase();
  if (s.includes('extra class') || s.includes('tutoring')) return 'Extra Class';
  if (s.includes('counseling')) return 'Counseling';
  if (s.includes('financial')) return 'Financial Aid Referral';
  if (s.includes('academic')) return 'Academic Support';
  if (s.includes('parent')) return 'Parent/Guardian Notified';
  return 'Other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scoring function
// ─────────────────────────────────────────────────────────────────────────────
export function computeRiskScore(student: RawStudentData): RiskResult {
  const attResult = scoreAttendance(student.attendanceHistory);
  const gradeResult = scoreTermTests(student.termTests);
  const backlogResult = scoreBacklogs(student.backlogs, student.backlogSubjects);
  const feeResult = scoreFeeOverdue(student.feeOverdueDays);
  const engResult = scoreEngagement(student.submissionRate);

  const total = Math.round(clamp(
    attResult.points + gradeResult.points + backlogResult.points + feeResult.points + engResult.points,
    0, 100
  ));

  const riskLevel: RiskLevel = total >= 61 ? 'High' : total >= 31 ? 'Medium' : 'Low';

  const factors: ContributingFactor[] = [];
  if (attResult.points > 0) factors.push({ factor: 'Attendance Decline', points: attResult.points, reason: attResult.reason });
  if (gradeResult.points > 0) factors.push({ factor: 'Grade Decline', points: gradeResult.points, reason: gradeResult.reason });
  if (backlogResult.points > 0) factors.push({ factor: 'Backlogs', points: backlogResult.points, reason: backlogResult.reason });
  if (feeResult.points > 0) factors.push({ factor: 'Fee Overdue', points: feeResult.points, reason: feeResult.reason });
  if (engResult.points > 0) factors.push({ factor: 'Low Engagement', points: engResult.points, reason: engResult.reason });

  factors.sort((a, b) => b.points - a.points);

  const dominantFactor = factors.length > 0 ? factors[0].factor : 'None';
  const suggestedAction = getSuggestedAction(dominantFactor, student);

  return { riskScore: total, riskLevel, contributingFactors: factors, dominantFactor, suggestedAction };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback explanation (no Groq: pure structured text)
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a raw internal reason string into a clean human-readable phrase. */
function humanizeReason(factor: string, reason: string): string {
  const r = reason.toLowerCase();

  if (factor === 'Attendance Decline') {
    const pct = reason.match(/latest attendance:\s*(\d+)%/i)?.[1];
    const dropped = reason.match(/dropped\s*(\d+)%/i)?.[1];
    const trend = r.includes('declining') ? 'and is on a declining trend' : '';
    if (pct && dropped) return `attendance has dropped to ${pct}% (a fall of ${dropped}% in recent weeks) ${trend}`.trim();
    if (pct) return `current attendance is ${pct}%${r.includes('declining') ? ', showing a declining trend' : ''}`;
    return 'attendance has dropped significantly in recent weeks';
  }

  if (factor === 'Grade Decline') {
    const scoreMatch = reason.match(/unit test \d+ score:\s*(\d+)%/i);
    const score = scoreMatch?.[1];
    if (r.includes('significant improvement')) return `grade performance improved significantly in Unit Test 2 (${score}%)`;
    if (r.includes('improvement')) return `grade performance improved to ${score}% in Unit Test 2`;
    if (r.includes('significant decline')) return `grades dropped sharply in Unit Test 2 (${score}%)`;
    if (r.includes('decline')) return `grades have declined in Unit Test 2 (${score}%)`;
    if (score) return `scored ${score}% on their most recent unit test`;
    return 'test scores are below the expected threshold';
  }

  if (factor === 'Backlogs') {
    const count = reason.match(/^(\d+) active backlog/i)?.[1];
    const subjects = reason.match(/:\s*(.+)$/)?.[1];
    if (count && subjects) return `has ${count} active backlog${parseInt(count) > 1 ? 's' : ''} in ${subjects}`;
    if (count) return `has ${count} active backlog${parseInt(count) > 1 ? 's' : ''}`;
    return 'has uncleared backlogs from previous semesters';
  }

  if (factor === 'Fee Overdue') {
    const days = reason.match(/(\d+) days/)?.[1];
    return days ? `fee payment is overdue by ${days} days` : 'fee payment is overdue';
  }

  if (factor === 'Low Engagement') {
    const rate = reason.match(/(\d+)%/)?.[1];
    return rate ? `LMS submission rate is low at ${rate}%` : 'assignment submission rate is critically low';
  }

  return reason;
}

export function generateFallbackExplanation(
  student: { name: string; department: string; year: number },
  result: RiskResult
): string {
  if (result.contributingFactors.length === 0) {
    return `${student.name} is currently showing no significant risk signals. Attendance, grades, and engagement are all within acceptable ranges. Continue monitoring their progress as usual.`;
  }

  const top = result.contributingFactors[0];
  const others = result.contributingFactors.slice(1, 3);
  const riskWord = result.riskLevel === 'High' ? 'high' : result.riskLevel === 'Medium' ? 'moderate' : 'low';

  let explanation = `${student.name} (Year ${student.year}, ${student.department}) is at ${riskWord} dropout risk with a score of ${result.riskScore}/100. `;
  explanation += `The primary concern is that ${humanizeReason(top.factor, top.reason)}. `;

  if (others.length === 1) {
    explanation += `This is compounded by the fact that the student ${humanizeReason(others[0].factor, others[0].reason)}.`;
  } else if (others.length >= 2) {
    explanation += `Additional risk signals include: ${humanizeReason(others[0].factor, others[0].reason)}, and ${humanizeReason(others[1].factor, others[1].reason)}.`;
  }

  return explanation;
}
