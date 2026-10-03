import test from 'node:test';
import assert from 'node:assert';
import { getOutcomeFromStudent, countDataPoints, hasNewDataSinceAssign } from '../lib/outcomes';
import type { StudentDetail } from '../lib/types';

const BASE: StudentDetail = {
  studentId: 'S001',
  name: 'Alice',
  department: 'CS',
  year: 2,
  riskScore: 50,
  riskLevel: 'Medium',
  contributingFactors: [],
  attendanceHistory: [],
  subjectAttendance: [],
  termTests: [],
  endSemResult: { status: 'Upcoming' },
  lastSemResult: { score: 0, maxMarks: 0 },
  aiExplanation: '',
  suggestedAction: 'Monitor',
  interventionStatus: 'Active',
  activeIntervention: {
    type: 'Counseling',
    details: {},
    status: 'Active',
    assignedDate: '2026-09-01',
    baselineRiskScore: 60,
  },
};

test('outcome: no intervention returns null', () => {
  const s = { ...BASE, activeIntervention: undefined, interventionStatus: 'None' as const };
  assert.strictEqual(getOutcomeFromStudent(s), null);
});

test('outcome: improving when score drops > 2', () => {
  const s = { ...BASE, riskScore: 55 };
  // baseline 60, current 55 → delta -5 → Improving
  const outcome = getOutcomeFromStudent(s)!;
  assert.strictEqual(outcome.outcome, 'Improving');
  assert.strictEqual(outcome.scoreDelta, -5);
  assert.strictEqual(outcome.baselineScore, 60);
});

test('outcome: worsening when score rises > 2', () => {
  const s = { ...BASE, riskScore: 65 };
  // baseline 60, current 65 → delta +5 → Worsening
  const outcome = getOutcomeFromStudent(s)!;
  assert.strictEqual(outcome.outcome, 'Worsening');
  assert.strictEqual(outcome.scoreDelta, 5);
});

test('outcome: no change within ±2', () => {
  const s = { ...BASE, riskScore: 61 };
  const outcome = getOutcomeFromStudent(s)!;
  assert.strictEqual(outcome.outcome, 'No Change');
});

test('outcome: awaiting when no new data after intervention', () => {
  const outcome = getOutcomeFromStudent(BASE)!;
  assert.strictEqual(outcome.checkpointDate, '__awaiting__');
});

test('outcome: checkpoint set when attendance data present', () => {
  const s = {
    ...BASE,
    attendanceHistory: [{ week: 'Week 1', percentage: 80, isUploaded: true }],
  };
  const outcome = getOutcomeFromStudent(s)!;
  assert.notStrictEqual(outcome.checkpointDate, '__awaiting__');
});

test('outcome: missing baseline falls back to current score (delta = 0)', () => {
  const s = {
    ...BASE,
    riskScore: 42,
    activeIntervention: {
      ...BASE.activeIntervention!,
      baselineRiskScore: undefined as any,
    },
  };
  const outcome = getOutcomeFromStudent(s)!;
  assert.strictEqual(outcome.baselineScore, 42);
  assert.strictEqual(outcome.scoreDelta, 0);
  assert.strictEqual(outcome.outcome, 'No Change');
});

test('countDataPoints counts attendance weeks + term tests', () => {
  const s = {
    ...BASE,
    attendanceHistory: [
      { week: 'Week 1', percentage: 80, isUploaded: true },
      { week: 'Week 2', percentage: 75, isUploaded: true },
    ],
    termTests: [{ testName: 'Unit Test 1', score: 70, maxMarks: 100, date: '2026-09-10' }],
  };
  assert.strictEqual(countDataPoints(s), 3);
});

test('hasNewDataSinceAssign: true when current > dataPointsAtAssign', () => {
  const s = {
    ...BASE,
    attendanceHistory: [{ week: 'Week 1', percentage: 80, isUploaded: true }],
    activeIntervention: { ...BASE.activeIntervention!, dataPointsAtAssign: 0 },
  };
  assert.strictEqual(hasNewDataSinceAssign(s), true);
});

test('hasNewDataSinceAssign: false when count unchanged since assignment', () => {
  const s = {
    ...BASE,
    attendanceHistory: [{ week: 'Week 1', percentage: 80, isUploaded: true }],
    activeIntervention: { ...BASE.activeIntervention!, dataPointsAtAssign: 1 },
  };
  assert.strictEqual(hasNewDataSinceAssign(s), false);
});

test('hasNewDataSinceAssign: legacy plan (no dataPointsAtAssign) with data → true', () => {
  const s = {
    ...BASE,
    attendanceHistory: [{ week: 'Week 1', percentage: 80, isUploaded: true }],
    activeIntervention: { ...BASE.activeIntervention!, dataPointsAtAssign: undefined as any },
  };
  assert.strictEqual(hasNewDataSinceAssign(s), true);
});

test('outcome: awaiting when dataPointsAtAssign equals current count', () => {
  const s = {
    ...BASE,
    attendanceHistory: [{ week: 'Week 1', percentage: 80, isUploaded: true }],
    activeIntervention: { ...BASE.activeIntervention!, dataPointsAtAssign: 1 },
  };
  const outcome = getOutcomeFromStudent(s)!;
  assert.strictEqual(outcome.checkpointDate, '__awaiting__');
});

test('outcome: not awaiting when new data arrived after assignment', () => {
  const s = {
    ...BASE,
    attendanceHistory: [
      { week: 'Week 1', percentage: 80, isUploaded: true },
      { week: 'Week 2', percentage: 75, isUploaded: true },
    ],
    activeIntervention: { ...BASE.activeIntervention!, dataPointsAtAssign: 1 },
  };
  const outcome = getOutcomeFromStudent(s)!;
  assert.notStrictEqual(outcome.checkpointDate, '__awaiting__');
});
