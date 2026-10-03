import React from 'react';
import { ContributingFactor } from '@/lib/types';
import type { CounselingRecord } from '@/lib/counseling';

const Q_QUESTION_LABEL: Record<string, string> = {
  Q1: 'Reason for Admission',
  Q2: 'Course Motivation',
  Q3: 'Sense of Belonging',
  Q4: 'Career Clarity',
  Q5: 'Stress Level',
};

interface FactorBreakdownListProps {
  factors: ContributingFactor[];
  counseling?: CounselingRecord | null;
}

export const FactorBreakdownList: React.FC<FactorBreakdownListProps> = ({ factors, counseling }) => {
  return (
    <div className="w-full">
      <div className="border-[3px] border-[#0D0D0D] bg-white shadow-[4px_4px_0px_#0D0D0D]">
        {/* Header */}
        <div className="grid grid-cols-12 bg-[#0D0D0D] text-white p-3 font-black text-xs uppercase tracking-wider">
          <div className="col-span-4 md:col-span-3">Risk Factor</div>
          <div className="col-span-2 md:col-span-2 text-center">Impact Pts</div>
          <div className="col-span-6 md:col-span-7">Diagnostic Reason</div>
        </div>

        <div className="divide-y-2 divide-[#0D0D0D]">
          {/* Academic factors */}
          {factors.map((item, idx) => {
            const isHighImpact = item.points >= 20;
            const isMediumImpact = item.points > 5 && item.points < 20;

            return (
              <div
                key={idx}
                id={`factor-row-${idx}`}
                className="grid grid-cols-12 p-3 items-center hover:bg-[#FFFDF5] transition-colors"
              >
                <div className="col-span-4 md:col-span-3 font-bold text-sm text-[#0D0D0D] flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 border border-[#0D0D0D] shrink-0 ${
                      isHighImpact
                        ? 'bg-[#D62828]'
                        : isMediumImpact
                        ? 'bg-[#F4C430]'
                        : 'bg-neutral-300'
                    }`}
                  />
                  <span>{item.factor}</span>
                </div>

                <div className="col-span-2 md:col-span-2 text-center">
                  <span
                    className={`inline-block font-mono font-black text-xs px-2 py-0.5 border-[2px] border-[#0D0D0D] shadow-[1px_1px_0px_#0D0D0D] ${
                      item.points > 0
                        ? isHighImpact
                          ? 'bg-[#D62828] text-white'
                          : 'bg-[#F4C430] text-[#0D0D0D]'
                        : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    +{item.points} pts
                  </span>
                </div>

                <div className="col-span-6 md:col-span-7 text-xs md:text-sm text-neutral-800 font-medium">
                  {item.reason}
                </div>
              </div>
            );
          })}

          {/* ── Counseling Q&A section ── */}
          {counseling && (
            <>
              {/* Counseling section sub-header */}
              <div className="grid grid-cols-12 bg-neutral-100 border-t-[3px] border-[#0D0D0D] p-3 items-center">
                <div className="col-span-4 md:col-span-3 font-black text-xs uppercase tracking-wider text-[#0D0D0D] flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-[#0D0D0D] border border-[#0D0D0D] shrink-0" />
                  Counseling
                </div>
                <div className="col-span-2 md:col-span-2 text-center">
                  <span className="inline-block font-mono font-black text-xs px-2 py-0.5 border-[2px] border-[#0D0D0D] bg-[#0D0D0D] text-white">
                    ×{counseling.scoreMultiplier.toFixed(2)}
                  </span>
                </div>
                <div className="col-span-6 md:col-span-7 text-xs text-[#0D0D0D] font-bold flex flex-wrap items-center gap-2">
                  <span>Score {counseling.counselingRiskScore}/100</span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-black uppercase border ${
                    counseling.counselingLevel === 'High' ? 'bg-[#D62828] text-white border-[#D62828]'
                    : counseling.counselingLevel === 'Medium' ? 'bg-[#F4C430] text-[#0D0D0D] border-[#F4C430]'
                    : 'bg-[#4ADE80] text-[#0D0D0D] border-[#4ADE80]'
                  }`}>
                    {counseling.counselingLevel}
                  </span>
                  {counseling.floorApplies && (
                    <span className="px-1.5 py-0.5 bg-[#D62828] text-white text-[10px] font-black uppercase">
                      Floor {counseling.floorMinScore}
                    </span>
                  )}
                </div>
              </div>

              {/* One row per Q1–Q5 */}
              {counseling.answers.map((ans) => {
                const isRisky = ans.qScore > 0;
                return (
                  <div
                    key={ans.questionId}
                    className="grid grid-cols-12 p-3 items-start bg-white hover:bg-neutral-50 transition-colors border-t-2 border-dashed border-neutral-300"
                  >
                    {/* Factor name */}
                    <div className="col-span-4 md:col-span-3 font-bold text-sm text-[#0D0D0D] flex items-start gap-2">
                      <span
                        className={`w-2.5 h-2.5 mt-1 border border-[#0D0D0D] shrink-0 ${
                          isRisky ? 'bg-[#0D0D0D]' : 'bg-neutral-200'
                        }`}
                      />
                      <span className="leading-tight">
                        <span className="text-[10px] font-black text-[#0D0D0D] block uppercase tracking-wider">
                          {ans.questionId}
                        </span>
                        {Q_QUESTION_LABEL[ans.questionId] ?? ans.questionId}
                      </span>
                    </div>

                    {/* Score badge */}
                    <div className="col-span-2 md:col-span-2 text-center pt-1">
                      <span
                        className={`inline-block font-mono font-black text-xs px-2 py-0.5 border-[2px] ${
                          isRisky
                            ? 'border-[#0D0D0D] bg-[#0D0D0D] text-white'
                            : 'border-neutral-300 bg-neutral-100 text-neutral-400'
                        }`}
                      >
                        +{ans.qScore}
                      </span>
                    </div>

                    {/* Answer text + rating */}
                    <div className="col-span-6 md:col-span-7 text-xs md:text-sm font-medium">
                      <span className="font-bold text-[#0D0D0D]">{ans.answerText}</span>
                      {ans.rating !== null && (
                        <span className="ml-1.5 text-neutral-400 font-mono text-[11px]">
                          ({ans.rating}/5)
                        </span>
                      )}
                      {!isRisky && (
                        <span className="ml-2 text-[#2D9D5F] text-[10px] font-black uppercase tracking-wider">
                          ✓ No risk
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Counseling summary / total row */}
              <div className="grid grid-cols-12 p-3 items-center bg-[#0D0D0D]">
                <div className="col-span-4 md:col-span-3 font-black text-xs uppercase tracking-wider text-white">
                  Counseling Total
                </div>
                <div className="col-span-2 md:col-span-2 text-center">
                  <span className="inline-block font-mono font-black text-sm px-2 py-0.5 bg-white text-[#0D0D0D] border-2 border-white">
                    {counseling.counselingRiskScore}
                  </span>
                </div>
                <div className="col-span-6 md:col-span-7 text-[11px] text-white font-bold opacity-90 font-mono">
                  {counseling.answers.map((a) => `${a.questionId}+${a.qScore}`).join(' · ')}&nbsp;
                  = {counseling.counselingRiskScore} → ×{counseling.scoreMultiplier.toFixed(2)}
                </div>
              </div>
            </>
          )}

          {/* Empty state */}
          {factors.length === 0 && !counseling && (
            <div className="p-6 text-center text-sm font-bold text-neutral-400">
              No risk factors detected — this student has a clean profile.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
