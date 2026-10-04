'use client';

import React, { useState } from 'react';
import { StudentStatusData, StudentDetail } from '@/lib/types';
import {
  Calendar,
  Clock,
  CheckCircle,
  User,
  Heart,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Phone,
  Mail,
  ArrowRight,
} from 'lucide-react';

const WELFARE_CELL = {
  name: 'Student Welfare Cell',
  phone: '+91 98765 00000',
  email: 'welfare@college.example.com',
};

const RESPONSE_OPTIONS = [
  {
    type: 'will_attend',
    label: 'I will attend',
    bg: 'bg-[#4ADE80]',
    border: 'border-[#0D0D0D]',
    text: 'text-[#0D0D0D]',
    icon: CheckCircle,
  },
  {
    type: 'need_different_time',
    label: 'I need a different time',
    bg: 'bg-[#F4C430]',
    border: 'border-[#0D0D0D]',
    text: 'text-[#0D0D0D]',
    icon: Clock,
    note: 'Your mentor will find another slot.',
  },
  {
    type: 'need_to_talk',
    label: 'I need to talk to someone',
    bg: 'bg-[#FB923C]',
    border: 'border-[#0D0D0D]',
    text: 'text-white',
    icon: Heart,
    note: 'Your mentor will be alerted. Welfare cell contact shown below.',
  },
  {
    type: 'cant_take_part',
    label: "I can't take part right now",
    bg: 'bg-neutral-200',
    border: 'border-[#0D0D0D]',
    text: 'text-[#0D0D0D]',
    icon: AlertTriangle,
    note: 'No penalty for honesty. Your mentor will follow up.',
  },
];

interface StudentFacingStatusViewProps {
  statusData: StudentStatusData;
  allStudents?: { studentId: string; name: string }[];
  studentDetail?: StudentDetail;
  onSelectDifferentStudent?: (studentId: string) => void;
  onSwitchToMentor?: () => void;
}

export const StudentFacingStatusView: React.FC<StudentFacingStatusViewProps> = ({
  statusData,
  allStudents = [],
  studentDetail,
  onSelectDifferentStudent,
  onSwitchToMentor,
}) => {
  const [response, setResponse] = useState<string | null>(null);
  const [showHowWorkedOut, setShowHowWorkedOut] = useState(false);

  const intervention = statusData.activeIntervention;
  const showsActivePlan =
    Boolean(intervention) &&
    intervention!.status !== 'Resolved' &&
    intervention!.status !== 'Notified';

  const firstName = statusData.name.split(' ')[0];
  const mentorLabel = 'your mentor';

  const handleRespond = async (type: string) => {
    setResponse(type);
    try {
      await fetch('/api/students/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: statusData.studentId, status: type }),
      });
    } catch (_) {}
  };

  const needsWelfare = response === 'need_to_talk' || response === 'cant_take_part';
  const planTitle =
    intervention?.type === 'Extra Class'
      ? `Extra Class — ${String(intervention.details.subject || 'General Subject')}`
      : intervention?.type === 'Counseling'
      ? `Check-in Session${intervention.details.counselorName ? ` with ${String(intervention.details.counselorName)}` : ''}`
      : intervention?.type === 'Academic Support'
      ? `Academic Support — ${String(intervention.details.supportSubjects || 'Your Subjects')}`
      : intervention?.type === 'Financial Aid Referral'
      ? 'Financial Aid Referral'
      : 'Support Plan';

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* ── Top Bar ── */}
      <div className="neo-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#0D0D0D] text-white flex items-center justify-center border-2 border-[#0D0D0D] shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 block">
              Student Academic Portal
            </span>
            <span className="text-xs font-bold text-[#0D0D0D]">
              {statusData.name}{' '}
              <span className="font-mono text-neutral-500">({statusData.studentId})</span>
            </span>
          </div>
        </div>

        {allStudents.length > 0 && onSelectDifferentStudent && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-500 uppercase">Simulate:</span>
            <select
              value={statusData.studentId}
              onChange={(e) => onSelectDifferentStudent(e.target.value)}
              className="neo-input text-xs py-1 px-2 font-bold"
            >
              {allStudents.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.name} ({s.studentId})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Greeting Banner ── */}
      <div className="neo-card p-6 bg-[#FFFDEB]">
        <h1 className="text-2xl md:text-3xl font-black text-[#0D0D0D] uppercase tracking-tight leading-tight">
          Hi {firstName}.<br />Your college is here to help.
        </h1>
        <p className="mt-2 text-sm font-semibold text-neutral-600 max-w-md">
          Here is the support set up for you. You choose what happens next — no pressure, no punishment.
        </p>
      </div>

      {/* ── Active Plan ── */}
      {showsActivePlan && intervention ? (
        <div className="neo-card overflow-hidden">
          {/* Plan header */}
          <div className="p-4 bg-[#4ADE80] border-b-2 border-[#0D0D0D] flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#0D0D0D] flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                Active Support Plan
              </span>
              <h2 className="text-lg font-black text-[#0D0D0D] mt-0.5">{planTitle}</h2>
            </div>
            <span className="px-2 py-0.5 bg-[#0D0D0D] text-white text-[10px] font-black uppercase border border-[#0D0D0D] shrink-0">
              {intervention.status}
            </span>
          </div>

          {/* Plan details */}
          <div className="p-4 grid grid-cols-2 gap-3 border-b-2 border-[#0D0D0D]">
            <div className="p-3 bg-neutral-50 border-2 border-[#0D0D0D]">
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 flex items-center gap-1 mb-1">
                <Calendar className="w-3 h-3" /> Assigned
              </span>
              <span className="font-mono text-sm font-bold text-[#0D0D0D]">{intervention.assignedDate}</span>
            </div>
            <div className="p-3 bg-neutral-50 border-2 border-[#0D0D0D]">
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3" /> Schedule
              </span>
              <span className="font-mono text-sm font-bold text-[#0D0D0D]">
                {String(intervention.details.schedule || 'To be confirmed')}
              </span>
            </div>
          </div>

          {/* Supportive note */}
          <div className="px-4 py-3 bg-white border-b-2 border-[#0D0D0D]">
            <p className="text-xs font-semibold text-neutral-700">
              This is <strong>not</strong> a penalty. It is here to help you get the right support early. Responding honestly is the best thing you can do.
            </p>
          </div>

          {/* Response section */}
          <div className="p-4 bg-white">
            <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 block mb-3">
              How would you like to respond?
            </span>

            {response ? (
              <div className="p-4 border-2 border-[#0D0D0D] bg-[#E8F8F0] shadow-[3px_3px_0px_#0D0D0D] flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-[#2D9D5F] shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-sm text-[#0D0D0D]">Response submitted — {mentorLabel} has been notified.</p>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    You selected: <strong>{RESPONSE_OPTIONS.find((o) => o.type === response)?.label}</strong>
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {RESPONSE_OPTIONS.map(({ type, label, bg, border, text, icon: Icon, note }) => (
                  <button
                    key={type}
                    id={`respond-${type}-btn`}
                    onClick={() => handleRespond(type)}
                    className={`flex flex-col gap-1 text-left p-3 border-2 ${border} ${bg} ${text} font-black text-sm shadow-[3px_3px_0px_#0D0D0D] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0px_#0D0D0D] transition-all`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4 shrink-0" />
                      {label}
                    </span>
                    {note && <span className="text-[10px] font-semibold opacity-80 pl-6">{note}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── No active plan ── */
        <div className="neo-card p-8 text-center bg-[#E8F8F0]">
          <div className="w-12 h-12 bg-[#2D9D5F] text-white border-2 border-[#0D0D0D] shadow-[3px_3px_0px_#0D0D0D] flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black uppercase text-[#0D0D0D]">All clear — no sessions scheduled</h2>
          <p className="text-sm font-semibold text-neutral-600 mt-2 max-w-xs mx-auto">
            Your academic standing is currently on track. Your mentor will reach out if anything needs attention.
          </p>
          <span className="mt-4 inline-block px-3 py-1 bg-white border-2 border-[#0D0D0D] font-mono text-xs font-bold text-neutral-600 shadow-[2px_2px_0px_#0D0D0D]">
            Account Status: Clear
          </span>
        </div>
      )}

      {/* ── Positives first ── */}
      <div className="neo-card p-4">
        <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 block mb-2">
          Things Going Well
        </span>
        <p className="text-sm font-semibold text-[#0D0D0D]">
          {studentDetail?.attendanceHistory &&
          studentDetail.attendanceHistory.length > 0 &&
          studentDetail.attendanceHistory[studentDetail.attendanceHistory.length - 1].percentage > 75
            ? '✓ Your recent attendance has been strong. Good job staying engaged!'
            : '✓ Showing up and replying already counts. We notice your effort.'}
        </p>
      </div>

      {/* ── Where we can help ── */}
      {studentDetail?.contributingFactors && studentDetail.contributingFactors.length > 0 && (
        <div className="neo-card p-4 space-y-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 block mb-1">
            Where We Can Help
          </span>
          {studentDetail.contributingFactors.map((f, i) => {
            let text = '';
            if (f.factor.includes('Attendance'))
              text = 'Catch up on missed classes with peer tutoring.';
            else if (f.factor.includes('Grade'))
              text = 'Study groups and extra tutoring to help you master the material.';
            else if (f.factor.includes('Fee'))
              text = 'The finance office can guide you through instalment options.';
            else if (f.factor.includes('Backlog'))
              text = 'Guidance on electives and planning to clear pending subjects.';
            else
              text = 'Counseling and branch guidance to make sure you are comfortable here.';
            return (
              <div key={i} className="flex items-start gap-2.5 p-3 border-2 border-[#0D0D0D] bg-[#FFFDEB]">
                <Heart className="w-4 h-4 text-[#D62828] shrink-0 mt-0.5" />
                <span className="text-xs font-semibold text-[#0D0D0D]">{text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Next steps ── */}
      <div className="neo-card p-4">
        <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 block mb-2">
          Next Small Steps
        </span>
        <ul className="space-y-2">
          {[
            `Reply to ${mentorLabel}'s message if you haven't already.`,
            'Attend your next scheduled class.',
          ].map((step, i) => (
            <li key={i} className="flex items-center gap-2.5 p-2.5 border-2 border-[#0D0D0D] bg-white">
              <ArrowRight className="w-4 h-4 text-[#0D0D0D] shrink-0" />
              <span className="text-xs font-semibold text-[#0D0D0D]">{step}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── People who can help ── */}
      <div className="neo-card p-4 space-y-3">
        <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 block">
          People Who Can Help
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 border-2 border-[#0D0D0D] bg-white">
            <p className="font-black text-sm text-[#0D0D0D]">Your Mentor / Coordinator</p>
            <p className="text-xs font-semibold text-neutral-500 mt-0.5">Available to guide you through your academic journey.</p>
          </div>
          <div className="p-3 border-2 border-[#0D0D0D] bg-neutral-100">
            <p className="font-black text-sm text-[#0D0D0D]">{WELFARE_CELL.name}</p>
            <p className="text-xs font-mono text-neutral-600 mt-0.5">{WELFARE_CELL.phone}</p>
            <p className="text-xs font-mono text-neutral-600">{WELFARE_CELL.email}</p>
          </div>
        </div>

        {/* Welfare contact links when needed */}
        {needsWelfare && (
          <div className="p-3 border-2 border-[#D62828] bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <p className="text-xs font-black text-[#0D0D0D] uppercase tracking-wide">Reach out — completely confidential</p>
            <div className="flex gap-2">
              <a
                href={`tel:${WELFARE_CELL.phone}`}
                className="neo-btn px-3 py-1.5 bg-[#0D0D0D] text-white text-xs font-black uppercase flex items-center gap-1"
              >
                <Phone className="w-3.5 h-3.5" /> Call
              </a>
              <a
                href={`mailto:${WELFARE_CELL.email}`}
                className="neo-btn px-3 py-1.5 bg-white text-[#0D0D0D] border-2 border-[#0D0D0D] text-xs font-black uppercase flex items-center gap-1"
              >
                <Mail className="w-3.5 h-3.5" /> Email
              </a>
            </div>
          </div>
        )}

        {/* Anonymous help — always visible */}
        <button
          id="anonymous-help-btn"
          className="w-full py-2.5 border-2 border-[#0D0D0D] bg-white text-[#0D0D0D] text-xs font-black uppercase tracking-wider hover:bg-[#FFFDEB] transition-colors shadow-[2px_2px_0px_#0D0D0D] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
        >
          I Need Help (Anonymous)
        </button>
      </div>

      {/* ── Honesty note ── */}
      <div className="p-4 border-2 border-neutral-300 bg-white text-[11px] font-semibold text-neutral-500 text-center leading-relaxed">
        Your mentor and, if needed, the student welfare cell can see your plan and attendance.
        Your college may contact your parent or guardian in line with its policy.{' '}
        <strong className="text-[#0D0D0D]">Nothing here is a punishment.</strong>
      </div>

      {/* ── How was this worked out ── */}
      <div className="neo-card overflow-hidden">
        <button
          id="how-worked-out-toggle"
          onClick={() => setShowHowWorkedOut(!showHowWorkedOut)}
          className="w-full p-4 flex items-center justify-between bg-white hover:bg-[#FFFDEB] transition-colors"
        >
          <span className="text-xs font-black uppercase tracking-wider text-[#0D0D0D]">How was this worked out?</span>
          {showHowWorkedOut ? (
            <ChevronUp className="w-4 h-4 text-neutral-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-neutral-500" />
          )}
        </button>
        {showHowWorkedOut && (
          <div className="p-4 bg-neutral-50 border-t-2 border-[#0D0D0D] text-xs font-semibold text-neutral-600 leading-relaxed">
            This plan is based on your recent attendance, tests, backlogs, fees, and your counseling answers.
            We use this data simply to make sure we offer help exactly when you need it — not to judge you.
          </div>
        )}
      </div>

      {/* ── Switch to Staff View ── */}
      {onSwitchToMentor && (
        <div className="text-center pb-2">
          <button
            onClick={onSwitchToMentor}
            className="text-xs font-black uppercase tracking-wider text-neutral-400 hover:text-[#0D0D0D] underline transition-colors"
          >
            Switch to Staff View
          </button>
        </div>
      )}
    </div>
  );
};
