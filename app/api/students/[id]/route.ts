import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/http';
import * as store from '@/lib/store';
import { requireMentor, requireMentorOrSelf } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireMentorOrSelf(id);
  const student = await store.getStudent(id);
  if (!student) throw new HttpError(404, 'Student not found');
  return NextResponse.json({ student });
});

export const PATCH = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireMentor();
  const updateData = await req.json();
  const student = await store.patchStudent(id, updateData);
  if (!student) throw new HttpError(404, 'Student not found');
  return NextResponse.json({ success: true, student });
});

export const DELETE = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireMentor();
  await store.deleteStudent(id);
  return NextResponse.json({ success: true, studentId: id });
});
