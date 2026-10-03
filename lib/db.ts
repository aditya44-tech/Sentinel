/**
 * lib/db.ts
 * 
 * In-memory data store for the prototype.
 * All 50 students are seeded from lib/mockData.ts on first access.
 * 
 * When MONGODB_URI is set, this module will switch to MongoDB via Mongoose.
 * For the hackathon demo, in-memory is sufficient and zero-config.
 */

import type { StudentSummary, StudentDetail, StudentStatusData, OutcomeComparisonData, MentorActionPayload, UploadLog } from './types';
import { initialStudents, studentDetailsMap, studentStatusMap, outcomeComparisonsMap, seededBaselineScores } from './mockData';
import { planUploadRevert } from './uploadRevert';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (persists for the lifetime of the Next.js server process)
// ─────────────────────────────────────────────────────────────────────────────

// The actual store lives on globalThis — see "Shared store" below.

// Intervention log (list of all assigned interventions)
interface InterventionRecord {
  id: string;
  studentId: string;
  type: string;
  details: Record<string, unknown>;
  notes: string;
  assignedBy: string;
  startDate: string;
  baselineRiskScore: number;
  status: 'Active' | 'Resolved' | 'Discontinued';
  createdAt: string;
}

const INITIAL_INTERVENTIONS: InterventionRecord[] = [
  // Pre-seeded demo interventions matching mockData
  {
    id: 'INT-S006-001',
    studentId: 'S006',
    type: 'Extra Class',
    details: { subject: 'Data Structures & DBMS', schedule: 'Tue/Thu 4:00 PM', instructor: 'Dr. Mehta' },
    notes: 'Student has 3 backlogs and declining attendance: extra class for core subjects.',
    assignedBy: 'mentor-demo',
    startDate: '2026-09-02',
    baselineRiskScore: seededBaselineScores.S006,
    status: 'Active',
    createdAt: '2026-09-02T09:00:00.000Z',
  },
  {
    id: 'INT-S019-001',
    studentId: 'S019',
    type: 'Counseling',
    details: { schedule: 'Mon 3:00 PM', instructor: 'Counselor Priya' },
    notes: 'Rapid attendance decline over 4 weeks. Financial stress likely contributing.',
    assignedBy: 'mentor-demo',
    startDate: '2026-09-05',
    baselineRiskScore: seededBaselineScores.S019,
    status: 'Active',
    createdAt: '2026-09-05T10:00:00.000Z',
  },
  {
    id: 'INT-S022-001',
    studentId: 'S022',
    type: 'Academic Support',
    details: { subject: 'DS, Computational Math, DBMS', schedule: 'Wed/Fri 5:00 PM' },
    notes: 'Academic support plan for repeated backlog subjects.',
    assignedBy: 'mentor-demo',
    startDate: '2026-09-03',
    baselineRiskScore: seededBaselineScores.S022,
    status: 'Active',
    createdAt: '2026-09-03T11:00:00.000Z',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared store
//
// Next.js evaluates this module more than once: once per route bundle, and
// again on every hot reload. Keeping the state on globalThis means the students,
// interventions, outcomes and history routes all read and write the *same*
// objects, so a change made through one endpoint (e.g. resolving an
// intervention) is immediately visible through the others instead of sitting in
// a private copy. It also survives a hot reload.
// ─────────────────────────────────────────────────────────────────────────────

interface DbState {
  students: StudentSummary[];
  details: Record<string, StudentDetail>;
  statuses: Record<string, StudentStatusData>;
  outcomes: Record<string, OutcomeComparisonData>;
  interventions: InterventionRecord[];
  history: any[];
}

const globalStore = globalThis as unknown as { __sentinelDb?: DbState };

const state: DbState = globalStore.__sentinelDb ?? (globalStore.__sentinelDb = {
  students: [...initialStudents],
  details: { ...studentDetailsMap },
  statuses: { ...studentStatusMap },
  outcomes: { ...outcomeComparisonsMap },
  interventions: [...INITIAL_INTERVENTIONS],
  history: [],
});

// ─────────────────────────────────────────────────────────────────────────────
// DB API
// ─────────────────────────────────────────────────────────────────────────────

export function getAllStudents(): StudentSummary[] {
  return state.students;
}

export function getStudentDetail(studentId: string): StudentDetail | null {
  return state.details[studentId] ?? null;
}

export function updateStudentRisk(studentId: string, update: Partial<StudentDetail>): void {
  if (state.details[studentId]) {
    state.details[studentId] = { ...state.details[studentId], ...update };
  }
  const idx = state.students.findIndex(s => s.studentId === studentId);
  if (idx !== -1) {
    state.students[idx] = {
      ...state.students[idx],
      riskScore: update.riskScore ?? state.students[idx].riskScore,
      riskLevel: update.riskLevel ?? state.students[idx].riskLevel,
    };
  }
}

export function getIntervention(studentId: string): StudentStatusData | null {
  return state.statuses[studentId] ?? null;
}

export function getAllInterventions(): InterventionRecord[] {
  return state.interventions;
}

export function createIntervention(payload: MentorActionPayload, baselineRiskScore: number): InterventionRecord {
  const id = `INT-${payload.studentId}-${Date.now()}`;
  const record: InterventionRecord = {
    id,
    studentId: payload.studentId,
    type: payload.type,
    details: payload.details as Record<string, unknown>,
    notes: payload.notes,
    assignedBy: payload.assignedBy,
    startDate: payload.startDate,
    baselineRiskScore,
    status: 'Active',
    createdAt: new Date().toISOString(),
  };
  state.interventions.push(record);

  // Update student summary status
  const idx = state.students.findIndex(s => s.studentId === payload.studentId);
  if (idx !== -1) state.students[idx].interventionStatus = 'Active';

  const detail = state.details[payload.studentId];

  // The live intervention lives on the student record itself, with the baseline
  // frozen at assignment time. This is what the profile and outcome pages read.
  const activeIntervention: import('./types').StudentActiveIntervention = {
    type: payload.type,
    details: payload.details as { [k: string]: unknown },
    status: 'Active' as import('./types').InterventionStatus,
    assignedDate: payload.startDate,
    baselineRiskScore,
  };

  if (detail) {
    detail.activeIntervention = activeIntervention;
    detail.interventionStatus = 'Active';
  }

  // Update intervention status store (for student view)
  state.statuses[payload.studentId] = {
    studentId: payload.studentId,
    name: detail?.name ?? '',
    activeIntervention,
  };

  // Store only the immutable baseline: current score will be recalculated at read time
  state.outcomes[payload.studentId] = {
    studentId: payload.studentId,
    name: detail?.name ?? '',
    intervention: { type: payload.type, details: payload.details, startDate: payload.startDate },
    baselineScore: baselineRiskScore,
    currentScore: baselineRiskScore,  // placeholder; overwritten in getOutcome
    scoreDelta: 0,
    outcome: 'No Change',
    checkpointDate: payload.startDate,
    status: 'Active',
  };

  return record;
}

/**
 * Returns the risk score recorded when the intervention was assigned.
 *
 * The baseline is written once, at assignment. Records that predate that (legacy
 * in-memory or Mongo documents) get the CURRENT score frozen in exactly once, so
 * "before" stops moving instead of silently tracking the current score forever.
 */
export function ensureBaseline(studentId: string): number | null {
  const detail = state.details[studentId];
  const statusEntry = state.statuses[studentId];
  const intervention = detail?.activeIntervention ?? statusEntry?.activeIntervention ?? null;
  if (!intervention) return null;

  if (typeof intervention.baselineRiskScore === 'number') {
    return intervention.baselineRiskScore;
  }

  const baseline = detail?.riskScore ?? 0;
  intervention.baselineRiskScore = baseline;

  if (statusEntry?.activeIntervention && statusEntry.activeIntervention !== intervention) {
    statusEntry.activeIntervention.baselineRiskScore = baseline;
  }

  const storedOutcome = state.outcomes[studentId];
  if (storedOutcome) storedOutcome.baselineScore = baseline;

  return baseline;
}

export function resolveIntervention(studentId: string): void {
  setInterventionStatus(studentId, 'Resolved');

  const log = state.interventions.find(i => i.studentId === studentId && i.status === 'Active');
  if (log) log.status = 'Resolved';
}

export function reopenIntervention(studentId: string): void {
  setInterventionStatus(studentId, 'Active');

  const log = [...state.interventions].reverse().find(i => i.studentId === studentId);
  if (log) log.status = 'Active';
}

/**
 * Flip the intervention lifecycle state on every place it is stored: the student
 * summary, the full student record (including `activeIntervention`), the
 * student-facing status store and the cached outcome.
 */
function setInterventionStatus(studentId: string, status: 'Active' | 'Resolved'): void {
  const idx = state.students.findIndex(s => s.studentId === studentId);
  if (idx !== -1) state.students[idx].interventionStatus = status;

  const detail = state.details[studentId];
  if (detail) {
    detail.interventionStatus = status;
    if (detail.activeIntervention) {
      detail.activeIntervention = { ...detail.activeIntervention, status: status as import('./types').InterventionStatus };
    }
  }

  const statusEntry = state.statuses[studentId];
  if (statusEntry?.activeIntervention) {
    statusEntry.activeIntervention.status = status as import('./types').InterventionStatus;
  }

  const storedOutcome = state.outcomes[studentId];
  if (storedOutcome) storedOutcome.status = status;
}

export function getOutcome(studentId: string): OutcomeComparisonData | null {
  const studentDetail = state.details[studentId];
  const statusEntry = state.statuses[studentId];

  // The baseline is authoritative and immutable — it is never re-derived from
  // the current score. No intervention, no comparison.
  const baselineScore = ensureBaseline(studentId);
  if (baselineScore === null) return null;

  let stored = state.outcomes[studentId];

  // Synthesize a record for interventions that were stored without one
  // (legacy records, or pre-seeded via studentStatusMap).
  if (!stored) {
    const intervention = studentDetail?.activeIntervention ?? statusEntry?.activeIntervention;
    if (!intervention) return null;

    stored = {
      studentId,
      name: studentDetail?.name ?? statusEntry?.name ?? studentId,
      intervention: {
        type: intervention.type,
        details: intervention.details,
        startDate: intervention.assignedDate,
      },
      baselineScore,
      currentScore: baselineScore,
      scoreDelta: 0,
      outcome: 'No Change',
      checkpointDate: intervention.assignedDate,
      status: intervention.status,
    };
  }

  const status =
    studentDetail?.activeIntervention?.status ??
    statusEntry?.activeIntervention?.status ??
    stored.status ??
    'Active';

  // Recalculate current score live from the latest student data
  const currentScore = studentDetail?.riskScore ?? baselineScore;
  const scoreDelta = currentScore - baselineScore;

  let outcome: 'Improving' | 'No Change' | 'Worsening';
  if (scoreDelta < -2) outcome = 'Improving';
  else if (scoreDelta > 2) outcome = 'Worsening';
  else outcome = 'No Change';

  // Find the most recent data date from attendance history or term tests
  let latestDataDate = stored.intervention.startDate;
  let hasNewData = false;

  if (studentDetail) {
    if ((studentDetail.attendanceHistory ?? []).length > 0) {
      hasNewData = true;
      latestDataDate = 'latest-upload';
    }
    for (const test of (studentDetail.termTests ?? [])) {
      if (test.date && test.date > latestDataDate) {
        latestDataDate = test.date;
        hasNewData = true;
      }
    }
  }

  // If no new data has arrived since the intervention, flag the checkpoint specially
  const checkpointDate = hasNewData
    ? (latestDataDate === 'latest-upload' ? new Date().toISOString().split('T')[0] : latestDataDate)
    : '__awaiting__';

  return {
    ...stored,
    baselineScore,
    currentScore,
    scoreDelta,
    outcome,
    checkpointDate,
    status,
  };
}

export function bulkUpdateStudents(
  updates: Array<{ studentId: string; detail: Partial<StudentDetail> }>
): number {
  let count = 0;
  for (const { studentId, detail } of updates) {
    updateStudentRisk(studentId, detail);
    count++;
  }
  return count;
}

export function upsertStudent(student: any): void {
  const sid = student.studentId;
  if (!sid) return;

  const existing = state.details[sid] || {};
  state.details[sid] = {
    ...existing,
    ...student,
  };

  const summaryItem: StudentSummary = {
    studentId: sid,
    name: student.name ?? existing.name ?? sid,
    department: student.department ?? existing.department ?? 'Computer Science',
    year: student.year ?? existing.year ?? 1,
    riskScore: student.riskScore ?? existing.riskScore ?? 0,
    riskLevel: student.riskLevel ?? existing.riskLevel ?? 'Low',
    interventionStatus: student.interventionStatus ?? existing.interventionStatus ?? 'None',
  };

  const idx = state.students.findIndex(s => s.studentId === sid);
  if (idx !== -1) {
    state.students[idx] = summaryItem;
  } else {
    state.students.push(summaryItem);
  }
}

export function bulkUpsertStudents(students: any[]): number {
  let count = 0;
  for (const s of students) {
    upsertStudent(s);
    count++;
  }
  return count;
}

/**
 * Full reset: students, their details, interventions, outcomes, the
 * student-facing status store and the upload history all go away, and the
 * seeded demo templates are stripped of interventions so a later re-upload can
 * never resurrect an old "Active"/"Resolved" plan.
 *
 * Mutate in place: every route bundle holds a reference to these objects, so
 * replacing them would leave other bundles serving stale data.
 */
export function resetAllData(): void {
  // Remove seeded interventions from the templates FIRST. The template detail
  // objects are shared with `state.details`, so any record still referencing
  // them must be cleaned before the stores are emptied.
  for (const sid of Object.keys(studentDetailsMap)) {
    const template = studentDetailsMap[sid];
    delete template.activeIntervention;
    template.interventionStatus = 'None';
  }
  for (const sid of Object.keys(studentStatusMap)) {
    delete studentStatusMap[sid];
  }
  for (const sid of Object.keys(outcomeComparisonsMap)) {
    delete outcomeComparisonsMap[sid];
  }
  for (const summary of initialStudents) {
    summary.interventionStatus = 'None';
  }

  state.students.length = 0;
  for (const key of Object.keys(state.details)) delete state.details[key];
  state.interventions.length = 0;
  for (const key of Object.keys(state.statuses)) delete state.statuses[key];
  for (const key of Object.keys(state.outcomes)) delete state.outcomes[key];
  state.history.length = 0;
}

/** Kept for existing callers: resetting students means resetting everything. */
export function clearAllStudents(): void {
  resetAllData();
}

/**
 * True when the store holds no students at all. Used to tell "this record was
 * wiped by a reset" apart from "this student was never uploaded".
 */
export function isStoreEmpty(): boolean {
  return state.students.length === 0 && Object.keys(state.details).length === 0;
}

export function getUploadHistory(): any[] {
  return state.history;
}

/** Remove history entries in place, so all route bundles see the same list. */
function removeHistoryWhere(predicate: (record: any) => boolean): void {
  for (let i = state.history.length - 1; i >= 0; i--) {
    if (predicate(state.history[i])) state.history.splice(i, 1);
  }
}

export function addUploadHistory(record: any): any {
  const newRec = {
    id: record.id || `UPL-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...record,
  };
  state.history.unshift(newRec);
  return newRec;
}

export function getUploadRecord(opts: { id?: string; uploadedAt?: string }): UploadLog | null {
  if (opts.id) return state.history.find(u => u.id === opts.id) ?? null;
  if (opts.uploadedAt) return state.history.find(u => u.uploadedAt === opts.uploadedAt) ?? null;
  return null;
}

export function deleteUploadHistory(id?: string, uploadedAt?: string): void {
  if (id) {
    removeHistoryWhere(u => u.id === id);
  } else if (uploadedAt) {
    removeHistoryWhere(u => u.uploadedAt === uploadedAt);
  } else {
    state.history.length = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload revert
//
// Deleting an upload log must roll the student data back to exactly the state
// it was in before that upload touched it. The server (not the client) owns the
// full student records, so the revert happens here and is authoritative.
// ─────────────────────────────────────────────────────────────────────────────

export interface RevertResult {
  revertedStudents: StudentDetail[];
  removedStudentIds: string[];
}

/** Remove a student from both stores (used when an upload that created them is deleted). */
export function deleteStudent(studentId: string): boolean {
  const existed = Boolean(state.details[studentId]);
  delete state.details[studentId];
  const idx = state.students.findIndex(s => s.studentId === studentId);
  if (idx !== -1) state.students.splice(idx, 1);
  return existed || idx !== -1;
}

/**
 * Roll student data back to its pre-upload state using the log's snapshots.
 * Students that the upload created are removed entirely.
 */
export function revertUpload(record: UploadLog | any): RevertResult {
  const plan = planUploadRevert(record, state.details);

  for (const sid of plan.removedIds) {
    deleteStudent(sid);
  }

  for (const student of plan.updated) {
    state.details[student.studentId] = student;

    const idx = state.students.findIndex(s => s.studentId === student.studentId);
    if (idx !== -1) {
      state.students[idx] = {
        ...state.students[idx],
        riskScore: student.riskScore,
        riskLevel: student.riskLevel,
      };
    }
  }

  return { revertedStudents: plan.updated, removedStudentIds: plan.removedIds };
}

