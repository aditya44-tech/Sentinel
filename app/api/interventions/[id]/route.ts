import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/http';
import * as store from '@/lib/store';
import { getOutcomeFromStudent } from '@/lib/outcomes';
import type { StudentDetail } from '@/lib/types';
import { requireMentor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/interventions/[id]
 *
 * Body: { action: 'resolve' | 'reopen' }
 * Writes both interventionStatus AND activeIntervention.status in one patchStudent call.
 * Never changes the baseline.
 */
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireMentor();
  const { id } = await params;
  let action: 'resolve' | 'reopen' = 'resolve';
  try {
    const body = await (req as NextRequest).json();
    if (body?.action === 'reopen') action = 'reopen';
    // Legacy: also accept status field for backwards compat
    if (body?.status === 'Active') action = 'reopen';
    if (body?.status === 'Resolved') action = 'resolve';
  } catch { /* No body — default to resolve */ }

  const newStatus = action === 'resolve' ? 'Resolved' : 'Active';

  const student = await store.getStudent(id);
  if (!student) throw new HttpError(404, `Student ${id} not found`);

  const patch: Record<string, any> = { interventionStatus: newStatus };
  if (student.activeIntervention) {
    // Never touch baselineRiskScore — only flip status
    patch.activeIntervention = { ...student.activeIntervention, status: newStatus };
  }

  const updated = await store.patchStudent(id, patch) as unknown as StudentDetail | null;
  const outcome = updated ? getOutcomeFromStudent(updated) : null;
  return NextResponse.json({ success: true, status: newStatus, outcome, student: updated });
});
