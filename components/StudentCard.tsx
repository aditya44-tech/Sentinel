import React from 'react';
import { StudentSummary } from '@/lib/types';
import { RiskBadge } from './RiskBadge';
import { InterventionStatusBadge } from './InterventionStatusBadge';
import { ChevronRight } from 'lucide-react';

interface StudentCardProps {
  student: StudentSummary;
  onSelect: (studentId: string) => void;
}

export const StudentCard: React.FC<StudentCardProps> = ({ student, onSelect }) => {
  return (
    <div
      id={`student-card-${student.studentId}`}
      onClick={() => onSelect(student.studentId)}
      className="neo-card p-4 cursor-pointer hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0px_#0D0D0D] transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="font-mono text-xs font-bold text-neutral-500">{student.studentId}</span>
          <h3 className="text-base font-black text-[#0D0D0D] leading-tight">{student.name}</h3>
          <p className="text-xs font-semibold text-neutral-700 mt-0.5">
            {student.department} • Year {student.year}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono font-black text-xl text-[#0D0D0D]">
            {student.riskScore}
            <span className="text-xs text-neutral-500 font-sans">/100</span>
          </div>
          <span className="text-xs font-extrabold uppercase tracking-wide text-neutral-500">
            Risk Score
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t-2 border-[#0D0D0D] mt-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <RiskBadge riskLevel={student.riskLevel} size="sm" />
          <InterventionStatusBadge status={student.interventionStatus} size="sm" />
          {student.isPriority && (
            <span className="inline-flex items-center px-1.5 py-0.5 bg-[#D62828] text-white text-[10px] font-black uppercase border border-[#0D0D0D]">
              Urgent Priority
            </span>
          )}
          {student.escalationStatusLabel && student.escalationStatusLabel !== 'None' && (
            <span className="inline-flex items-center px-1.5 py-0.5 bg-neutral-200 text-[#0D0D0D] text-[10px] font-bold border border-[#0D0D0D]">
              {student.escalationStatusLabel}
            </span>
          )}
        </div>
        <button
          className="inline-flex items-center gap-1 font-bold text-xs uppercase px-2 py-1 bg-[#0D0D0D] text-white border-2 border-[#0D0D0D] shadow-[2px_2px_0px_#0D0D0D]"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(student.studentId);
          }}
        >
          <span>View</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
