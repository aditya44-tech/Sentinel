import { NextRequest, NextResponse } from 'next/server';
import { createIntervention, getAllInterventions, getStudentDetail } from '@/lib/db';
import { MentorActionPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/interventions: list all intervention records
export async function GET() {
  const interventions = getAllInterventions();
  return NextResponse.json({ interventions, count: interventions.length });
}

// POST /api/interventions: assign a new intervention
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = body as MentorActionPayload;

    if (!payload.studentId || !payload.type) {
      return NextResponse.json({ error: 'studentId and type are required' }, { status: 400 });
    }

    const studentDetail = getStudentDetail(payload.studentId);
    if (!studentDetail) {
      return NextResponse.json({ error: `Student ${payload.studentId} not found` }, { status: 404 });
    }

    // Prefer the baseline score sent by the client: the client always has the
    // most up-to-date score (e.g. after a CSV upload) even if the server's
    // in-memory state hasn't been synced yet.
    const baselineRiskScore = typeof payload.baselineRiskScore === 'number'
      ? payload.baselineRiskScore
      : studentDetail.riskScore;
    const record = createIntervention(payload, baselineRiskScore);

    return NextResponse.json({
      success: true,
      intervention: record,
      baselineRiskScore,
    }, { status: 201 });

  } catch (error) {
    console.error('[API /interventions POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

