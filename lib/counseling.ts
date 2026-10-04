/**
 * lib/counseling.ts
 *
 * Pure, deterministic counseling scoring functions.
 * No browser APIs, no import.meta.env — runs in both server and client contexts.
 *
 * Scoring rules:
 *   Q1 score = round(60 * reasonSeverity)
 *   Q2 score = 10 if motivation <= 2 else 0
 *   Q3 score = 10 if belonging <= 2 else 0
 *   Q4 score = 10 if careerClarity <= 2 else 0
 *   Q5 score = 10 if stress >= 4 else 0
 *   counselingRiskScore = Q1+Q2+Q3+Q4+Q5 (0..100)
 *
 *   V = counselingRiskScore / 100
 *   multiplier = 1 + 0.5*V
 *   floorApplies = reason in {forced_admission, not_interested} && weakCount >= 2
 *   floorMin = min(60, round(30 + 30*V))
 *
 *   final = min(100, round(academicScore * multiplier))
 *   if floorApplies: final = max(final, floorMin)
 *   Counseling alone caps final at 60 (upper Medium). High needs real academic signals.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ReasonCode =
  | 'forced_admission'
  | 'not_interested'
  | 'financial'
  | 'family'
  | 'health_wellbeing'
  | 'adjustment'
  | 'academic_difficulty'
  | 'peer_social'
  | 'other';

export const REASON_TEXT_TO_CODE: Record<string, ReasonCode> = {
  'Forced or pressured admission': 'forced_admission',
  'Not interested in the course or branch': 'not_interested',
  'Financial stress': 'financial',
  'Family problems': 'family',
  'Health or mental well-being': 'health_wellbeing',
  'Adjustment problems': 'adjustment',
  'Academic difficulty': 'academic_difficulty',
  'Peer or social issues': 'peer_social',
  'Other': 'other',
};

export const REASON_CODE_TO_TEXT: Record<ReasonCode, string> = {
  forced_admission: 'Forced or pressured admission',
  not_interested: 'Not interested in the course or branch',
  financial: 'Financial stress',
  family: 'Family problems',
  health_wellbeing: 'Health or mental well-being',
  adjustment: 'Adjustment problems',
  academic_difficulty: 'Academic difficulty',
  peer_social: 'Peer or social issues',
  other: 'Other',
};

/** Q2-Q5 answer text → numeric rating (1-5) */
export const Q_ANSWER_TO_RATING: Record<string, Record<number, number>> = {
  Q2: {
    1: 1, // parsed by text lookup below
  },
};

/** All valid Q1 answer texts (9 options) */
export const Q1_VALID_ANSWERS = Object.keys(REASON_TEXT_TO_CODE);

/** Q2-Q5: text → numeric (1–5) */
export const Q2_TEXT_TO_RATING: Record<string, number> = {
  'Not at all motivated': 1,
  'Slightly motivated': 2,
  'Moderately motivated': 3,
  'Quite motivated': 4,
  'Very motivated': 5,
};
export const Q3_TEXT_TO_RATING: Record<string, number> = {
  'Not connected at all': 1,
  'Slightly connected': 2,
  'Moderately connected': 3,
  'Quite connected': 4,
  'Very connected': 5,
};
export const Q4_TEXT_TO_RATING: Record<string, number> = {
  'Not clear at all': 1,
  'Slightly clear': 2,
  'Somewhat clear': 3,
  'Quite clear': 4,
  'Very clear': 5,
};
export const Q5_TEXT_TO_RATING: Record<string, number> = {
  'Not stressed': 1,
  'Slightly stressed': 2,
  'Moderately stressed': 3,
  'Quite stressed': 4,
  'Extremely stressed': 5,
};

/** Per-question answer-text lookup tables */
export const Q_TEXT_TO_RATING_MAP: Record<string, Record<string, number>> = {
  Q2: Q2_TEXT_TO_RATING,
  Q3: Q3_TEXT_TO_RATING,
  Q4: Q4_TEXT_TO_RATING,
  Q5: Q5_TEXT_TO_RATING,
};

export interface CounselingQuestionAnswer {
  questionId: string; // Q1..Q5
  answerText: string;
  rating: number | null; // numeric 1-5 (null for Q1)
  reasonCode?: ReasonCode; // Q1 only
  qScore: number; // contribution to counselingRiskScore
}

export interface CounselingRecord {
  studentId: string;
  name: string;
  counselingDate: string;
  answers: CounselingQuestionAnswer[]; // Q1..Q5 in order
  studentSaid: string;
  mentorNotes: string;
  otherText: string;
  /** Recomputed by app (never taken from CSV). */
  counselingRiskScore: number;
  counselingLevel: 'Low' | 'Medium' | 'High';
  scoreMultiplier: number;
  floorApplies: boolean;
  floorMinScore: number;
  /** The reason code parsed from Q1 */
  reasonCode: ReasonCode;
}

export interface ContactRecord {
  studentId: string;
  name: string;
  studentEmail: string;
  studentPhone: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
}

export interface ContactLogEntry {
  date: string;
  channel: 'Phone' | 'WhatsApp' | 'Email' | 'In-person' | 'Other';
  personContacted: 'Student' | 'Parent' | 'Coordinator' | 'HOD' | 'Welfare Cell' | 'Other';
  outcome: string;
  note: string;
  loggedBy?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reason severity
// ─────────────────────────────────────────────────────────────────────────────

export const REASON_SEVERITY: Record<ReasonCode, number> = {
  forced_admission: 1.0,
  not_interested: 0.9,
  financial: 0.7,
  family: 0.7,
  health_wellbeing: 0.7,
  adjustment: 0.4,
  academic_difficulty: 0.4,
  peer_social: 0.4,
  other: 0.2,
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-question scoring
// ─────────────────────────────────────────────────────────────────────────────

export function scoreQ1(reasonCode: ReasonCode): number {
  return Math.round(60 * REASON_SEVERITY[reasonCode]);
}

export function scoreQ2(motivation: number): number {
  return motivation <= 2 ? 10 : 0;
}

export function scoreQ3(belonging: number): number {
  return belonging <= 2 ? 10 : 0;
}

export function scoreQ4(careerClarity: number): number {
  return careerClarity <= 2 ? 10 : 0;
}

export function scoreQ5(stress: number): number {
  return stress >= 4 ? 10 : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main counseling score computation
// ─────────────────────────────────────────────────────────────────────────────

export interface CounselingScoreResult {
  q1Score: number;
  q2Score: number;
  q3Score: number;
  q4Score: number;
  q5Score: number;
  counselingRiskScore: number;
  counselingLevel: 'Low' | 'Medium' | 'High';
  scoreMultiplier: number;
  floorApplies: boolean;
  floorMinScore: number;
  weakCount: number;
}

export function computeCounselingScore(
  reasonCode: ReasonCode,
  motivation: number,
  belonging: number,
  careerClarity: number,
  stress: number
): CounselingScoreResult {
  const q1Score = scoreQ1(reasonCode);
  const q2Score = scoreQ2(motivation);
  const q3Score = scoreQ3(belonging);
  const q4Score = scoreQ4(careerClarity);
  const q5Score = scoreQ5(stress);

  const counselingRiskScore = Math.min(100, q1Score + q2Score + q3Score + q4Score + q5Score);

  const counselingLevel: 'Low' | 'Medium' | 'High' =
    counselingRiskScore >= 61 ? 'High' : counselingRiskScore >= 31 ? 'Medium' : 'Low';

  const V = counselingRiskScore / 100;
  const scoreMultiplier = Math.round((1 + 0.5 * V) * 100) / 100;

  const weakCount = [q2Score, q3Score, q4Score, q5Score].filter(s => s === 10).length;
  const floorApplies =
    (reasonCode === 'forced_admission' || reasonCode === 'not_interested') && weakCount >= 2;
  const floorMinScore = Math.min(60, Math.round(30 + 30 * V));

  return {
    q1Score,
    q2Score,
    q3Score,
    q4Score,
    q5Score,
    counselingRiskScore,
    counselingLevel,
    scoreMultiplier,
    floorApplies,
    floorMinScore,
    weakCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply counseling to academic score
// ─────────────────────────────────────────────────────────────────────────────

export interface FinalScoreResult {
  academicScore: number;
  finalScore: number;
  /** null when no counseling record exists */
  counselingRiskScore: number | null;
  scoreMultiplier: number;
  floorApplied: boolean;
  floorMinScore: number;
  counselingLevel: 'Low' | 'Medium' | 'High' | null;
  breakdownNote: string;
}

/**
 * Apply counseling modifier to an academic score.
 * If `counseling` is null, returns the academic score unchanged (multiplier = 1.0, no floor).
 * Counseling alone can raise a student to at most upper Medium (60). High needs real academic signals.
 */
export function applyCounselingToScore(
  academicScore: number,
  counseling: CounselingScoreResult | null
): FinalScoreResult {
  if (!counseling) {
    return {
      academicScore,
      finalScore: academicScore,
      counselingRiskScore: null,
      scoreMultiplier: 1.0,
      floorApplied: false,
      floorMinScore: 0,
      counselingLevel: null,
      breakdownNote: '',
    };
  }

  const { scoreMultiplier, floorApplies, floorMinScore, counselingRiskScore, counselingLevel } = counseling;

  let finalScore = Math.min(100, Math.round(academicScore * scoreMultiplier));

  // Counseling alone can raise to at most 60 (upper Medium).
  // Only academic signals (riskEngine) can push the score into High territory.
  // So cap the counseling-boosted score at 60 if academic score was already ≤ 60.
  if (academicScore <= 60) {
    finalScore = Math.min(60, finalScore);
  }

  let floorApplied = false;
  if (floorApplies && finalScore < floorMinScore) {
    finalScore = floorMinScore;
    floorApplied = true;
  }

  let breakdownNote = `Academic ${academicScore} × ${scoreMultiplier.toFixed(2)} = ${finalScore}`;
  if (floorApplied) {
    breakdownNote += ` (Raised by counseling floor to ${floorMinScore} — Medium)`;
  }

  return {
    academicScore,
    finalScore,
    counselingRiskScore,
    scoreMultiplier,
    floorApplied,
    floorMinScore,
    counselingLevel,
    breakdownNote,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing & Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ParseError {
  row: number;
  field: string;
  message: string;
}

export interface CounselingParseResult {
  records: CounselingRecord[];
  errors: ParseError[];
  unknownStudentIds: string[];
}

export interface ContactParseResult {
  records: ContactRecord[];
  errors: ParseError[];
  unknownStudentIds: string[];
}

/**
 * Parse CS_InitialCounseling.csv rows.
 * Recomputes all score columns from answer text — CSV score columns are ignored.
 * @param rows Parsed CSV rows (from PapaParse or similar)
 * @param knownStudentIds Set of valid student IDs for unknown-row reporting
 */
export function parseCounselingCSV(
  rows: Record<string, string>[],
  knownStudentIds: Set<string>
): CounselingParseResult {
  const records: CounselingRecord[] = [];
  const errors: ParseError[] = [];
  const unknownStudentIds: string[] = [];

  // Column header mapping (flexible: match by question id prefix)
  const Q_ANSWER_COLS: Record<string, string> = {
    Q1: 'Q1_Why did you take admission in this course?',
    Q2: 'Q2_How motivated are you to continue this course?',
    Q3: 'Q3_How connected and comfortable do you feel in your class and college?',
    Q4: 'Q4_How clear are you about what you want to do after this course?',
    Q5: 'Q5_How stressed do you feel about your studies and personal matters?',
  };

  rows.forEach((row, rowIdx) => {
    const lineNum = rowIdx + 2; // 1-indexed, +1 for header
    const sid = (row['studentId'] ?? '').trim();
    if (!sid) return;

    // Report unknown studentIds but still include in errors
    if (knownStudentIds.size > 0 && !knownStudentIds.has(sid)) {
      unknownStudentIds.push(sid);
      errors.push({ row: lineNum, field: 'studentId', message: `Unknown studentId: ${sid}` });
      return;
    }

    // Flexible column header lookup
    function getColValue(targetHeader: string): string {
      const key = Object.keys(row).find(
        k => k.trim().toLowerCase() === targetHeader.toLowerCase()
      );
      return key ? (row[key] ?? '').trim() : '';
    }

    // Q1 answer validation
    const q1Text = getColValue(Q_ANSWER_COLS.Q1) || getColValue('Q1_Why did you take admission in this course?');
    if (!Q1_VALID_ANSWERS.includes(q1Text)) {
      errors.push({
        row: lineNum,
        field: 'Q1',
        message: `Invalid Q1 answer: "${q1Text}". Must be one of: ${Q1_VALID_ANSWERS.join(' | ')}`,
      });
      return;
    }
    const reasonCode = REASON_TEXT_TO_CODE[q1Text];

    // Q2-Q5 validation
    const qAnswerTexts: Record<string, string> = {
      Q2: getColValue(Q_ANSWER_COLS.Q2),
      Q3: getColValue(Q_ANSWER_COLS.Q3),
      Q4: getColValue(Q_ANSWER_COLS.Q4),
      Q5: getColValue(Q_ANSWER_COLS.Q5),
    };

    let hasQError = false;
    const ratings: Record<string, number> = {};
    for (const qid of ['Q2', 'Q3', 'Q4', 'Q5']) {
      const ansText = qAnswerTexts[qid];
      const ratingMap = Q_TEXT_TO_RATING_MAP[qid];
      if (ansText in ratingMap) {
        ratings[qid] = ratingMap[ansText];
      } else {
        errors.push({
          row: lineNum,
          field: qid,
          message: `Invalid ${qid} answer: "${ansText}". Must be one of: ${Object.keys(ratingMap).join(' | ')}`,
        });
        hasQError = true;
      }
    }
    if (hasQError) return;

    // Recompute all scores (ignore CSV score columns)
    const scored = computeCounselingScore(
      reasonCode,
      ratings.Q2,
      ratings.Q3,
      ratings.Q4,
      ratings.Q5
    );

    const answers: CounselingQuestionAnswer[] = [
      { questionId: 'Q1', answerText: q1Text, rating: null, reasonCode, qScore: scored.q1Score },
      { questionId: 'Q2', answerText: qAnswerTexts.Q2, rating: ratings.Q2, qScore: scored.q2Score },
      { questionId: 'Q3', answerText: qAnswerTexts.Q3, rating: ratings.Q3, qScore: scored.q3Score },
      { questionId: 'Q4', answerText: qAnswerTexts.Q4, rating: ratings.Q4, qScore: scored.q4Score },
      { questionId: 'Q5', answerText: qAnswerTexts.Q5, rating: ratings.Q5, qScore: scored.q5Score },
    ];

    records.push({
      studentId: sid,
      name: (row['name'] ?? '').trim(),
      counselingDate: (row['counselingDate'] ?? '').trim(),
      answers,
      studentSaid: (row['studentSaid'] ?? '').trim(),
      mentorNotes: (row['mentorNotes'] ?? '').trim(),
      otherText: (row['otherText'] ?? '').trim(),
      counselingRiskScore: scored.counselingRiskScore,
      counselingLevel: scored.counselingLevel,
      scoreMultiplier: scored.scoreMultiplier,
      floorApplies: scored.floorApplies,
      floorMinScore: scored.floorMinScore,
      reasonCode,
    });
  });

  return { records, errors, unknownStudentIds };
}

/** Validate Indian mobile phone format: +91 XXXXX XXXXX or similar */
export function validatePhone(phone: string): boolean {
  return /^\+91[\s-]?\d{5}[\s-]?\d{5}$/.test(phone.trim());
}

/** Validate basic email format */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Parse CS_Contacts.csv rows.
 */
export function parseContactsCSV(
  rows: Record<string, string>[],
  knownStudentIds: Set<string>
): ContactParseResult {
  const records: ContactRecord[] = [];
  const errors: ParseError[] = [];
  const unknownStudentIds: string[] = [];

  rows.forEach((row, rowIdx) => {
    const lineNum = rowIdx + 2;
    const sid = (row['studentId'] ?? '').trim();
    if (!sid) return;

    if (knownStudentIds.size > 0 && !knownStudentIds.has(sid)) {
      unknownStudentIds.push(sid);
      errors.push({ row: lineNum, field: 'studentId', message: `Unknown studentId: ${sid}` });
      return;
    }

    const studentEmail = (row['studentEmail'] ?? '').trim();
    const studentPhone = (row['studentPhone'] ?? '').trim();
    const parentEmail = (row['parentEmail'] ?? '').trim();
    const parentPhone = (row['parentPhone'] ?? '').trim();

    if (studentEmail && !validateEmail(studentEmail)) {
      errors.push({ row: lineNum, field: 'studentEmail', message: `Invalid email: ${studentEmail}` });
    }
    if (parentEmail && !validateEmail(parentEmail)) {
      errors.push({ row: lineNum, field: 'parentEmail', message: `Invalid email: ${parentEmail}` });
    }
    if (studentPhone && !validatePhone(studentPhone)) {
      errors.push({ row: lineNum, field: 'studentPhone', message: `Invalid phone: ${studentPhone}` });
    }
    if (parentPhone && !validatePhone(parentPhone)) {
      errors.push({ row: lineNum, field: 'parentPhone', message: `Invalid phone: ${parentPhone}` });
    }

    records.push({
      studentId: sid,
      name: (row['name'] ?? '').trim(),
      studentEmail,
      studentPhone,
      parentName: (row['parentName'] ?? '').trim(),
      parentPhone,
      parentEmail,
    });
  });

  return { records, errors, unknownStudentIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escalation ladder (date-based, no background job)
// ─────────────────────────────────────────────────────────────────────────────

export type EscalationStep = 1 | 2 | 3 | 4 | 5;

export interface EscalationStatus {
  step: EscalationStep;
  stepLabel: string;
  mentorAction: string;
  dueDate: string | null;
  isOverdue: boolean;
  noResponseDays: number | null;
  statusLabel: 'Awaiting reply' | 'No response' | 'Escalated' | 'Unreachable, with welfare cell' | 'Contact made' | 'None';
  isPriority: boolean;
}

export function computeEscalationStep(
  assignedDate: string | null,
  lastContactDate: string | null,
  studentResponse: string | null,
  currentRiskLevel: 'Low' | 'Medium' | 'High',
  riskTrend: 'Improving' | 'No Change' | 'Worsening' | null,
  q5StressRating?: number | null,
  manualStep?: number
): EscalationStatus {
  if (!assignedDate) {
    return {
      step: 1,
      stepLabel: 'Day 0 — Assign Intervention',
      mentorAction: 'Assign intervention; baseline frozen.',
      dueDate: null,
      isOverdue: false,
      noResponseDays: null,
      statusLabel: 'None',
      isPriority: false,
    };
  }

  const assigned = new Date(assignedDate);
  const now = new Date();
  const daysSinceAssign = Math.floor((now.getTime() - assigned.getTime()) / 86400000);
  const hasResponded = !!studentResponse && studentResponse !== 'Ignored'; // Assuming there's some actual response
  const noResponseDays = hasResponded ? null : daysSinceAssign;

  // Priority flag — only raised once there has been at least 3 days without a response
  const isPriority = !hasResponded && daysSinceAssign >= 3 && (currentRiskLevel === 'High' || riskTrend === 'Worsening' || q5StressRating === 4 || q5StressRating === 5);

  if (hasResponded) {
    return {
      step: 1,
      stepLabel: 'Contact Made',
      mentorAction: 'Student responded. Case can be closed manually.',
      dueDate: null,
      isOverdue: false,
      noResponseDays: null,
      statusLabel: 'Contact made',
      isPriority: false,
    };
  }

  // Step 5: Unreachable (or manual override)
  if (manualStep === 5 || (daysSinceAssign >= 14 && (currentRiskLevel === 'High' || riskTrend === 'Worsening')) || (isPriority && daysSinceAssign >= 7)) {
    return {
      step: 5,
      stepLabel: 'Step 5 — Refer to HOD / Welfare Cell',
      mentorAction: 'Refer to HOD or student welfare cell. Auto-generate record of all contact attempts.',
      dueDate: null,
      isOverdue: false, // After step 5, it just stays at top, no more reminders
      noResponseDays,
      statusLabel: 'Unreachable, with welfare cell',
      isPriority,
    };
  }

  // Step 4: Escalated
  if (daysSinceAssign >= 14) {
    const dueDate = new Date(assigned.getTime() + 14 * 86400000).toISOString().split('T')[0];
    return {
      step: 4,
      stepLabel: 'Step 4 — Contact Parent/Guardian',
      mentorAction: 'Contact parent or guardian (as per college policy).',
      dueDate,
      isOverdue: now > new Date(dueDate),
      noResponseDays,
      statusLabel: 'Escalated',
      isPriority,
    };
  }

  // Step 3: Escalated (first stage)
  if (daysSinceAssign >= 7) {
    const dueDate = new Date(assigned.getTime() + 7 * 86400000).toISOString().split('T')[0];
    return {
      step: 3,
      stepLabel: 'Step 3 — Contact Coordinator',
      mentorAction: 'Contact class coordinator or a classmate.',
      dueDate,
      isOverdue: now > new Date(dueDate),
      noResponseDays,
      statusLabel: 'Escalated',
      isPriority,
    };
  }

  // Step 2: No response
  if (daysSinceAssign >= 3) {
    const dueDate = new Date(assigned.getTime() + 5 * 86400000).toISOString().split('T')[0];
    return {
      step: 2,
      stepLabel: 'Step 2 — Try Another Channel',
      mentorAction: 'No response — try phone, WhatsApp, or email.',
      dueDate,
      isOverdue: now > new Date(dueDate),
      noResponseDays,
      statusLabel: 'No response',
      isPriority,
    };
  }

  // Step 1: Awaiting reply
  return {
    step: 1,
    stepLabel: 'Step 1 — Assigned',
    mentorAction: 'Assign intervention; baseline frozen.',
    dueDate: new Date(assigned.getTime() + 3 * 86400000).toISOString().split('T')[0],
    isOverdue: false,
    noResponseDays,
    statusLabel: 'Awaiting reply',
    isPriority,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional ML badge: logistic regression dropout likelihood
// ─────────────────────────────────────────────────────────────────────────────

/** Expert prior coefficients — not fitted on real data. Indicative only. */
const LOG_REG_COEFFICIENTS = {
  intercept: -2.5,
  academicScore: 0.05,
  attendanceSlope: -0.3,
  reasonSeverity: 1.8,
  motivation: -0.5,
  belonging: -0.4,
  careerClarity: -0.3,
  stress: 0.6,
  forcedAdmission_lowMotivation: 1.2, // interaction term
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface MLDropoutBadge {
  /** 0..100 likelihood score */
  likelihood: number;
  label: 'Low' | 'Moderate' | 'High';
  disclaimer: string;
}

/**
 * Compute an optional ML dropout likelihood badge.
 * This is INDICATIVE and NOT VALIDATED — not used in the official 0-100 score.
 */
export function computeMLDropoutLikelihood(params: {
  academicScore: number;
  attendanceSlope: number;
  reasonCode: ReasonCode | null;
  motivation: number | null;
  belonging: number | null;
  careerClarity: number | null;
  stress: number | null;
}): MLDropoutBadge {
  const c = LOG_REG_COEFFICIENTS;
  const severity = params.reasonCode ? REASON_SEVERITY[params.reasonCode] : 0;
  const mot = params.motivation ?? 3;
  const bel = params.belonging ?? 3;
  const cc = params.careerClarity ?? 3;
  const st = params.stress ?? 3;

  const forcedLowMotivation =
    params.reasonCode === 'forced_admission' && mot <= 2 ? 1 : 0;

  const logit =
    c.intercept +
    c.academicScore * (params.academicScore / 100) +
    c.attendanceSlope * params.attendanceSlope +
    c.reasonSeverity * severity +
    c.motivation * mot +
    c.belonging * bel +
    c.careerClarity * cc +
    c.stress * st +
    c.forcedAdmission_lowMotivation * forcedLowMotivation;

  const likelihood = Math.round(sigmoid(logit) * 100);
  const label: 'Low' | 'Moderate' | 'High' =
    likelihood >= 65 ? 'High' : likelihood >= 35 ? 'Moderate' : 'Low';

  return {
    likelihood,
    label,
    disclaimer: 'Indicative, not validated — coefficients are expert priors, not fitted on real student outcomes.',
  };
}
