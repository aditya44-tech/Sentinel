/**
 * lib/outcomes.ts
 *
 * Pure function: derive an OutcomeComparisonData object from a StudentDetail record.
 * No store access, no side effects — runs in both client and server contexts.
 */

import type { StudentDetail, OutcomeComparisonData } from './types';

/**
 * Returns a live outcome comparison derived entirely from the student document.
 * Returns null if the student has never had an intervention assigned.
 */
export function getOutcomeFromStudent(student: StudentDetail): OutcomeComparisonData | null {
  const intervention = student.activeIntervention;
  if (!intervention) return null;

  // Baseline must have been frozen at assignment time. If it's missing (legacy
  // record), fall back to the current score so the delta starts at 0.
  const baselineScore = typeof intervention.baselineRiskScore === 'number'
    ? intervention.baselineRiskScore
    : student.riskScore;

  const currentScore = student.riskScore;
  const scoreDelta = currentScore - baselineScore;

  let outcome: 'Improving' | 'No Change' | 'Worsening';
  if (scoreDelta < -2) outcome = 'Improving';
  else if (scoreDelta > 2) outcome = 'Worsening';
  else outcome = 'No Change';

  // Find the most recent data date
  let latestDataDate = intervention.assignedDate;
  let hasNewData = false;

  if ((student.attendanceHistory ?? []).length > 0) {
    hasNewData = true;
    latestDataDate = 'latest-upload';
  }
  for (const test of (student.termTests ?? [])) {
    if (test.date && test.date > latestDataDate) {
      latestDataDate = test.date;
      hasNewData = true;
    }
  }

  const checkpointDate = hasNewData
    ? (latestDataDate === 'latest-upload' ? new Date().toISOString().split('T')[0] : latestDataDate)
    : '__awaiting__';

  return {
    studentId: student.studentId,
    name: student.name,
    intervention: {
      type: intervention.type,
      details: intervention.details,
      startDate: intervention.assignedDate,
    },
    baselineScore,
    currentScore,
    scoreDelta,
    outcome,
    checkpointDate,
    status: intervention.status,
  };
}
