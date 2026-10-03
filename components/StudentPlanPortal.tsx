'use client';

import React, { useState } from 'react';
import type { StudentPlanResponse, StudentPlanResponseType, StudentActiveIntervention } from '@/lib/types';
import { Heart, Clock, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';

const WELFARE_CELL = {
  name: 'Student Welfare Cell',
  phone: '+91 98765 00000',
  email: 'welfare@college.example.com',
};

const RESPONSE_OPTIONS: { type: StudentPlanResponseType; label: string; color: string; icon: React.ElementType; note?: string }[] = [
  {
    type: 'will_attend',
    label: 'I will attend',
    color: 'bg-[#4ADE80] hover:bg-[#22c55e] text-[#0D0D0D]',
    icon: CheckCircle,
  },
  {
    type: 'need_different_time',
    label: 'I need a different time',
    color: 'bg-[#F4C430] hover:bg-[#EAB308] text-[#0D0D0D]',
    icon: Clock,
  },
  {
    type: 'need_to_talk',
    label: 'I need to talk to someone',
    color: 'bg-[#FB923C] hover:bg-[#F97316] text-white',
    icon: Heart,
    note: 'Your mentor will be alerted as a priority. You will also see the welfare cell contact below.',
  },
  {
    type: 'cant_take_part',
    label: "I can't take part",
    color: 'bg-[#94a3b8] hover:bg-[#64748b] text-white',
    icon: AlertTriangle,
    note: "Your mentor will follow up and offer an alternative. There is no penalty for responding honestly.",
  },
];

interface StudentPlanPortalProps {
  intervention: StudentActiveIntervention | null | undefined;
  planResponse?: StudentPlanResponse | null;
  onRespond?: (responseType: StudentPlanResponseType) => void;
  studentName?: string;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export const StudentPlanPortal: React.FC<StudentPlanPortalProps> = ({
  intervention,
  planResponse,
  onRespond,
  studentName = 'Student',
}) => {
  const [selected, setSelected] = useState<StudentPlanResponseType | null>(planResponse?.responseType ?? null);
  const [submitted, setSubmitted] = useState(!!planResponse);

  const assignedDate = intervention?.assignedDate;
  const daysSinceAssign = assignedDate ? daysSince(assignedDate) : null;
  const showReminder = !submitted && daysSinceAssign !== null && daysSinceAssign >= 3;

  const needsWelfare =
    submitted &&
    (selected === 'need_to_talk' || selected === 'cant_take_part');

  const handleSubmit = (type: StudentPlanResponseType) => {
    setSelected(type);
    setSubmitted(true);
    onRespond?.(type);
  };

  if (!intervention) {
    return (
      <div className="p-4 border-2 border-[#0D0D0D] bg-white text-center text-sm text-neutral-500 font-medium">
        No active plan assigned yet. Your mentor will assign one when needed.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Plan card */}
      <div className="p-4 border-2 border-[#0D0D0D] bg-[#F5F1E8]">
        <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 block mb-1">
          Your Active Plan
        </span>
        <p className="font-black text-base text-[#0D0D0D]">{intervention.type}</p>
        {intervention.details?.schedule && (
          <p className="text-sm text-neutral-600 mt-1">
            Schedule: {intervention.details.schedule as string}
          </p>
        )}
        {intervention.details?.subject && (
          <p className="text-sm text-neutral-600">
            Subject: {intervention.details.subject as string}
          </p>
        )}
        <p className="text-xs font-mono text-neutral-500 mt-2">
          Assigned: {assignedDate ?? '—'}
          {daysSinceAssign !== null && ` · ${daysSinceAssign} day${daysSinceAssign !== 1 ? 's' : ''} ago`}
        </p>
      </div>

      {/* Reminder banner */}
      {showReminder && (
        <div className="flex items-start gap-3 p-3 bg-[#FFF8E0] border-2 border-[#F4C430]">
          <RefreshCw className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
          <div>
            <p className="text-sm font-black text-[#0D0D0D]">Gentle reminder — your mentor is waiting for your response.</p>
            <p className="text-xs text-neutral-600 mt-0.5">Please tap one of the options below. It only takes a moment.</p>
          </div>
        </div>
      )}

      {/* Supportive context */}
      <div className="p-3 bg-[#E8F4FD] border border-neutral-200 text-xs text-neutral-700 font-medium leading-relaxed">
        <strong>Why is this plan here?</strong> Your attendance and/or academic progress has been flagged for a check-in.
        This is <em>not</em> a penalty — it is here to help you get the support you need, early.
        You are not labelled a &quot;dropout&quot;. Responding honestly is the best thing you can do.
      </div>

      {/* Response buttons */}
      {submitted ? (
        <div className="p-4 border-2 border-[#0D0D0D] bg-[#E8F8F0]">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-5 h-5 text-[#2D9D5F]" />
            <span className="font-black text-sm text-[#0D0D0D]">Response submitted</span>
          </div>
          <p className="text-sm text-neutral-700">
            You selected: <strong>{RESPONSE_OPTIONS.find((o) => o.type === selected)?.label}</strong>
          </p>
          {planResponse?.respondedAt && (
            <p className="text-xs font-mono text-neutral-500 mt-1">
              At: {new Date(planResponse.respondedAt).toLocaleString('en-IN')}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 block">
            How would you like to respond?
          </span>
          {RESPONSE_OPTIONS.map(({ type, label, color, icon: Icon, note }) => (
            <button
              key={type}
              onClick={() => handleSubmit(type)}
              className={`w-full flex items-start gap-3 p-4 border-2 border-[#0D0D0D] text-left font-black transition-all ${color}`}
            >
              <Icon className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <span className="block text-sm">{label}</span>
                {note && <span className="block text-xs font-medium opacity-80 mt-0.5">{note}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Welfare cell contact — shown when student needs support */}
      {needsWelfare && (
        <div className="p-4 border-2 border-[#0D0D0D] bg-neutral-100">
          <span className="text-[11px] font-black uppercase tracking-wider text-[#0D0D0D] block mb-2">
            🤝 Welfare Cell Contact
          </span>
          <p className="font-black text-sm text-[#0D0D0D] mb-2">{WELFARE_CELL.name}</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`tel:${WELFARE_CELL.phone}`}
              className="neo-btn px-3 py-1.5 bg-[#0D0D0D] text-white text-xs font-black uppercase tracking-wider"
            >
              📞 Call
            </a>
            <a
              href={`mailto:${WELFARE_CELL.email}`}
              className="neo-btn px-3 py-1.5 bg-white text-[#0D0D0D] text-xs font-black uppercase tracking-wider border-2 border-[#0D0D0D]"
            >
              ✉ Email
            </a>
          </div>
          <p className="text-xs text-neutral-600 mt-2">
            {WELFARE_CELL.phone} · {WELFARE_CELL.email}
          </p>
          <p className="text-[11px] text-neutral-500 mt-2 font-medium">
            Reaching out to the welfare cell is completely confidential. You are not in trouble.
          </p>
        </div>
      )}
    </div>
  );
};
