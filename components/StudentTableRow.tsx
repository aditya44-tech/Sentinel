import React from 'react';
import { StudentSummary } from '@/lib/types';
import { RiskBadge } from './RiskBadge';
import { InterventionStatusBadge } from './InterventionStatusBadge';
import { ChevronRight } from 'lucide-react';

interface StudentTableRowProps {
  student: StudentSummary;
  onSelect: (studentId: string) => void;
}

export const StudentTableRow: React.FC<StudentTableRowProps> = ({ student, onSelect }) => {
  return (
    <tr
      id={`student-row-${student.studentId}`}
      onClick={() => onSelect(student.studentId)}
      className="group cursor-pointer hover:bg-[#FFFDEB] transition-colors border-b-2 border-[#0D0D0D]"
    >
      <td className="p-3.5 font-mono font-bold text-xs text-[#0D0D0D] border-r-2 border-[#0D0D0D] whitespace-nowrap">
        {student.studentId}
      </td>
      <td className="p-3.5 font-black text-sm text-[#0D0D0D] border-r-2 border-[#0D0D0D] whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span>{student.name}</span>
          <span className="text-xs px-1.5 py-0.2 bg-neutral-100 border border-[#0D0D0D] font-mono text-neutral-600">
            Yr {student.year}
          </span>
        </div>
      </td>
      <td className="p-3.5 text-xs font-semibold text-[#0D0D0D] border-r-2 border-[#0D0D0D] whitespace-nowrap">
        {student.department}
      </td>
      <td className="p-3.5 border-r-2 border-[#0D0D0D] whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="font-mono font-black text-sm text-[#0D0D0D] w-7 text-right">
            {student.riskScore}
          </span>
          <div className="w-20 bg-neutral-200 border border-[#0D0D0D] h-3.5 hidden sm:block">
            <div
              className={`h-full ${
                student.riskLevel === 'High'
                  ? 'bg-[#D62828]'
                  : student.riskLevel === 'Medium'
                  ? 'bg-[#F4C430]'
                  : 'bg-[#2D9D5F]'
              }`}
              style={{ width: `${Math.min(student.riskScore, 100)}%` }}
            />
          </div>
        </div>
      </td>
      <td className="p-3.5 border-r-2 border-[#0D0D0D] whitespace-nowrap">
        <RiskBadge riskLevel={student.riskLevel} size="sm" />
      </td>
      <td className="p-3.5 border-r-2 border-[#0D0D0D] whitespace-nowrap">
        <div className="flex flex-col gap-1">
          <InterventionStatusBadge status={student.interventionStatus} size="sm" />
          {student.isPriority && (
            <span className="inline-flex items-center w-fit px-1.5 py-0.5 bg-[#D62828] text-white text-[10px] font-black uppercase border border-[#0D0D0D]">
              Urgent Priority
            </span>
          )}
          {student.escalationStatusLabel && student.escalationStatusLabel !== 'None' && (
            <span className="inline-flex items-center w-fit px-1.5 py-0.5 bg-neutral-200 text-[#0D0D0D] text-[10px] font-bold border border-[#0D0D0D]">
              {student.escalationStatusLabel}
            </span>
          )}
        </div>
      </td>
      <td className="p-3.5 text-right whitespace-nowrap">
        <button
          id={`view-student-${student.studentId}-btn`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(student.studentId);
          }}
          className="inline-flex items-center gap-1 font-bold text-xs uppercase px-2.5 py-1 bg-white border-2 border-[#0D0D0D] shadow-[2px_2px_0px_#0D0D0D] group-hover:bg-[#0D0D0D] group-hover:text-white transition-all"
        >
          <span>Inspect</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
};
