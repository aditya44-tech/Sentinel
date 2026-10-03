import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/http';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const student = await store.getStudent(id);
  if (!student) throw new HttpError(404, 'Student not found');
  return NextResponse.json({ student });
});

export const PATCH = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const updateData = await req.json();
  const student = await store.patchStudent(id, updateData);
  if (!student) throw new HttpError(404, 'Student not found');
  return NextResponse.json({ success: true, student });
});

export const DELETE = handle(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await store.deleteStudent(id);
  return NextResponse.json({ success: true, studentId: id });
});
