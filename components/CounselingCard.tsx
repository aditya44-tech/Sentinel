'use client';

import React from 'react';
import type { CounselingRecord } from '@/lib/counseling';


const LEVEL_COLORS: Record<string, string> = {
  Low: 'bg-[#4ADE80] text-[#0D0D0D]',
  Medium: 'bg-[#F4C430] text-[#0D0D0D]',
  High: 'bg-[#D62828] text-white',
};

const Q_QUESTION_TEXT: Record<string, string> = {
  Q1: 'Why did you take admission in this course?',
  Q2: 'How motivated are you to continue this course?',
  Q3: 'How connected and comfortable do you feel in your class and college?',
  Q4: 'How clear are you about what you want to do after this course?',
  Q5: 'How stressed do you feel about your studies and personal matters?',
};

interface CounselingCardProps {
  counseling: CounselingRecord;
  academicScore?: number;
  scoreBreakdownNote?: string;
  printable?: boolean;
}

export const CounselingCard: React.FC<CounselingCardProps> = ({
  counseling,
  academicScore,
  scoreBreakdownNote,
  printable = false,
}) => {
  const levelColor = LEVEL_COLORS[counseling.counselingLevel] ?? LEVEL_COLORS.Low;

  return (
    <div className={`space-y-4 ${printable ? 'print-section' : ''}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#0D0D0D] pb-3">
        <div>
          <h3 className="font-black text-sm uppercase tracking-wider text-[#0D0D0D]">
            Initial Counseling Record
          </h3>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Date: {counseling.counselingDate || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-[11px] font-black uppercase tracking-wider border border-[#0D0D0D] ${levelColor}`}>
            Counseling: {counseling.counselingLevel}
          </span>
          <span className="font-mono text-lg font-black text-[#0D0D0D]">
            {counseling.counselingRiskScore}
            <span className="text-xs font-bold text-neutral-500">/100</span>
          </span>
        </div>
      </div>

      {/* Score breakdown note */}
      {scoreBreakdownNote && (
        <div className="p-3 bg-[#F5F1E8] border-2 border-[#0D0D0D] text-sm font-mono text-[#0D0D0D]">
          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 block mb-1">
            Risk Score Breakdown
          </span>
          {scoreBreakdownNote}
          {counseling.floorApplies && (
            <span className="ml-2 px-1.5 py-0.5 bg-[#F4C430] border border-[#0D0D0D] text-[10px] font-black uppercase">
              Floor Applied
            </span>
          )}
        </div>
      )}

      {/* Q1–Q5 with answer and score */}
      <div className="space-y-2">
        <h4 className="text-xs font-black uppercase tracking-wider text-neutral-600">
          Counseling Questions &amp; Answers
        </h4>
        {counseling.answers.map((ans) => (
          <div
            key={ans.questionId}
            className="flex items-start gap-3 p-3 bg-white border-2 border-[#0D0D0D]"
          >
            <div className="shrink-0 w-8 h-8 bg-[#0D0D0D] text-white flex items-center justify-center text-xs font-black">
              {ans.questionId}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-neutral-500 mb-1 font-medium leading-relaxed">
                {Q_QUESTION_TEXT[ans.questionId]}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-[#0D0D0D]">{ans.answerText}</span>
                {ans.rating !== null && (
                  <span className="text-xs font-mono text-neutral-500">({ans.rating}/5)</span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span
                className={`inline-block px-2 py-1 text-xs font-black border border-[#0D0D0D] ${
                  ans.qScore > 0 ? 'bg-[#D62828] text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                +{ans.qScore}
              </span>
            </div>
          </div>
        ))}

        {/* Score total row */}
        <div className="flex items-center justify-between p-3 bg-[#0D0D0D] text-white">
          <span className="text-xs font-black uppercase tracking-wider">
            Counseling Risk Score Total
          </span>
          <span className="font-mono text-lg font-black">
            {counseling.answers.map((a) => a.qScore).join(' + ')} ={' '}
            <span className="text-[#F4C430]">{counseling.counselingRiskScore}</span>
          </span>
        </div>
      </div>

      {/* studentSaid */}
      {counseling.studentSaid && (
        <div className="p-3 bg-[#E8F4FD] border-2 border-[#0D0D0D]">
          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 block mb-1">
            In their own words
          </span>
          <p className="text-sm font-medium text-[#0D0D0D] italic">
            &ldquo;{counseling.studentSaid}&rdquo;
          </p>
        </div>
      )}

      {/* Mentor notes */}
      {counseling.mentorNotes && (
        <div className="p-3 bg-[#FFFDEB] border-2 border-[#0D0D0D]">
          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 block mb-1">
            Mentor Notes
          </span>
          <p className="text-sm font-medium text-[#0D0D0D]">{counseling.mentorNotes}</p>
        </div>
      )}

      {/* otherText */}
      {counseling.otherText && (
        <div className="p-3 bg-neutral-50 border border-neutral-300">
          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 block mb-1">
            Additional Notes
          </span>
          <p className="text-sm text-neutral-700">{counseling.otherText}</p>
        </div>
      )}

      {/* Multiplier details */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Multiplier', value: `×${counseling.scoreMultiplier.toFixed(2)}` },
          { label: 'Floor Applies', value: counseling.floorApplies ? 'Yes' : 'No' },
          { label: 'Floor Min', value: counseling.floorApplies ? counseling.floorMinScore : '—' },
          { label: 'Academic Score', value: academicScore ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="p-2 border-2 border-[#0D0D0D] bg-white text-center">
            <span className="block text-[10px] font-black uppercase tracking-wider text-neutral-500">
              {label}
            </span>
            <span className="block font-mono font-black text-[#0D0D0D] text-base">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
