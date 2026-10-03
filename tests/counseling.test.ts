/**
 * tests/counseling.test.ts
 *
 * Unit tests for lib/counseling.ts — scoring, floor, parsing, no-response timing.
 * Runs with Node.js built-in test runner (node --test).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCounselingScore,
  applyCounselingToScore,
  parseCounselingCSV,
  parseContactsCSV,
  computeEscalationStep,
  Q1_VALID_ANSWERS,
  REASON_TEXT_TO_CODE,
} from '../lib/counseling';

// ─────────────────────────────────────────────────────────────────────────────
// Scoring tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCounselingScore', () => {
  it('forced admission + motivation 2 + belonging 2 + careerClarity 3 + stress 4 → counselingRiskScore 90', () => {
    const result = computeCounselingScore('forced_admission', 2, 2, 3, 4);
    // Q1=60, Q2=10 (<=2), Q3=10 (<=2), Q4=0 (3>2), Q5=10 (>=4)
    assert.equal(result.q1Score, 60);
    assert.equal(result.q2Score, 10);
    assert.equal(result.q3Score, 10);
    assert.equal(result.q4Score, 0);
    assert.equal(result.q5Score, 10);
    assert.equal(result.counselingRiskScore, 90);
    assert.equal(result.counselingLevel, 'High');
  });

  it('multiplier = 1 + 0.5 * V for counselingRiskScore 90 → 1.45', () => {
    const result = computeCounselingScore('forced_admission', 2, 2, 3, 4);
    const V = result.counselingRiskScore / 100; // 0.9
    const expected = Math.round((1 + 0.5 * V) * 100) / 100;
    assert.equal(result.scoreMultiplier, expected);
    assert.equal(result.scoreMultiplier, 1.45);
  });

  it('floorApplies for forced_admission + weakCount >= 2', () => {
    const result = computeCounselingScore('forced_admission', 2, 2, 3, 4);
    assert.equal(result.floorApplies, true);
    // weakCount = 3 (Q2, Q3, Q5 all score 10)
    assert.equal(result.weakCount, 3);
  });

  it('floorApplies for not_interested + weakCount >= 2', () => {
    const result = computeCounselingScore('not_interested', 1, 1, 3, 4);
    assert.equal(result.floorApplies, true);
  });

  it('floorApplies = false for financial + weakCount >= 2', () => {
    const result = computeCounselingScore('financial', 1, 1, 3, 4);
    assert.equal(result.floorApplies, false);
  });

  it('floorApplies = false for forced_admission + weakCount < 2', () => {
    // motivation 3, belonging 3, careerClarity 3, stress 1 → weakCount=0
    const result = computeCounselingScore('forced_admission', 3, 3, 3, 1);
    assert.equal(result.floorApplies, false);
  });

  it('other reason → Q1=12, counselingRiskScore=12, Low', () => {
    const result = computeCounselingScore('other', 3, 3, 3, 1);
    assert.equal(result.q1Score, 12);
    assert.equal(result.counselingRiskScore, 12);
    assert.equal(result.counselingLevel, 'Low');
  });

  it('counselingRiskScore 34 → Medium', () => {
    // academic_difficulty: Q1=24, Q2=0,Q3=0,Q4=0,Q5=10 = 34
    const result = computeCounselingScore('academic_difficulty', 3, 3, 3, 4);
    assert.equal(result.counselingRiskScore, 34);
    assert.equal(result.counselingLevel, 'Medium');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyCounselingToScore tests
// ─────────────────────────────────────────────────────────────────────────────

describe('applyCounselingToScore', () => {
  it('academic 58 + forced_admission, motivation 2, belonging 2 → counselingRiskScore 80, multiplier 1.4, finalScore 60 (capped at medium)', () => {
    // S048 case: forced_admission, slightly motivated=2, not connected=1, somewhat clear=3, moderately stressed=3
    // Actually re-reading spec: "academic 58 + forced admission, motivation 2, belonging 2 gives counseling score 80, multiplier 1.4, final 81 (High)"
    // But per our rule: counseling alone caps at 60 when academic ≤ 60. So let's test exactly as spec says.
    // Spec says final 81 (High) - that would violate the "counseling alone can raise to at most upper Medium" rule.
    // Per our implementation: if academicScore <= 60, finalScore = min(60, round(58 * 1.40)) = min(60, 81) = 60.
    // The spec example seems to contradict the constraint. We follow the constraint.

    // counselingRiskScore: forced_admission Q1=60, Q2=10(mot<=2), Q3=10(bel<=2), Q4=0(cc>2=3), Q5=0(stress=3<4) = 80
    const scored = computeCounselingScore('forced_admission', 2, 2, 3, 3);
    assert.equal(scored.counselingRiskScore, 80);
    assert.equal(scored.scoreMultiplier, 1.4);
    const applied = applyCounselingToScore(58, scored);
    // academic 58 <= 60, so capped at 60
    assert.equal(applied.finalScore, 60);
    assert.equal(applied.scoreMultiplier, 1.4);
    assert.equal(applied.counselingRiskScore, 80);
  });

  it('academic 20 + forced_admission, motivation 2, belonging 2 → floor raises to 54 (Medium)', () => {
    const scored = computeCounselingScore('forced_admission', 2, 2, 3, 3);
    // counselingRiskScore = 80, V=0.8, floorMin = min(60, round(30+30*0.8)) = min(60,54) = 54
    assert.equal(scored.floorApplies, true);
    assert.equal(scored.floorMinScore, 54);
    const applied = applyCounselingToScore(20, scored);
    // raw = min(60, round(20 * 1.40)) = min(60, 28) = 28; floor 54 > 28 → 54
    assert.equal(applied.finalScore, 54);
    assert.equal(applied.floorApplied, true);
    assert.ok(applied.breakdownNote.includes('Raised by counseling floor'));
  });

  it('no counseling record → score unchanged, multiplier 1.0', () => {
    const applied = applyCounselingToScore(45, null);
    assert.equal(applied.finalScore, 45);
    assert.equal(applied.scoreMultiplier, 1.0);
    assert.equal(applied.counselingRiskScore, null);
    assert.equal(applied.floorApplied, false);
    assert.equal(applied.breakdownNote, '');
  });

  it('academic 75 (>60) + forced_admission, mot 2, bel 2 → can go above 60', () => {
    // When academic is already > 60, counseling can push further (up to 100)
    const scored = computeCounselingScore('forced_admission', 2, 2, 3, 4);
    // counselingRiskScore = 90, multiplier = 1.45
    const applied = applyCounselingToScore(75, scored);
    // academic > 60, so no medium cap. final = min(100, round(75*1.45)) = min(100, 109) = 100
    // But floor is not needed since 109 > floorMin
    assert.ok(applied.finalScore <= 100);
    assert.ok(applied.finalScore >= 75); // must not decrease
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseCounselingCSV', () => {
  const knownIds = new Set(['S001', 'S002']);

  it('valid row is parsed and recomputed', () => {
    const rows = [{
      studentId: 'S001',
      name: 'Test Student',
      counselingDate: '2026-09-16',
      'Q1_Why did you take admission in this course?': 'Forced or pressured admission',
      'Q2_How motivated are you to continue this course?': 'Slightly motivated',
      'Q3_How connected and comfortable do you feel in your class and college?': 'Slightly connected',
      'Q4_How clear are you about what you want to do after this course?': 'Somewhat clear',
      'Q5_How stressed do you feel about your studies and personal matters?': 'Quite stressed',
      studentSaid: 'I joined because my parents decided.',
      mentorNotes: 'Follow up next week.',
      otherText: '',
      // CSV score columns — should be ignored
      Q1_Score: '999', counselingRiskScore: '999', counselingLevel: 'WRONG',
    }];

    const result = parseCounselingCSV(rows, knownIds);
    assert.equal(result.errors.length, 0);
    assert.equal(result.records.length, 1);
    const rec = result.records[0];
    assert.equal(rec.reasonCode, 'forced_admission');
    // Q1=60, Q2=10(slightly motivated=2), Q3=10(slightly connected=2), Q4=0(somewhat clear=3), Q5=10(quite stressed=4)
    assert.equal(rec.counselingRiskScore, 90);
    assert.equal(rec.counselingLevel, 'High');
  });

  it('invalid Q1 answer produces an error', () => {
    const rows = [{
      studentId: 'S001',
      name: 'Test',
      counselingDate: '2026-09-16',
      'Q1_Why did you take admission in this course?': 'Something invalid',
      'Q2_How motivated are you to continue this course?': 'Slightly motivated',
      'Q3_How connected and comfortable do you feel in your class and college?': 'Slightly connected',
      'Q4_How clear are you about what you want to do after this course?': 'Somewhat clear',
      'Q5_How stressed do you feel about your studies and personal matters?': 'Quite stressed',
    }];
    const result = parseCounselingCSV(rows, knownIds);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].message.includes('Invalid Q1 answer'));
  });

  it('unknown studentId is reported', () => {
    const rows = [{
      studentId: 'S999',
      name: 'Ghost',
      counselingDate: '',
      'Q1_Why did you take admission in this course?': 'Other',
      'Q2_How motivated are you to continue this course?': 'Moderately motivated',
      'Q3_How connected and comfortable do you feel in your class and college?': 'Moderately connected',
      'Q4_How clear are you about what you want to do after this course?': 'Somewhat clear',
      'Q5_How stressed do you feel about your studies and personal matters?': 'Moderately stressed',
    }];
    const result = parseCounselingCSV(rows, knownIds);
    assert.ok(result.unknownStudentIds.includes('S999'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Escalation step tests (date-based, no-response)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeEscalationStep', () => {
  function daysAgo(n: number): string {
    const d = new Date(Date.now() - n * 86400000);
    return d.toISOString().split('T')[0];
  }

  it('step 1 when just assigned', () => {
    const status = computeEscalationStep(daysAgo(0), null, null, 'Medium', null);
    assert.equal(status.step, 1);
  });

  it('step 2 after 4 days with no response', () => {
    const status = computeEscalationStep(daysAgo(4), null, null, 'Medium', null);
    assert.equal(status.step, 2);
    assert.equal(status.noResponseDays, 4);
  });

  it('step 3 after 8 days with no response', () => {
    const status = computeEscalationStep(daysAgo(8), null, null, 'Medium', null);
    assert.equal(status.step, 3);
  });

  it('step 1 after 4 days if student already responded', () => {
    const status = computeEscalationStep(daysAgo(4), null, 'will_attend', 'Medium', null);
    assert.equal(status.step, 1);
    assert.equal(status.noResponseDays, null);
  });

  it('noResponseDays is null when student responded', () => {
    const status = computeEscalationStep(daysAgo(10), null, 'need_to_talk', 'High', null);
    assert.equal(status.noResponseDays, null);
  });

  it('step 4 or 5 after 14 days with High risk', () => {
    const status = computeEscalationStep(daysAgo(15), null, null, 'High', 'Worsening');
    assert.ok(status.step >= 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contact CSV parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('parseContactsCSV', () => {
  const knownIds = new Set(['S001']);

  it('valid row passes validation', () => {
    const rows = [{
      studentId: 'S001',
      name: 'Test Student',
      studentEmail: 'test@student.example.com',
      studentPhone: '+91 90000 10001',
      parentName: 'Parent',
      parentPhone: '+91 90000 20001',
      parentEmail: 'parent@example.com',
    }];
    const result = parseContactsCSV(rows, knownIds);
    assert.equal(result.errors.length, 0);
    assert.equal(result.records.length, 1);
  });

  it('invalid email produces error', () => {
    const rows = [{
      studentId: 'S001',
      name: 'Test',
      studentEmail: 'not-an-email',
      studentPhone: '+91 90000 10001',
      parentName: 'Parent',
      parentPhone: '+91 90000 20001',
      parentEmail: 'ok@example.com',
    }];
    const result = parseContactsCSV(rows, knownIds);
    assert.ok(result.errors.some(e => e.field === 'studentEmail'));
  });
});
