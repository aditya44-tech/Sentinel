/**
 * lib/outcomes.ts
 *
 * Pure functions: derive OutcomeComparisonData from a StudentDetail record.
 * No store access, no side effects — runs in both client and server contexts.
 */

import type { StudentDetail, OutcomeComparisonData } from './types';

/**
 * Count the total number of data points (attendance weeks + term tests) currently
 * on the student record. Stored at assignment time as dataPointsAtAssign so we
 * know whether any new data has arrived since the intervention started.
 */
export function countDataPoints(student: StudentDetail): number {
  return (student.attendanceHistory ?? []).length + (student.termTests ?? []).length;
}

/**
 * Returns true when data has arrived after the intervention was assigned.
 * Legacy plans without dataPointsAtAssign are treated as having new data
 * (we don't know when they were created, so we show whatever we have).
 */
export function hasNewDataSinceAssign(student: StudentDetail): boolean {
  const intervention = student.activeIntervention;
  if (!intervention) return false;
  if (typeof intervention.dataPointsAtAssign !== 'number') {
    // Legacy plan: count as having new data rather than showing __awaiting__ forever
    return countDataPoints(student) > 0;
  }
  return countDataPoints(student) > intervention.dataPointsAtAssign;
}

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

  // Determine checkpoint date using dataPointsAtAssign for precision
  let checkpointDate: string;
  if (!hasNewDataSinceAssign(student)) {
    checkpointDate = '__awaiting__';
  } else {
    // Find the most recent data date
    let latestDataDate = intervention.assignedDate;
    for (const h of (student.attendanceHistory ?? [])) {
      // attendance entries don't carry a date field, use today
      latestDataDate = new Date().toISOString().split('T')[0];
    }
    for (const test of (student.termTests ?? [])) {
      if (test.date && test.date > latestDataDate) latestDataDate = test.date;
    }
    checkpointDate = latestDataDate;
  }

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
