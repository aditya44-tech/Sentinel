import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/http';
import * as store from '@/lib/store';
import { getOutcomeFromStudent } from '@/lib/outcomes';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/interventions/[id]
 *
 * `id` is the studentId.
 * Body: { status?: 'Resolved' | 'Active' }  — defaults to 'Resolved'.
 */
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  let status: 'Resolved' | 'Active' = 'Resolved';
  try {
    const body = await (req as NextRequest).json();
    if (body?.status === 'Active' || body?.status === 'Resolved') {
      status = body.status;
    }
  } catch { /* No body — default to Resolved */ }

  const student = await store.getStudent(id);
  if (!student) throw new HttpError(404, `Student ${id} not found`);

  const patch: Record<string, any> = {
    interventionStatus: status,
  };
  if (student.activeIntervention) {
    patch.activeIntervention = { ...student.activeIntervention, status };
  }

  const updated = await store.patchStudent(id, patch) as unknown as import('@/lib/types').StudentDetail | null;
  const outcome = updated ? getOutcomeFromStudent(updated) : null;
  return NextResponse.json({ success: true, status, outcome });
});
