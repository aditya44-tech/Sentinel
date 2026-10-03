import { NextResponse } from 'next/server';
import { handle, BadRequest } from '@/lib/http';
import * as store from '@/lib/store';
import { affectedStudentIds, planUploadRevert } from '@/lib/uploadRevert';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  return NextResponse.json(await store.listHistory());
});

export const POST = handle(async (req) => {
  const data = await req.json();
  const record = { ...data, id: data.id || `UPL-${Date.now()}`, createdAt: new Date().toISOString() };
  await store.addHistory(record);
  return NextResponse.json({ success: true, record });
});

export const DELETE = handle(async (req) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const uploadedAt = searchParams.get('uploadedAt');
  const all = searchParams.get('all');

  if (!id && !uploadedAt && all !== 'true') throw new BadRequest('Requires ?id=..., ?uploadedAt=... or ?all=true');

  if (all === 'true') {
    await store.resetAll();
    return NextResponse.json({ success: true });
  }

  const record = id
    ? await store.getHistoryRecord(id)
    : await store.getHistoryByUploadedAt(uploadedAt!);
  if (!record) return NextResponse.json({ success: true, revertedStudentIds: [], removedStudentIds: [] });

  const recordId: string = (record as any).id || id || uploadedAt!;

  const ids = affectedStudentIds(record);
  const currentById: Record<string, any> = {};
  for (const sid of ids) {
    const student = await store.getStudent(sid);
    if (student) currentById[sid] = student;
  }

  const { updated, removedIds } = planUploadRevert(record, currentById);
  if (updated.length > 0) await store.upsertStudents(updated);
  for (const sid of removedIds) await store.deleteStudent(sid);

  await store.deleteHistoryRecord(recordId);

  return NextResponse.json({ success: true, revertedStudentIds: updated.map(s => s.studentId), removedStudentIds: removedIds });
});
