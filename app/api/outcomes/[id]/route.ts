import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/http';
import * as store from '@/lib/store';
import { getOutcomeFromStudent } from '@/lib/outcomes';

export const dynamic = 'force-dynamic';

/** GET /api/outcomes/[id] — derive the outcome comparison from the student record */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await (params as any);
  const student = await store.getStudent(id);
  if (!student) throw new HttpError(404, `Student ${id} not found`);

  const outcome = getOutcomeFromStudent(student);
  if (!outcome) throw new HttpError(404, `No outcome data for student ${id}`);

  return NextResponse.json({ outcome });
});
