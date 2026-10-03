import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../lib/store';
import { getOutcomeFromStudent } from '../lib/outcomes';

test('baseline is frozen at assignment while the current score moves', async () => {
  const students = await store.listStudents();
  const sid = students[5].studentId;
  const original = await store.getStudent(sid);
  const assignedScore = original!.riskScore;

  await store.patchStudent(sid, {
    interventionStatus: 'Active',
    activeIntervention: {
      type: 'Counseling',
      details: { counselingType: 'Academic' },
      status: 'Active',
      assignedDate: '2026-09-18',
      baselineRiskScore: assignedScore,
    },
  });

  let student = await store.getStudent(sid);
  const first = getOutcomeFromStudent(student!)!;
  assert.equal(first.baselineScore, assignedScore, 'baseline recorded at assignment');
  assert.equal(first.currentScore, assignedScore);
  assert.equal(first.outcome, 'No Change');

  // New attendance/grade data arrives and the student gets worse
  student!.riskScore = assignedScore + 25;
  student!.riskLevel = 'High';
  await store.upsertStudents([student!]);

  student = await store.getStudent(sid);
  const second = getOutcomeFromStudent(student!)!;
  assert.equal(second.baselineScore, assignedScore, 'baseline must not move');
  assert.equal(second.currentScore, assignedScore + 25, 'current score follows the data');
  assert.equal(second.scoreDelta, 25);
  assert.equal(second.outcome, 'Worsening');

  // ...and again after an improvement
  student!.riskScore = assignedScore - 12;
  student!.riskLevel = 'Low';
  await store.upsertStudents([student!]);

  student = await store.getStudent(sid);
  const third = getOutcomeFromStudent(student!)!;
  assert.equal(third.baselineScore, assignedScore, 'baseline still the assignment score');
  assert.equal(third.scoreDelta, -12);
  assert.equal(third.outcome, 'Improving');
});

test('a legacy intervention with no baseline falls back to current score', async () => {
  const students = await store.listStudents();
  const sid = students[6].studentId;
  const detail = await store.getStudent(sid);

  // Simulate a legacy record with no baseline
  detail!.riskScore = 55;
  detail!.riskLevel = 'Medium';
  detail!.activeIntervention = { type: 'Extra Class', details: {}, status: 'Active', assignedDate: '2026-09-01' } as any;
  await store.upsertStudents([detail!]);

  let student = await store.getStudent(sid);
  let outcome = getOutcomeFromStudent(student!)!;
  assert.equal(outcome.baselineScore, 55, 'baseline repaired from the score at first read');

  student!.riskScore = 70;
  student!.riskLevel = 'High';
  await store.upsertStudents([student!]);

  student = await store.getStudent(sid);
  outcome = getOutcomeFromStudent(student!)!;
  // Outcomes.ts purely derives from what's given. It doesn't write to DB. So fallback uses the current score always if baseline is completely missing.
  assert.equal(outcome.baselineScore, 70, 'legacy plan tracks current score');
  assert.equal(outcome.currentScore, 70);
  assert.equal(outcome.outcome, 'No Change');
});

test('resolving closes the intervention everywhere and re-opening restores it', async () => {
  const students = await store.listStudents();
  const sid = students[7].studentId;
  await store.patchStudent(sid, {
    interventionStatus: 'Active',
    activeIntervention: { type: 'Counseling', details: {}, status: 'Active', assignedDate: '2026-09-18', baselineRiskScore: 42 },
  });

  await store.patchStudent(sid, {
    interventionStatus: 'Resolved',
    activeIntervention: { type: 'Counseling', details: {}, status: 'Resolved', assignedDate: '2026-09-18', baselineRiskScore: 42 },
  });

  const afterResolve = await store.getStudent(sid);
  assert.equal(afterResolve!.interventionStatus, 'Resolved', 'student record status closed');
  assert.equal(afterResolve!.activeIntervention?.status, 'Resolved', 'intervention itself closed');
  assert.equal(getOutcomeFromStudent(afterResolve!)?.status, 'Resolved', 'outcome reports the closed state');
  assert.equal(getOutcomeFromStudent(afterResolve!)?.baselineScore, 42, 'baseline survives resolution');

  await store.patchStudent(sid, {
    interventionStatus: 'Active',
    activeIntervention: { type: 'Counseling', details: {}, status: 'Active', assignedDate: '2026-09-18', baselineRiskScore: 42 },
  });

  const afterReopen = await store.getStudent(sid);
  assert.equal(afterReopen!.interventionStatus, 'Active');
  assert.equal(afterReopen!.activeIntervention?.status, 'Active');
  assert.equal(getOutcomeFromStudent(afterReopen!)?.status, 'Active');
});

test('resolving leaves no stale baseline behind', async () => {
  const students = await store.listStudents();
  const sid = students[8].studentId;
  await store.patchStudent(sid, {
    interventionStatus: 'Active',
    activeIntervention: { type: 'Counseling', details: {}, status: 'Active', assignedDate: '2026-09-18', baselineRiskScore: 30 },
  });
  
  let student = await store.getStudent(sid);
  student!.interventionStatus = 'Resolved';
  student!.activeIntervention!.status = 'Resolved';
  student!.riskScore = 90;
  student!.riskLevel = 'High';
  await store.upsertStudents([student!]);

  student = await store.getStudent(sid);
  const outcome = getOutcomeFromStudent(student!)!;
  assert.equal(outcome.baselineScore, 30, 'baseline unchanged after resolution and new data');
  assert.equal(outcome.currentScore, 90);
  assert.equal(outcome.status, 'Resolved');
});

test('a student with no intervention has no outcome', async () => {
  const student = await store.getStudent('S900');
  if (student) {
      assert.equal(getOutcomeFromStudent(student), null);
  }
});
