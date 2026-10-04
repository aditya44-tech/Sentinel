import { connect } from './dbConnect';
import { Student, UploadHistory, Meta } from './models';
import * as mem from './db';
import { BadRequest, StorageUnavailable } from './http';
import type { StudentDetail, UploadLog } from './types';

export const usingMongo = () => Boolean(process.env.MONGODB_URI);

async function db() {
  try { await connect(); } catch { throw new StorageUnavailable(); }
}

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
export function cleanId(v: unknown): string {
  if (typeof v !== 'string' || !ID_RE.test(v)) throw new BadRequest('Invalid studentId');
  return v;
}

const SUMMARY_PROJECTION = { studentId: 1, name: 1, department: 1, year: 1, riskScore: 1, riskLevel: 1, interventionStatus: 1, escalationStatusLabel: 1, isPriority: 1, activeIntervention: 1, contactLog: 1, planResponse: 1, counseling: 1, _id: 0 };

async function ensureSeeded() {
  if (process.env.SEED_DEMO === 'false') return;
  let prev;
  try {
    prev = await Meta.findOneAndUpdate({ key: 'seeded' }, { $setOnInsert: { value: true } }, { upsert: true, new: false });
  } catch (e: any) { if (e?.code === 11000) return; throw e; }
  if (prev) return;
  try {
    await Student.bulkWrite(mem.getSeedStudents().map((s: StudentDetail) => ({
      updateOne: { filter: { studentId: s.studentId }, update: { $setOnInsert: s }, upsert: true },
    })), { ordered: false });
  } catch (e) {
    await Meta.deleteOne({ key: 'seeded' });
    throw e;
  }
}

export async function listStudents() {
  if (!usingMongo()) return mem.getAllStudents();
  await db(); await ensureSeeded();
  return Student.find({}, SUMMARY_PROJECTION).lean();
}

export async function getStudent(id: string): Promise<StudentDetail | null> {
  const studentId = cleanId(id);
  if (!usingMongo()) return mem.getStudentDetail(studentId) ?? null;
  await db();
  return (await Student.findOne({ studentId }).lean()) as unknown as StudentDetail | null;
}

export async function upsertStudents(list: unknown) {
  if (!Array.isArray(list) || list.length === 0 || list.length > 500) throw new BadRequest('Expected 1-500 students');
  const clean = list.map((s: any) => {
    const { _id, __v, createdAt, updatedAt, ...rest } = s ?? {};
    return { ...rest, studentId: cleanId(rest.studentId) } as StudentDetail;
  });
  // DEBUG: log attendanceHistory length for first student
  if (clean[0]) {
    const hist = (clean[0] as any).attendanceHistory ?? [];
    console.log(`[store.upsertStudents] ${clean[0].studentId} attendanceHistory.length=${hist.length}`, hist.map((h: any) => h.week).join(','));
  }
  if (!usingMongo()) { mem.bulkUpsertStudents(clean); return clean.length; }
  await db();
  await Student.bulkWrite(clean.map(s => ({
    updateOne: { filter: { studentId: s.studentId }, update: { $set: s }, upsert: true },
  })), { ordered: false });
  return clean.length;
}

const PATCHABLE = ['interventionStatus', 'activeIntervention', 'aiExplanation', 'riskScore', 'riskLevel',
                   'contributingFactors', 'suggestedAction', 'submissionRate', 'escalationStatusLabel', 'isPriority', 'planResponse'] as const;

export async function patchStudent(id: string, patch: Record<string, any>) {
  const studentId = cleanId(id);
  const $set: Record<string, unknown> = {};
  for (const k of PATCHABLE) if (k in patch) $set[k] = patch[k];
  const update: any = {};
  if (patch.activeIntervention === null) { delete $set.activeIntervention; update.$unset = { activeIntervention: '' }; }
  if (Object.keys($set).length) update.$set = $set;
  if (patch.notificationLog) update.$push = { ...(update.$push || {}), notificationLog: { $each: patch.notificationLog } }; // Append
  if (patch.contactLog) update.$push = { ...(update.$push || {}), contactLog: { $each: patch.contactLog } }; // Append
  if (!Object.keys(update).length) throw new BadRequest('Nothing to update');
  
  if (!usingMongo()) return mem.patchStudentMemory(studentId, patch);
  
  await db();
  return Student.findOneAndUpdate({ studentId }, update, { new: true, runValidators: true }).lean();
}

export async function deleteStudent(id: string) {
  const studentId = cleanId(id);
  if (!usingMongo()) return mem.deleteStudent(studentId);
  await db(); await Student.deleteOne({ studentId });
}

export async function listHistory() {
  if (!usingMongo()) return mem.getUploadHistory();
  await db(); return UploadHistory.find({}).sort({ uploadedAt: -1 }).lean();
}

export async function addHistory(log: UploadLog) {
  if (!usingMongo()) return mem.addUploadHistory(log);
  await db(); await UploadHistory.create(log);
}

export async function getHistoryRecord(id: string) {
  if (!usingMongo()) return mem.getUploadRecord({ id });
  await db(); return UploadHistory.findOne({ id: String(id) }).lean();
}

export async function getHistoryByUploadedAt(uploadedAt: string) {
  if (!usingMongo()) return mem.getUploadRecord({ uploadedAt });
  await db(); return UploadHistory.findOne({ uploadedAt: String(uploadedAt) }).lean();
}

export async function deleteHistoryRecord(id: string) {
  if (!usingMongo()) return mem.deleteUploadHistory(id);
  await db(); await UploadHistory.deleteOne({ id: String(id) });
}

export async function resetAll() {
  if (!usingMongo()) return mem.resetAllData();
  await db();
  await Promise.all([
    Student.deleteMany({}),
    UploadHistory.deleteMany({}),
    Meta.updateOne({ key: 'seeded' }, { $set: { value: true } }, { upsert: true }),
  ]);
}
