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

export function getSeedStudents(): StudentDetail[] {
  return Object.values(studentDetailsMap).map(s => ({ ...s }));
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

export function patchStudentMemory(studentId: string, patch: Record<string, any>) {
  const detail = state.details[studentId];
  if (!detail) return null;
  const update = { ...patch };
  if (patch.activeIntervention === null) {
    delete detail.activeIntervention;
    delete update.activeIntervention;
  }
  if (patch.notificationLog) {
    detail.notificationLog = [...(detail.notificationLog || []), ...(Array.isArray(patch.notificationLog) ? patch.notificationLog : [patch.notificationLog])];
    delete update.notificationLog;
  }
  if (patch.contactLog) {
    detail.contactLog = [...(detail.contactLog || []), ...(Array.isArray(patch.contactLog) ? patch.contactLog : [patch.contactLog])];
    delete update.contactLog;
  }
  updateStudentRisk(studentId, update);
  
  if ('interventionStatus' in patch) {
    const status = patch.interventionStatus as import('./types').InterventionStatus;
    const idx = state.students.findIndex(s => s.studentId === studentId);
    if (idx !== -1) state.students[idx].interventionStatus = status;
    detail.interventionStatus = status;
    
    if (detail.activeIntervention) {
      detail.activeIntervention.status = status;
    }
  }

  if (patch.activeIntervention) {
     detail.activeIntervention = patch.activeIntervention;
     if (!patch.interventionStatus) {
         detail.interventionStatus = patch.activeIntervention.status;
         const idx = state.students.findIndex(s => s.studentId === studentId);
         if (idx !== -1) state.students[idx].interventionStatus = patch.activeIntervention.status;
     }
  }
  return detail;
}

export function getIntervention(studentId: string): StudentStatusData | null {
  return state.statuses[studentId] ?? null;
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

