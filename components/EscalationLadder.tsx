'use client';

import React from 'react';
import type { EscalationStatus } from '@/lib/counseling';
import { computeEscalationStep } from '@/lib/counseling';
import type { StudentActiveIntervention, StudentPlanResponse } from '@/lib/types';
import { AlertTriangle, CheckCircle, Clock, ChevronRight } from 'lucide-react';

const STEP_COLORS: Record<number, string> = {
  1: 'bg-[#E8F8F0] border-[#4ADE80]',
  2: 'bg-[#FFF8E0] border-[#F4C430]',
  3: 'bg-[#FFF3E0] border-[#FB923C]',
  4: 'bg-[#FDECEA] border-[#EF4444]',
  5: 'bg-[#F0E6FF] border-[#A855F7]',
};

interface EscalationLadderProps {
  intervention: StudentActiveIntervention | null | undefined;
  planResponse?: StudentPlanResponse | null;
  currentRiskLevel: 'Low' | 'Medium' | 'High';
  riskTrend?: 'Improving' | 'No Change' | 'Worsening' | null;
  lastContactDate?: string | null;
  onLogContact?: () => void;
}

export const EscalationLadder: React.FC<EscalationLadderProps> = ({
  intervention,
  planResponse,
  currentRiskLevel,
  riskTrend = null,
  lastContactDate = null,
  onLogContact,
}) => {
  const assignedDate = intervention?.assignedDate ?? null;

  const status = computeEscalationStep(
    assignedDate,
    lastContactDate,
    planResponse?.responseType ?? null,
    currentRiskLevel,
    riskTrend
  );

  const noResponseDays = status.noResponseDays;
  const showNoResponseFlag = noResponseDays !== null && noResponseDays >= 5;

  const allSteps: { step: number; label: string; when: string; action: string }[] = [
    { step: 1, label: 'Assigned', when: 'Day 0', action: 'Assign intervention; baseline frozen.' },
    { step: 2, label: 'No Response', when: 'Day 3–5', action: 'Try another channel: phone, WhatsApp, email.' },
    { step: 3, label: 'Still Silent', when: 'Week 1', action: 'Contact class coordinator or a classmate.' },
    { step: 4, label: 'Risk High/Worsening', when: 'Week 2', action: 'Contact parent/guardian (as per college policy).' },
    { step: 5, label: 'Refer Up', when: 'Ongoing', action: 'Refer to HOD or welfare cell with full contact log.' },
  ];

  return (
    <div className="space-y-3">
      {/* No-response flag */}
      {showNoResponseFlag && (
        <div className="flex items-start gap-3 p-3 bg-[#D62828] text-white border-2 border-[#0D0D0D]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black uppercase tracking-wider">
              No Response — {noResponseDays} day{noResponseDays !== 1 ? 's' : ''} since assignment
            </p>
            <p className="text-xs font-medium mt-0.5 opacity-90">
              Student has not replied to the plan. The escalation ladder is now active.
            </p>
          </div>
        </div>
      )}

      {/* Current step highlight */}
      <div
        className={`p-4 border-2 ${STEP_COLORS[status.step] ?? STEP_COLORS[1]}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600">
              Current Step
            </span>
            <p className="font-black text-base text-[#0D0D0D] mt-0.5">{status.stepLabel}</p>
            <p className="text-sm text-neutral-700 mt-1">{status.mentorAction}</p>
            {status.dueDate && (
              <div className="flex items-center gap-1.5 mt-2">
                <Clock className="w-3.5 h-3.5 text-neutral-500" />
                <span
                  className={`text-xs font-mono font-bold ${
                    status.isOverdue ? 'text-[#D62828]' : 'text-neutral-600'
                  }`}
                >
                  {status.isOverdue ? 'OVERDUE — ' : 'Due: '}
                  {status.dueDate}
                </span>
              </div>
            )}
          </div>
          <div className="shrink-0">
            <span className="w-10 h-10 rounded-full bg-[#0D0D0D] text-white flex items-center justify-center font-black text-lg">
              {status.step}
            </span>
          </div>
        </div>
        {onLogContact && status.step >= 2 && (
          <button
            onClick={onLogContact}
            className="mt-3 neo-btn px-3 py-1.5 bg-[#0D0D0D] text-white text-xs font-black uppercase tracking-wider"
          >
            Log Contact Attempt
          </button>
        )}
      </div>

      {/* Ladder overview */}
      <div className="space-y-1">
        {allSteps.map(({ step, label, when, action }) => {
          const isActive = status.step === step;
          const isPast = status.step > step;
          return (
            <div
              key={step}
              className={`flex items-start gap-3 p-3 border ${
                isActive
                  ? 'border-[#0D0D0D] border-2 bg-white'
                  : isPast
                  ? 'border-neutral-200 bg-neutral-50 opacity-60'
                  : 'border-neutral-200 bg-white opacity-50'
              }`}
            >
              <div
                className={`shrink-0 w-6 h-6 flex items-center justify-center text-xs font-black border ${
                  isPast
                    ? 'bg-[#4ADE80] border-[#0D0D0D] text-[#0D0D0D]'
                    : isActive
                    ? 'bg-[#0D0D0D] border-[#0D0D0D] text-white'
                    : 'bg-neutral-200 border-neutral-300 text-neutral-500'
                }`}
              >
                {isPast ? <CheckCircle className="w-3.5 h-3.5" /> : step}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-black ${isActive ? 'text-[#0D0D0D]' : 'text-neutral-600'}`}>
                    {label}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500 bg-neutral-100 px-1.5 py-0.5 border border-neutral-200">
                    {when}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 mt-0.5">{action}</p>
              </div>
              {isActive && <ChevronRight className="w-4 h-4 text-[#0D0D0D] shrink-0 mt-1" />}
            </div>
          );
        })}
      </div>
    </div>
  );
};
