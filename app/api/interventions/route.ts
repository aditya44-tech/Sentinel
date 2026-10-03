import { NextResponse } from 'next/server';
import { handle, BadRequest } from '@/lib/http';
import * as store from '@/lib/store';
import { countDataPoints } from '@/lib/outcomes';
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

/** POST /api/interventions — assign a new intervention OR log a Notified event */
export const POST = handle(async (req: Request) => {
  const body = await req.json();
  const payload = body as MentorActionPayload & { baselineRiskScore?: number };

  if (!payload.studentId || !payload.type) throw new BadRequest('studentId and type are required');

  const student = await store.getStudent(payload.studentId);
  if (!student) throw new BadRequest(`Student ${payload.studentId} not found`);

  // Notified is a log-only event — append to notificationLog and return
  if (payload.status === 'Notified') {
    const entry = { type: payload.type, details: payload.details, assignedBy: payload.assignedBy, startDate: payload.startDate, at: new Date().toISOString() };
    await store.patchStudent(payload.studentId, { notificationLog: [entry] });
    return NextResponse.json({ success: true, logged: true }, { status: 201 });
  }

  // Freeze the baseline at the server's current score (authoritative after all uploads)
  const baselineRiskScore = typeof payload.baselineRiskScore === 'number'
    ? payload.baselineRiskScore
    : student.riskScore;

  const dataPointsAtAssign = countDataPoints(student);

  const activeIntervention = {
    type: payload.type,
    details: payload.details ?? {},
    status: (payload.status || 'Active') as import('@/lib/types').InterventionStatus,
    assignedDate: payload.startDate,
    baselineRiskScore,
    dataPointsAtAssign,
  };

  await store.patchStudent(payload.studentId, {
    interventionStatus: activeIntervention.status,
    activeIntervention,
  });

  return NextResponse.json({ success: true, baselineRiskScore, activeIntervention }, { status: 201 });
});
