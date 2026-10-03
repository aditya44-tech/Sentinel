import { NextRequest, NextResponse } from 'next/server';
import { handle, BadRequest } from '@/lib/http';
import * as store from '@/lib/store';
import type { MentorActionPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/interventions — list all students that currently have an intervention */
export const GET = handle(async () => {
  const students = await store.listStudents();
  const interventions = students
    .filter(s => s.interventionStatus && s.interventionStatus !== 'None')
    .map(s => ({ studentId: s.studentId, interventionStatus: s.interventionStatus }));
  return NextResponse.json({ interventions, count: interventions.length });
});

/** POST /api/interventions — assign a new intervention */
export const POST = handle(async (req: Request) => {
  const body = await req.json();
  const payload = body as MentorActionPayload & { baselineRiskScore?: number };

  if (!payload.studentId || !payload.type) throw new BadRequest('studentId and type are required');

  const student = await store.getStudent(payload.studentId);
  if (!student) throw new BadRequest(`Student ${payload.studentId} not found`);

  const baselineRiskScore = typeof payload.baselineRiskScore === 'number'
    ? payload.baselineRiskScore
    : student.riskScore;

  const activeIntervention = {
    type: payload.type,
    details: payload.details ?? {},
    status: 'Active' as const,
    assignedDate: payload.startDate,
    baselineRiskScore,
  };

  await store.patchStudent(payload.studentId, {
    interventionStatus: 'Active',
    activeIntervention,
  });

  return NextResponse.json({ success: true, baselineRiskScore }, { status: 201 });
});
