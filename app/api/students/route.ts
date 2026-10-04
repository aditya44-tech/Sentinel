import { NextResponse } from 'next/server';
import { handle } from '@/lib/http';
import * as store from '@/lib/store';
import { requireMentor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

import { computeEscalationStep } from '@/lib/counseling';

export const GET = handle(async () => {
  await requireMentor();
  const students = await store.listStudents();
  
  const mapped = students.map((s: any) => {
    if (s.activeIntervention) {
      const lastContactDate = s.contactLog && s.contactLog.length > 0
        ? [...s.contactLog].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
        : null;
        
      const q5Stress = s.counseling?.answers?.find((a: any) => a.questionId === 'Q5')?.rating;

      const escalation = computeEscalationStep(
        s.activeIntervention.assignedDate,
        lastContactDate,
        s.planResponse?.responseType || null, // planResponse.responseType is set when the student responds
        s.riskLevel,
        null, // riskTrend placeholder
        q5Stress
      );
      
      return {
        ...s,
        escalationStatusLabel: escalation.statusLabel,
        isPriority: escalation.isPriority
      };
    }
    return s;
  });

  return NextResponse.json(mapped);
});

export const POST = handle(async (req) => {
  await requireMentor();
  const body = await req.json();
  return NextResponse.json({ ok: true, count: await store.upsertStudents(body) });
});

export const DELETE = handle(async () => {
  await requireMentor();
  await store.resetAll();
  return NextResponse.json({ ok: true });
});
