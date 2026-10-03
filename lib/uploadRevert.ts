/**
 * lib/uploadRevert.ts
 *
 * Shared, pure revert logic for upload logs.
 *
 * Deleting an upload must roll every affected student back to exactly the state
 * they were in before that upload touched them. The same plan is used by:
 *   - the API route (DELETE /api/history) so server-side data is consistent,
 *   - the browser (app/providers.tsx) which is the single writer that the
 *     student list is read back from.
 *
 * No DOM or Node APIs here — it must run in both places.
 */

import type { StudentDetail, UploadLog } from './types';
import { computeRiskScore, generateFallbackExplanation, type RawStudentData } from './riskEngine';

export interface RevertPlan {
  /** Fully restored (and risk-recalculated) student records */
  updated: StudentDetail[];
  /** Students that the deleted upload had created — they no longer exist */
  removedIds: string[];
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

/** The exact set of fields an upload log snapshots before it modifies a student. */
export function buildSnapshot(detail: StudentDetail) {
  return {
    attendanceHistory: clone(detail.attendanceHistory ?? []),
    subjectAttendance: clone(detail.subjectAttendance ?? []),
    termTests: clone(detail.termTests ?? []),
    backlogCount: detail.backlogCount ?? 0,
    backlogSubjects: clone(detail.backlogSubjects ?? []),
    feeOverdueDays: detail.feeOverdueDays ?? 0,
    feeStatus: detail.feeStatus ?? 'Paid',
    lastSemResult: clone(detail.lastSemResult ?? { score: 0, maxMarks: 0 }),
    endSemResult: clone(detail.endSemResult ?? { status: 'Upcoming' }),
    submissionRate: detail.submissionRate,
  };
}

/** Re-run the scoring engine for a student record after its data changed. */
export function recomputeStudentRisk(existing: StudentDetail): StudentDetail {
  const raw: RawStudentData = {
    studentId: existing.studentId,
    name: existing.name,
    department: existing.department,
    year: existing.year,
    attendanceHistory: existing.attendanceHistory ?? [],
    subjectAttendance: existing.subjectAttendance ?? [],
    termTests: existing.termTests ?? [],
    backlogs: existing.backlogCount ?? 0,
    backlogSubjects: existing.backlogSubjects ?? [],
    feeOverdueDays: existing.feeOverdueDays ?? 0,
    submissionRate: existing.submissionRate,
  };

  const result = computeRiskScore(raw);

  return {
    ...existing,
    riskScore: result.riskScore,
    riskLevel: result.riskLevel,
    contributingFactors: result.contributingFactors,
    suggestedAction: result.suggestedAction,
    aiExplanation: generateFallbackExplanation(
      { name: existing.name, department: existing.department, year: existing.year },
      result
    ),
  };
}

/** Student ids a given upload log touched, in log order. */
export function affectedStudentIds(record: UploadLog | any): string[] {
  const rawData: any[] = Array.isArray(record?.rawData) ? record.rawData : [];
  const ids: string[] = [];
  for (const row of rawData) {
    const sid = typeof row?.studentId === 'string' ? row.studentId.trim() : '';
    if (sid && !ids.includes(sid)) ids.push(sid);
  }
  return ids;
}

/**
 * Compute the restored records for an upload log.
 *
 * @param record      the upload log being deleted (carries snapshots + rawData)
 * @param detailsById current full records, keyed by student id
 */
export function planUploadRevert(
  record: UploadLog | any,
  detailsById: Record<string, StudentDetail>
): RevertPlan {
  const snapshots = (record?.snapshots ?? null) as Record<string, any> | null;
  const rawData: any[] = Array.isArray(record?.rawData) ? record.rawData : [];

  const rowByStudent = new Map<string, any>();
  for (const row of rawData) {
    const sid = typeof row?.studentId === 'string' ? row.studentId.trim() : '';
    if (!sid) continue;
    if (!rowByStudent.has(sid)) rowByStudent.set(sid, row);
  }

  const updated: StudentDetail[] = [];
  const removedIds: string[] = [];

  for (const [sid, row] of rowByStudent) {
    const snap = snapshots ? snapshots[sid] : undefined;

    // Explicit null snapshot => this upload CREATED the student => remove them
    if (snapshots && snap === null) {
      removedIds.push(sid);
      continue;
    }

    const existing = detailsById[sid];
    if (!existing) continue;

    let restored: StudentDetail;

    if (snap) {
      // Perfect revert to the pre-upload state
      restored = {
        ...existing,
        attendanceHistory: clone(snap.attendanceHistory ?? []),
        subjectAttendance: clone(snap.subjectAttendance ?? []),
        termTests: clone(snap.termTests ?? []),
        backlogCount: snap.backlogCount ?? 0,
        backlogSubjects: clone(snap.backlogSubjects ?? []),
        feeOverdueDays: snap.feeOverdueDays ?? 0,
        feeStatus: snap.feeStatus ?? 'Paid',
        lastSemResult: clone(snap.lastSemResult ?? { score: 0, maxMarks: 0 }),
        endSemResult: clone(snap.endSemResult ?? { status: 'Upcoming' }),
        ...(snap.submissionRate !== undefined ? { submissionRate: snap.submissionRate } : {}),
      };
    } else {
      // Legacy uploads (no snapshot): strip only what that upload introduced
      const week = (typeof row?.week === 'string' && row.week.trim()) || record?.week;
      restored = { ...existing };
      switch (record?.type) {
        case 'WeeklyAttendance':
          restored.attendanceHistory = (existing.attendanceHistory ?? []).filter(h => h.week !== week);
          break;
        case 'UnitTest1':
          restored.termTests = (existing.termTests ?? []).filter(t => t.testName !== 'Unit Test 1');
          break;
        case 'UnitTest2':
          restored.termTests = (existing.termTests ?? []).filter(t => t.testName !== 'Unit Test 2');
          break;
        case 'Backlogs':
          restored.backlogCount = 0;
          restored.backlogSubjects = [];
          break;
        case 'FeeStatus':
          restored.feeOverdueDays = 0;
          restored.feeStatus = 'Paid';
          break;
        case 'LastSemResult':
          restored.lastSemResult = { score: 0, maxMarks: 0 };
          break;
        case 'EndSemResult':
          restored.endSemResult = { status: 'Upcoming' };
          break;
        default:
          break;
      }
    }

    updated.push(recomputeStudentRisk(restored));
  }

  return { updated, removedIds };
}
