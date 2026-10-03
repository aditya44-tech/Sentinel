import test from 'node:test';
import assert from 'node:assert';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import * as store from '../lib/store';
import { BadRequest } from '../lib/http';
import { getOutcomeFromStudent } from '../lib/outcomes';
import { Student } from '../lib/models'; // Need this to simulate "reload"

test('store tests', async (t) => {
  let mongod: MongoMemoryServer;

  t.before(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
  });

  t.after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
    delete process.env.MONGODB_URI;
  });

  await t.test('cleanId validations', () => {
    assert.throws(() => store.cleanId({ $ne: null }), BadRequest);
    assert.throws(() => store.cleanId('a/b'), BadRequest);
    assert.throws(() => store.cleanId(''), BadRequest);
    assert.strictEqual(store.cleanId('valid-id'), 'valid-id');
  });

  await t.test('upsertStudents size limit', async () => {
    const largeList = Array.from({ length: 501 }, (_, i) => ({ studentId: `S${i}` }));
    await assert.rejects(store.upsertStudents(largeList), BadRequest);
  });

  await t.test('listStudents seeds once, second call skips, reset clears', async () => {
    const students = await store.listStudents();
    assert.ok(students.length > 0, 'should seed demo students');
    
    // Second call skips re-seed (assert no additional docs are created)
    const secondCall = await store.listStudents();
    assert.strictEqual(students.length, secondCall.length, 'second call should not re-seed');

    await store.resetAll();
    const afterReset = await store.listStudents();
    assert.strictEqual(afterReset.length, 0, 'should be empty after reset');
    
    // Simulate cold start
    // @ts-ignore
    delete globalThis.__sentinelDb;
    const afterColdStart = await store.listStudents();
    assert.strictEqual(afterColdStart.length, 0, 'should remain empty after simulated cold start');
  });

  await t.test('Referred persists after reload', async () => {
    await store.upsertStudents([{ studentId: 'TEST-1', riskScore: 50 }]);
    await store.patchStudent('TEST-1', {
      interventionStatus: 'Referred',
      activeIntervention: { type: 'Financial Aid Referral', details: {}, status: 'Referred', assignedDate: '2026-09-01', baselineRiskScore: 50 }
    });

    // Simulate reload by clearing mongoose models / globalThis cache
    // @ts-ignore
    delete globalThis.__sentinelDb;
    
    const student = await store.getStudent('TEST-1');
    assert.strictEqual(student!.interventionStatus, 'Referred');
    assert.strictEqual(student!.activeIntervention?.status, 'Referred');
  });

  await t.test('Notified appends (two calls give two entries)', async () => {
    await store.upsertStudents([{ studentId: 'TEST-2' }]);
    
    await store.patchStudent('TEST-2', { notificationLog: [{ type: 'Notified', details: '1' }] });
    await store.patchStudent('TEST-2', { notificationLog: [{ type: 'Notified', details: '2' }] });

    const student = await store.getStudent('TEST-2');
    assert.strictEqual(student!.notificationLog?.length, 2);
    assert.strictEqual(student!.notificationLog?.[0].details, '1');
    assert.strictEqual(student!.notificationLog?.[1].details, '2');
  });

  await t.test('baseline stays frozen after a re-upload changes riskScore', async () => {
    await store.upsertStudents([{ studentId: 'TEST-3', riskScore: 50 }]);
    await store.patchStudent('TEST-3', {
      interventionStatus: 'Active',
      activeIntervention: { type: 'Counseling', details: {}, status: 'Active', assignedDate: '2026-09-01', baselineRiskScore: 50 }
    });

    await store.upsertStudents([{ studentId: 'TEST-3', riskScore: 80 }]);
    
    const student = await store.getStudent('TEST-3');
    const outcome = getOutcomeFromStudent(student!)!;
    assert.strictEqual(outcome.baselineScore, 50, 'baseline should stay frozen');
    assert.strictEqual(outcome.currentScore, 80);
    assert.strictEqual(outcome.scoreDelta, 30);
  });

  await t.test('awaiting-new-data true right after assignment and false after one more weekly upload', async () => {
    await store.upsertStudents([{ 
      studentId: 'TEST-4', 
      riskScore: 50, 
      attendanceHistory: [{ week: 'Week 1', percentage: 90 }] 
    }]);

    await store.patchStudent('TEST-4', {
      interventionStatus: 'Active',
      activeIntervention: { type: 'Counseling', details: {}, status: 'Active', assignedDate: '2026-09-01', baselineRiskScore: 50, dataPointsAtAssign: 1 }
    });

    let student = await store.getStudent('TEST-4');
    let outcome = getOutcomeFromStudent(student!)!;
    assert.strictEqual(outcome.checkpointDate, '__awaiting__', 'should be awaiting right after assignment');

    await store.upsertStudents([{ 
      studentId: 'TEST-4', 
      riskScore: 50, 
      attendanceHistory: [{ week: 'Week 1', percentage: 90 }, { week: 'Week 2', percentage: 80 }] 
    }]);

    student = await store.getStudent('TEST-4');
    outcome = getOutcomeFromStudent(student!)!;
    assert.notStrictEqual(outcome.checkpointDate, '__awaiting__', 'should not be awaiting after new data');
  });

});
