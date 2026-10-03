import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../lib/store';
import { getOutcomeFromStudent } from '../lib/outcomes';
import { computeRiskScore, type RawStudentData } from '../lib/riskEngine';

/** Minimal raw record, scored the same way the CSV upload path scores one. */
function freshStudent(studentId: string, name = 'Re-uploaded Student') {
  const raw: RawStudentData = {
    studentId,
    name,
    department: 'Computer Science',
    year: 4,
    attendanceHistory: [
      { week: 'Week 1', percentage: 78 },
      { week: 'Week 2', percentage: 74 },
    ],
    subjectAttendance: [],
    termTests: [{ testName: 'Unit Test 1', score: 62, maxMarks: 100 }],
    backlogs: 0,
    backlogSubjects: [],
    feeOverdueDays: 0,
    submissionRate: 70,
  };
  const scored = computeRiskScore(raw);
  return {
    ...raw,
    riskScore: scored.riskScore,
    riskLevel: scored.riskLevel,
    contributingFactors: scored.contributingFactors,
    suggestedAction: scored.suggestedAction,
    aiExplanation: '',
    endSemResult: { status: 'Upcoming' as const },
    lastSemResult: { score: 0, maxMarks: 0 },
    interventionStatus: 'None' as const,
  };
}

test('resetAll wipes students, details, interventions, outcomes and history', async () => {
  const students = await store.listStudents();
  const seeded = students[0].studentId;
  const detail = await store.getStudent(seeded);
  assert.ok(detail, 'expected a seeded student before the reset');

  await store.patchStudent(seeded, {
    interventionStatus: 'Active',
    activeIntervention: {
      type: 'Counseling',
      details: { schedule: 'Mon 3:00 PM' },
      status: 'Active',
      assignedDate: '2026-09-10',
      baselineRiskScore: detail!.riskScore,
    },
  });
  await store.addHistory({ fileName: 'x.csv', uploadedAt: new Date().toISOString(), rawData: [] } as any);

  let updatedDetail = await store.getStudent(seeded);
  assert.ok(getOutcomeFromStudent(updatedDetail!), 'an assigned intervention should produce an outcome');

  await store.resetAll();

  assert.equal((await store.listStudents()).length, 0, 'students cleared');
  assert.equal(await store.getStudent(seeded), null, 'details cleared');
  assert.equal((await store.listHistory()).length, 0, 'history cleared');
});

test('a student uploaded after a reset carries no previous intervention status', async () => {
  await store.upsertStudents([freshStudent('S999', 'Before Reset')]);
  let detail = await store.getStudent('S999');
  
  await store.patchStudent('S999', {
    interventionStatus: 'Resolved',
    activeIntervention: {
      type: 'Extra Class',
      details: { subject: 'DBMS' },
      status: 'Resolved',
      assignedDate: '2026-09-10',
      baselineRiskScore: detail!.riskScore,
    }
  });
  
  detail = await store.getStudent('S999');
  assert.equal(detail!.interventionStatus, 'Resolved');

  await store.resetAll();
  assert.equal(await store.getStudent('S999'), null, 'record gone after reset');

  await store.upsertStudents([freshStudent('S999', 'After Reset')]);

  const reuploaded = await store.getStudent('S999');
  assert.equal(reuploaded!.interventionStatus, 'None', 'no stale intervention status');
  assert.equal(reuploaded!.activeIntervention, undefined, 'no stale active intervention');
  assert.equal(getOutcomeFromStudent(reuploaded!), null, 'no stale outcome comparison');
  assert.deepEqual(
    reuploaded!.attendanceHistory!.map(h => h.week),
    ['Week 1', 'Week 2'],
    'only the uploaded weeks are present',
  );
});

test('resetAll also clears students created by a fresh upload', async () => {
  await store.resetAll();
  await store.upsertStudents([freshStudent('S998')]);
  assert.equal((await store.listStudents()).length, 1);

  await store.resetAll();
  assert.equal((await store.listStudents()).length, 0);
  assert.equal(await store.getStudent('S998'), null);
});
