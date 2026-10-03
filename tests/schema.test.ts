import test from 'node:test';
import assert from 'node:assert';
import { Student } from '../lib/models';
import { INTERVENTION_STATUSES } from '../lib/types';

test('Student schema includes isUploaded in attendanceHistory', () => {
  const attendanceHistory = Student.schema.path('attendanceHistory');
  assert.ok(attendanceHistory, 'attendanceHistory path should exist');
  
  // @ts-ignore
  const isUploadedPath = attendanceHistory.schema.path('isUploaded');
  assert.ok(isUploadedPath, 'isUploaded should exist within attendanceHistory schema');
  assert.strictEqual(isUploadedPath.instance, 'Boolean');
});

test('Student schema accepts INTERVENTION_STATUSES for both enum paths', () => {
  const interventionStatus = Student.schema.path('interventionStatus');
  // @ts-ignore
  assert.deepStrictEqual(interventionStatus.enumValues, INTERVENTION_STATUSES);

  const activeInterventionStatus = Student.schema.path('activeIntervention.status');
  // @ts-ignore
  assert.deepStrictEqual(activeInterventionStatus.enumValues, INTERVENTION_STATUSES);
});
