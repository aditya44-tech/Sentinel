/**
 * tests/riskEngine.test.ts
 *
 * Unit tests for the deterministic risk scoring engine (lib/riskEngine.ts).
 * Run with: node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeRiskScore,
  getSuggestedAction,
  getActionTypeForSuggestion,
  generateFallbackExplanation,
  pickSubjectRows,
  type RawStudentData,
} from '../lib/riskEngine.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function weeks(values: number[]) {
  return values.map((percentage, i) => ({ week: `W${i + 1}`, percentage }));
}

/** Build unit test data with the engine's expected test names */
function unitTests(ut1Score: number, ut2Score?: number) {
  const tests = [{ testName: 'Unit Test 1', score: ut1Score, maxMarks: 100 }];
  if (ut2Score !== undefined) {
    tests.push({ testName: 'Unit Test 2', score: ut2Score, maxMarks: 100 });
  }
  return tests;
}

/** Healthy baseline student: zero risk on every factor. */
function makeStudent(overrides: Partial<RawStudentData> = {}): RawStudentData {
  return {
    studentId: 'S001',
    name: 'Test Student',
    department: 'CSE',
    year: 2,
    attendanceHistory: weeks([92, 91, 93, 92]), // stable, >= 85
    subjectAttendance: [],
    termTests: unitTests(85, 87),     // stable, >= 75
    backlogs: 0,
    backlogSubjects: [],
    feeOverdueDays: 0,
    submissionRate: 90,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Baseline & factor isolation
// ─────────────────────────────────────────────────────────────────────────────

test('healthy student scores zero with no contributing factors', () => {
  const r = computeRiskScore(makeStudent());
  assert.equal(r.riskScore, 0);
  assert.equal(r.riskLevel, 'Low');
  assert.deepEqual(r.contributingFactors, []);
  assert.equal(r.dominantFactor, 'None');
  assert.equal(r.suggestedAction, 'Monitor');
});

test('attendance factor: <60% caps out at 30 points', () => {
  const r = computeRiskScore(makeStudent({ attendanceHistory: weeks([55, 50, 48, 45]) }));
  const att = r.contributingFactors.find(f => f.factor === 'Attendance Decline');
  assert.equal(att?.points, 30);
  assert.equal(r.riskScore, 30); // only factor
  assert.equal(r.riskLevel, 'Low');
});

test('attendance factor: 60-74% interpolated base, drops get +8', () => {
  // 70% → lerp(30, 20, 10/15) ≈ 23.33
  const flat = computeRiskScore(makeStudent({ attendanceHistory: weeks([70, 70, 71, 70]) }));
  const flatPts = flat.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points ?? 0;
  assert.ok(flatPts > 20 && flatPts < 25, `expected interpolated ~23.33, got ${flatPts}`);

  // Same latest but with steep drop → flatPts + 8, capped at 30
  const steep = computeRiskScore(makeStudent({ attendanceHistory: weeks([80, 76, 73, 70]) }));
  const steepPts = steep.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points ?? 0;
  assert.equal(steepPts, 30); // 23.33 + 8 = 31.33 → capped at 30
});

test('attendance factor: 75-84% interpolated base, sharp decline gets +10', () => {
  // 80% → lerp(20, 8, 5/10) = 14
  const flat = computeRiskScore(makeStudent({ attendanceHistory: weeks([80, 80, 81, 80]) }));
  const flatPts = flat.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points ?? 0;
  assert.equal(flatPts, 14);

  // slope over [95, 90, 85, 80] is -5 (< -3), latest in 75-84 band
  const drop = computeRiskScore(makeStudent({ attendanceHistory: weeks([95, 90, 85, 80]) }));
  const dropPts = drop.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points ?? 0;
  assert.equal(dropPts, 24); // 14 + 10 = 24
});

test('attendance factor: >=85% is zero unless the drop is large', () => {
  const stable = computeRiskScore(makeStudent({ attendanceHistory: weeks([90, 91, 90, 92]) }));
  assert.equal(stable.contributingFactors.find(f => f.factor === 'Attendance Decline'), undefined);

  const mildDrop = computeRiskScore(makeStudent({ attendanceHistory: weeks([95, 92, 90, 88]) })); // drop 7? -> slope strong
  const pts = mildDrop.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points;
  assert.ok(pts === 0 || pts === undefined || pts === 12 || pts === 5, `unexpected pts ${pts}`);

  const bigDrop = computeRiskScore(makeStudent({ attendanceHistory: weeks([98, 95, 90, 86]) })); // drop 12 -> slope < -4
  assert.equal(bigDrop.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points, 12);
});

test('grade factor: UT1 <40 scores max 25 points', () => {
  const r = computeRiskScore(makeStudent({ termTests: unitTests(30) }));
  assert.equal(r.contributingFactors.find(f => f.factor === 'Grade Decline')?.points, 25);
});

test('grade factor: UT1 tiered scoring 40-54 / 55-64 / 65-74', () => {
  const mid = computeRiskScore(makeStudent({ termTests: unitTests(60) }));
  assert.equal(mid.contributingFactors.find(f => f.factor === 'Grade Decline')?.points, 12);

  const low = computeRiskScore(makeStudent({ termTests: unitTests(50) }));
  assert.equal(low.contributingFactors.find(f => f.factor === 'Grade Decline')?.points, 18);

  const high = computeRiskScore(makeStudent({ termTests: unitTests(70) }));
  assert.equal(high.contributingFactors.find(f => f.factor === 'Grade Decline')?.points, 5);
});

test('grade factor: UT2 decline adds points, UT2 recovery subtracts', () => {
  // UT1 80 → UT2 50: significant decline (-30) → 18 + 10 = capped at 25
  const decline = computeRiskScore(makeStudent({ termTests: unitTests(80, 50) }));
  assert.equal(decline.contributingFactors.find(f => f.factor === 'Grade Decline')?.points, 25);

  // UT1 50 → UT2 80: significant recovery (+30) → 0 (>=75) - 15 = 0, factor excluded
  const recovery = computeRiskScore(makeStudent({ termTests: unitTests(50, 80) }));
  assert.equal(recovery.contributingFactors.find(f => f.factor === 'Grade Decline'), undefined);
});

test('backlog factor: tiered 1/2/3/4+ mapping', () => {
  const cases: [number, number][] = [[0, 0], [1, 6], [2, 13], [3, 17], [5, 20]];
  for (const [backlogs, expected] of cases) {
    const r = computeRiskScore(makeStudent({ backlogs, backlogSubjects: backlogs > 0 ? ['DBMS'] : [] }));
    assert.equal(
      r.contributingFactors.find(f => f.factor === 'Backlogs')?.points ?? 0,
      expected,
      `backlogs=${backlogs}`
    );
  }
});

test('fee factor: tiered overdue mapping', () => {
  const cases: [number, number][] = [[0, 0], [1, 6], [10, 6], [11, 12], [30, 12], [31, 15], [90, 15]];
  for (const [days, expected] of cases) {
    const r = computeRiskScore(makeStudent({ feeOverdueDays: days }));
    assert.equal(
      r.contributingFactors.find(f => f.factor === 'Fee Overdue')?.points ?? 0,
      expected,
      `feeOverdueDays=${days}`
    );
  }
});

test('engagement factor: tiered submission-rate mapping', () => {
  const cases: [number, number][] = [[75, 0], [74, 2], [65, 2], [64, 4], [55, 4], [54, 7], [40, 7], [39, 10], [10, 10]];
  for (const [rate, expected] of cases) {
    const r = computeRiskScore(makeStudent({ submissionRate: rate }));
    assert.equal(
      r.contributingFactors.find(f => f.factor === 'Low Engagement')?.points ?? 0,
      expected,
      `submissionRate=${rate}`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation, risk levels, dominant factor
// ─────────────────────────────────────────────────────────────────────────────

test('maximum-risk student reaches exactly 100', () => {
  const r = computeRiskScore(makeStudent({
    attendanceHistory: weeks([50, 45, 40, 35]),
    termTests: unitTests(20, 15),
    backlogs: 4,
    backlogSubjects: ['A', 'B', 'C', 'D'],
    feeOverdueDays: 60,
    submissionRate: 10,
  }));
  assert.equal(r.riskScore, 100);
  assert.equal(r.riskLevel, 'High');
  assert.equal(r.contributingFactors.length, 5);
});

test('risk level boundaries: 30 Low, 31 Medium, 60 Medium, 61 High', () => {
  // 17 (3 backlogs) + 14 (att 80% interpolated) = 31
  const medium = computeRiskScore(makeStudent({
    attendanceHistory: weeks([80, 80, 80, 80]),
    backlogs: 3,
    backlogSubjects: ['a', 'b', 'c'],
  }));
  assert.equal(medium.riskScore, 31);
  assert.equal(medium.riskLevel, 'Medium');

  // 30 (att<60) + 18 (grade 40-54 UT1) + 12 (fee 11-30) = 60
  const justUnder = computeRiskScore(makeStudent({
    attendanceHistory: weeks([55, 50, 48, 45]),
    termTests: unitTests(50),
    feeOverdueDays: 20,
  }));
  assert.equal(justUnder.riskScore, 60);
  assert.equal(justUnder.riskLevel, 'Medium');

  // 30 (att<60) + 25 (grade<40) + 6 (1 backlog) = 61
  const high = computeRiskScore(makeStudent({
    attendanceHistory: weeks([55, 50, 48, 45]),
    termTests: unitTests(30),
    backlogs: 1,
    backlogSubjects: ['OS'],
  }));
  assert.equal(high.riskScore, 61);
  assert.equal(high.riskLevel, 'High');
});

test('factors are sorted descending by points', () => {
  const r = computeRiskScore(makeStudent({
    attendanceHistory: weeks([50, 45, 40, 35]), // 30
    termTests: unitTests(50),     // 18
    backlogs: 2,                                 // 13
    feeOverdueDays: 20,                          // 12
    submissionRate: 50,                          // 7
  }));
  const pts = r.contributingFactors.map(f => f.points);
  assert.deepEqual(pts, [...pts].sort((a, b) => b - a));
  assert.equal(r.dominantFactor, 'Attendance Decline');
});

test('dominant factor ties keep the earlier-inserted factor (grade before fee)', () => {
  // grade UT1 60 = 12 pts, fee 11-30 = 12 pts; everything else zero.
  const r = computeRiskScore(makeStudent({
    termTests: unitTests(60),
    feeOverdueDays: 15,
  }));
  assert.equal(r.riskScore, 24);
  assert.equal(r.dominantFactor, 'Grade Decline');
});

test('empty history arrays contribute zero and are excluded from factors', () => {
  const r = computeRiskScore(makeStudent({ attendanceHistory: [], termTests: [] }));
  assert.equal(r.riskScore, 0);
  assert.deepEqual(r.contributingFactors, []);
});

test('negative / out-of-range inputs are ignored, yielding zero points', () => {
  const r = computeRiskScore(makeStudent({
    backlogs: -3,
    feeOverdueDays: -10,
    submissionRate: -50,
    attendanceHistory: weeks([100, 100, 100, 100]),
    termTests: unitTests(100, 100),
  }));
  assert.equal(r.riskScore, 0);
  assert.deepEqual(r.contributingFactors, []);

  // Invalid entries mixed into otherwise-good histories are dropped, not scored
  const mixed = computeRiskScore(makeStudent({
    attendanceHistory: weeks([NaN, 90, 150, 88]),
    termTests: [{ testName: 'Unit Test 1', score: -5, maxMarks: 100 }],
  }));
  // -5 is filtered out, termTests empty → 0 pts
  assert.equal(mixed.riskScore, 0);
  assert.deepEqual(mixed.contributingFactors, []);
});

// ─────────────────────────────────────────────────────────────────────────────
// Suggested actions
// ─────────────────────────────────────────────────────────────────────────────

test('suggested action map covers every factor and the default', () => {
  const student = makeStudent();
  const map: [string, string][] = [
    ['Grade Decline', 'Extra Class / Tutoring'],
    ['Attendance Decline', 'Counseling / Check-in'],
    ['Fee Overdue', 'Financial Aid Referral'],
    ['Backlogs', 'Academic Support'],
    ['Low Engagement', 'Counseling / Check-in'],
    ['Unknown', 'Monitor'],
  ];
  for (const [factor, expected] of map) {
    const result = getSuggestedAction(factor, student);
    assert.ok(result.startsWith(expected), `factor=${factor}, got ${result}`);
  }
});

test('every recommendation the engine can produce maps to a real intervention type', () => {
  const expectations: [string, string][] = [
    ['Extra Class / Tutoring: DBMS', 'Extra Class'],
    ['Extra Class / Tutoring', 'Extra Class'],
    ['Counseling / Check-in', 'Counseling'],
    ['Financial Aid Referral', 'Financial Aid Referral'],
    ['Academic Support', 'Academic Support'],
  ];
  for (const [suggestion, expected] of expectations) {
    assert.equal(getActionTypeForSuggestion(suggestion), expected, suggestion);
  }

  // "Monitor" means "no factors, keep watching" — it must never become an
  // assignable case with an empty payload.
  assert.equal(getActionTypeForSuggestion('Monitor'), 'Other');
  assert.equal(getActionTypeForSuggestion(''), 'Other');

  // Every factor-driven recommendation must land on a real form.
  const student = makeStudent();
  for (const factor of ['Grade Decline', 'Attendance Decline', 'Fee Overdue', 'Backlogs', 'Low Engagement']) {
    const suggestion = getSuggestedAction(factor, student);
    assert.notEqual(
      getActionTypeForSuggestion(suggestion),
      'Other',
      `factor=${factor} produced an unassignable recommendation: ${suggestion}`,
    );
  }
});

test('dominant factor drives the suggested action', () => {
  const student = makeStudent({ feeOverdueDays: 45 });
  const r = computeRiskScore(student);
  assert.equal(r.dominantFactor, 'Fee Overdue');
  assert.equal(getSuggestedAction(r.dominantFactor, student), 'Financial Aid Referral');
});

// ─────────────────────────────────────────────────────────────────────────────
// Fallback explanation
// ─────────────────────────────────────────────────────────────────────────────

test('fallback explanation: no factors produces the healthy-student message', () => {
  const result = computeRiskScore(makeStudent());
  const text = generateFallbackExplanation({ name: 'Asha', department: 'CSE', year: 3 }, result);
  assert.match(text, /Asha/);
  assert.match(text, /no significant risk signals/);
});

test('fallback explanation: single factor mentions score, factor and reason', () => {
  const result = computeRiskScore(makeStudent({ feeOverdueDays: 45 }));
  const text = generateFallbackExplanation({ name: 'Ravi', department: 'ECE', year: 2 }, result);
  assert.match(text, /Ravi/);
  assert.match(text, /Year 2/);
  assert.match(text, new RegExp(`${result.riskScore}/100`));
  assert.match(text, /overdue/i);
  assert.match(text, /45 days/i);
});

test('fallback explanation: multiple factors lists secondary signals', () => {
  const result = computeRiskScore(makeStudent({
    attendanceHistory: weeks([50, 45, 40, 35]),
    termTests: unitTests(50, 30),
    backlogs: 2,
    backlogSubjects: ['DBMS', 'OS'],
  }));
  const text = generateFallbackExplanation({ name: 'Meena', department: 'IT', year: 4 }, result);
  // New format: human-readable sentences, no raw factor names
  assert.match(text, /attendance/i);
  assert.match(text, /grade|unit test/i);
  assert.match(text, /backlog/i);
  assert.equal(result.riskLevel, 'High');
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #1: Normalize term test name matching
// ─────────────────────────────────────────────────────────────────────────────

test('term test name normalization: lowercase, trimmed, and mixed-case all match', () => {
  // Exact match
  const exact = computeRiskScore(makeStudent({ termTests: unitTests(30) }));
  assert.equal(exact.contributingFactors.find(f => f.factor === 'Grade Decline')?.points, 25);

  // Lowercase
  const lower = computeRiskScore(makeStudent({
    termTests: [{ testName: 'unit test 1', score: 30, maxMarks: 100 }],
  }));
  assert.equal(lower.contributingFactors.find(f => f.factor === 'Grade Decline')?.points, 25);

  // Uppercase
  const upper = computeRiskScore(makeStudent({
    termTests: [{ testName: 'UNIT TEST 1', score: 30, maxMarks: 100 }],
  }));
  assert.equal(upper.contributingFactors.find(f => f.factor === 'Grade Decline')?.points, 25);

  // Leading/trailing whitespace
  const padded = computeRiskScore(makeStudent({
    termTests: [{ testName: '  Unit Test 1  ', score: 30, maxMarks: 100 }],
  }));
  assert.equal(padded.contributingFactors.find(f => f.factor === 'Grade Decline')?.points, 25);
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #3: UT2 without UT1 scores against baseline tiers
// ─────────────────────────────────────────────────────────────────────────────

test('UT2-only (no UT1) scores against baseline tiers instead of treating as stable', () => {
  // UT2=30 → baseline tier 25 pts (same as UT1=30 would be)
  const r = computeRiskScore(makeStudent({
    termTests: [{ testName: 'Unit Test 2', score: 30, maxMarks: 100 }],
  }));
  assert.equal(r.contributingFactors.find(f => f.factor === 'Grade Decline')?.points, 25);
  assert.ok(r.contributingFactors.find(f => f.factor === 'Grade Decline')?.reason.includes('Baseline'));

  // UT2=80 → 0 pts, no factor
  const good = computeRiskScore(makeStudent({
    termTests: [{ testName: 'Unit Test 2', score: 80, maxMarks: 100 }],
  }));
  assert.equal(good.contributingFactors.find(f => f.factor === 'Grade Decline'), undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #4: Smooth attendance scoring at tier boundaries
// ─────────────────────────────────────────────────────────────────────────────

test('attendance scoring interpolates smoothly within bands (no hard cliff at boundaries)', () => {
  // 60% → 30 pts (band floor), 74% → ~20.93 pts (interpolated within 60-74 band)
  const at60 = computeRiskScore(makeStudent({ attendanceHistory: weeks([60, 60, 60, 60]) }));
  const at74 = computeRiskScore(makeStudent({ attendanceHistory: weeks([74, 74, 74, 74]) }));
  const at75 = computeRiskScore(makeStudent({ attendanceHistory: weeks([75, 75, 75, 75]) }));
  const at84 = computeRiskScore(makeStudent({ attendanceHistory: weeks([84, 84, 84, 84]) }));
  const at85 = computeRiskScore(makeStudent({ attendanceHistory: weeks([85, 85, 85, 85]) }));

  const pts60 = at60.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points ?? 0;
  const pts74 = at74.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points ?? 0;
  const pts75 = at75.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points ?? 0;
  const pts84 = at84.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points ?? 0;
  const pts85 = at85.contributingFactors.find(f => f.factor === 'Attendance Decline')?.points ?? 0;

  // Scores should decrease smoothly as attendance improves
  assert.ok(pts60 >= pts74, `60% (${pts60}) should >= 74% (${pts74})`);
  assert.ok(pts74 > pts75, `74% (${pts74}) should > 75% (${pts75}) — interpolation, not cliff`);
  assert.ok(pts75 >= pts84, `75% (${pts75}) should >= 84% (${pts84})`);
  assert.ok(pts84 > pts85, `84% (${pts84}) should > 85% (${pts85})`);
});

test('pickSubjectRows: uses latest attendance history subjects if available', () => {
  const s = {
    attendanceHistory: [
      { week: 'W1', subjects: [{ subject: 'Math', percentage: 90 }] },
      { week: 'W2', subjects: [{ subject: 'Math', percentage: 80 }] },
    ],
    subjectAttendance: [{ subject: 'Math', percentage: 100 }],
  };
  const rows = pickSubjectRows(s as any);
  assert.strictEqual(rows[0].percentage, 80);
});

test('pickSubjectRows: falls back to subjectAttendance', () => {
  const s = {
    attendanceHistory: [{ week: 'W1', subjects: [] }],
    subjectAttendance: [{ subject: 'Math', percentage: 100 }],
  };
  const rows = pickSubjectRows(s as any);
  assert.strictEqual(rows[0].percentage, 100);
});
