import React, { useState } from 'react';
import { ActionType, MentorActionPayload } from '@/lib/types';
import { getActionTypeForSuggestion } from '@/lib/riskEngine';
import {
  ArrowLeft,
  CheckCircle,
  Send,
  Sparkles,
  Info,
  Calendar,
  BookOpen,
  UserCheck,
  Zap,
} from 'lucide-react';

interface MentorActionPanelProps {
  student: import('@/lib/types').StudentDetail;
  onBack: () => void;
  onSubmitSuccess: (payload: MentorActionPayload) => void;
  onNavigateToOutcomeView?: (studentId: string) => void;
}

export const MentorActionPanel: React.FC<MentorActionPanelProps> = ({
  student,
  onBack,
  onSubmitSuccess,
  onNavigateToOutcomeView,
}) => {
  const studentId = student.studentId;
  const studentName = student.name;
  const riskScore = student.riskScore;
  const suggestedAction = student.suggestedAction || 'Monitor';
  const dominantFactor = student.contributingFactors?.[0]?.factor || 'Risk Factors';
  // The engine owns the recommendation wording → intervention type mapping.
  const getInitialActionType = getActionTypeForSuggestion;

  const availableSubjects = Array.from(new Set([
    ...(student.subjectAttendance?.map(s => s.subject) || []),
    ...(student.backlogSubjects?.flatMap(s => s.split(/[,;]/).map(str => str.trim()).filter(Boolean)) || []),
    'Data Structures', 'DBMS', 'Computational Math', 'Computer Network', 'Python Programming'
  ]));

  // Recommend subject: the engine's own recommendation wins (it already picked
  // the weakest subject and prints it after the colon), then a backlog subject,
  // then whichever subject has the lowest attendance.
  const suggestedSubject = suggestedAction.includes(':')
    ? suggestedAction.slice(suggestedAction.indexOf(':') + 1).trim()
    : '';
  const parsedBacklogSubjects = (student.backlogSubjects || [])
    .flatMap(s => s.split(/[,;]/).map(str => str.trim()).filter(Boolean));

  let recommendedSubject = availableSubjects[0];
  let recommendationReason = '';

  if (suggestedSubject && availableSubjects.includes(suggestedSubject)) {
    recommendedSubject = suggestedSubject;
    recommendationReason = 'Engine Pick';
  } else if (parsedBacklogSubjects.length > 0) {
    recommendedSubject = parsedBacklogSubjects[0];
    recommendationReason = 'Low Grade';
  } else if (student.subjectAttendance && student.subjectAttendance.length > 0) {
    recommendedSubject = student.subjectAttendance.reduce((min, curr) => curr.percentage < min.percentage ? curr : min, student.subjectAttendance[0]).subject;
    recommendationReason = 'Low Attendance';
  }

  const defaultFeeNotes = student.feeOverdueDays ? `Overdue by ${student.feeOverdueDays} days. Status: ${student.feeStatus}` : '';

  const [actionType, setActionType] = useState<ActionType>(getInitialActionType(suggestedAction));
  const [subject, setSubject] = useState(recommendedSubject);
  const [schedule, setSchedule] = useState('');
  const [instructor, setInstructor] = useState('');
  const [counselingType, setCounselingType] = useState('Academic');
  const [counselorName, setCounselorName] = useState('');
  const [referredDepartment, setReferredDepartment] = useState('Accounts Office');
  const [feeNotes, setFeeNotes] = useState(defaultFeeNotes);
  const [supportType, setSupportType] = useState('Tutoring');
  const [supportSubjects, setSupportSubjects] = useState(recommendedSubject);
  const [contactMethod, setContactMethod] = useState('Email');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedBy] = useState('Mentor');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  const [submittedPayload, setSubmittedPayload] = useState<MentorActionPayload | null>(null);
  const [groqRationale, setGroqRationale] = useState<string>('');
  const [rationaleLoading, setRationaleLoading] = useState(false);
  const [rationaleSource, setRationaleSource] = useState<'groq' | 'fallback' | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let details: any = {};
    let status = 'Active';

    switch (actionType) {
      case 'Extra Class':
        details = { subject: subject.trim(), schedule: schedule.trim(), instructor: instructor.trim() };
        break;
      case 'Counseling':
        details = { counselingType, schedule: schedule.trim() || startDate, counselorName: counselorName.trim() || assignedBy };
        break;
      case 'Financial Aid Referral':
        details = { referredDepartment: referredDepartment.trim(), feeNotes: feeNotes.trim() };
        status = 'Referred';
        break;
      case 'Academic Support':
        details = { supportType, supportSubjects: supportSubjects.split(',').map(s => s.trim()) };
        break;
      case 'Parent/Guardian Notified':
        details = { contactMethod };
        status = 'Notified';
        break;
      case 'Other':
        details = { description: description.trim() };
        break;
      default:
        break;
    }

    const payload: MentorActionPayload = {
      studentId,
      type: actionType,
      details,
      notes: notes.trim(),
      assignedBy,
      startDate,
      status
    };

    console.log('[MentorActionPanel] Created intervention payload:', payload);
    setSubmittedPayload(payload);
    onSubmitSuccess(payload);

    // Fetch Groq rationale async
    setRationaleLoading(true);
    try {
      const res = await fetch('/api/groq/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'rationale',
          studentName: studentName,
          riskScore: riskScore,
          actionType: actionType,
          dominantFactor: dominantFactor
        })
      });
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      setGroqRationale(data.text);
      setRationaleSource(Boolean(data.powered) && !data.fallback ? 'groq' : 'fallback');
    } catch {
      setGroqRationale(`"${actionType}" is the recommended intervention based on ${studentName}'s primary risk factor.`);
      setRationaleSource('fallback');
    } finally {
      setRationaleLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          id="action-panel-back-btn"
          onClick={onBack}
          className="neo-btn px-3.5 py-1.5 bg-white text-[#0D0D0D] text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Student Profile</span>
        </button>

      </div>

      {/* Success Confirmation Modal / Card if submitted */}
      {submittedPayload && (
        <div className="neo-card p-6 bg-[#4ADE80] text-[#0D0D0D] space-y-4 border-[3px] border-[#0D0D0D]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#0D0D0D] text-white flex items-center justify-center font-black border-2 border-[#0D0D0D]">
              ✓
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-[#0D0D0D]">
                Intervention Assigned Successfully
              </h2>
              <p className="text-xs font-bold text-[#0D0D0D]">
                Payload formatted and recorded for student {studentName} ({studentId}).
              </p>
            </div>
          </div>

          {/* Groq Rationale */}
          <div className="bg-white text-[#0D0D0D] p-4 border-2 border-white">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-[#D62828]" />
              <span className="text-xs font-black uppercase tracking-wider text-neutral-600">
                {rationaleSource === 'groq' ? 'AI Rationale (Groq)' : 'Intervention Rationale'}
              </span>
              {!rationaleLoading && rationaleSource === 'fallback' && (
                <span className="text-[10px] font-black uppercase tracking-wider bg-neutral-200 text-neutral-700 px-1.5 py-0.5 border border-[#0D0D0D]">
                  Structured Fallback
                </span>
              )}
            </div>
            {rationaleLoading ? (
              <div className="animate-pulse space-y-1.5">
                <div className="h-3 bg-neutral-200 w-3/4 rounded"></div>
                <div className="h-3 bg-neutral-200 w-full rounded"></div>
              </div>
            ) : (
              <p className="text-sm font-medium text-[#0D0D0D] leading-relaxed select-none">{groqRationale}</p>
            )}
          </div>



          <div className="flex flex-wrap items-center gap-3 pt-2">

            {onNavigateToOutcomeView && (
              <button
                id="view-outcome-btn"
                onClick={() => onNavigateToOutcomeView(studentId)}
                className="neo-btn px-4 py-2 bg-[#F4C430] text-[#0D0D0D] text-xs font-black uppercase tracking-wider"
              >
                View Outcome Comparison
              </button>
            )}
            <button
              onClick={onBack}
              className="neo-btn px-4 py-2 bg-[#0D0D0D] text-white text-xs font-black uppercase tracking-wider ml-auto"
            >
              Done &amp; Return
            </button>
          </div>
        </div>
      )}

      {/* Main Intervention Form Card - hidden after submission */}
      {!submittedPayload && (
      <div className="neo-card p-6 md:p-8 bg-white">
        <div className="border-b-2 border-[#0D0D0D] pb-4 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-5 h-5 text-[#D62828]" />
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-[#0D0D0D]">
              Assign Student Intervention Plan
            </h1>
          </div>
          <p className="text-xs text-neutral-600 font-semibold">
            Configuring formalized retention protocol for candidate{' '}
            <span className="font-black text-[#0D0D0D] underline">{studentName}</span> (
            <span className="font-mono font-bold text-[#0D0D0D]">{studentId}</span>).
          </p>
        </div>

        {/* Suggestion Context Header */}
        <div className="p-3.5 mb-6 bg-[#FFFDEB] border-2 border-[#0D0D0D] flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-[#D62828] shrink-0" />
          <div className="text-xs">
            <span className="font-extrabold uppercase tracking-wider text-neutral-600 block">
              Automated Suggestion Context
            </span>
            <span className="font-black text-sm text-[#0D0D0D]">{suggestedAction}</span>
            {student.contributingFactors?.length > 0 && (
              <span className="font-bold text-[#D62828] block mt-0.5">
                Suggested due to: {student.contributingFactors[0].reason}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Action Type Dropdown */}
          <div className="space-y-1.5">
            <label
              htmlFor="action-type-select"
              className="block font-black text-xs uppercase tracking-wider text-[#0D0D0D]"
            >
              Action Type <span className="text-[#D62828]">*</span>
            </label>
            <select
              id="action-type-select"
              value={actionType}
              onChange={(e) => setActionType(e.target.value as ActionType)}
              className="neo-input w-full p-2.5 text-sm font-bold"
              required
            >
              <option value="Extra Class">Extra Class</option>
              <option value="Counseling">Counseling</option>
              <option value="Financial Aid Referral">Financial Aid Referral</option>
              <option value="Academic Support">Academic Support</option>
              <option value="Parent/Guardian Notified">Parent/Guardian Notified</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Conditional Fields */}
          {actionType === 'Extra Class' && (
            <div className="p-4 bg-[#F5F1E8] border-2 border-[#0D0D0D] space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b-2 border-[#0D0D0D]">
                <BookOpen className="w-4 h-4 text-[#0D0D0D]" />
                <span className="text-xs font-black uppercase tracking-wider text-[#0D0D0D]">
                  Extra Class Logistics
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Subject <span className="text-[#D62828]">*</span></label>
                  <select required value={subject} onChange={(e) => setSubject(e.target.value)} className="neo-input w-full p-2 text-sm font-bold">
                    {availableSubjects.map(s => (
                      <option key={s} value={s}>
                        {s} {s === recommendedSubject && recommendationReason ? `(Recommended - ${recommendationReason})` : s === recommendedSubject ? '(Recommended)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Schedule <span className="text-[#D62828]">*</span></label>
                  <input type="text" required value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="e.g. Tue/Thu 4pm" className="neo-input w-full p-2 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Instructor (Optional)</label>
                <input type="text" value={instructor} onChange={(e) => setInstructor(e.target.value)} placeholder="e.g. Prof. Mehta" className="neo-input w-full p-2 text-sm" />
              </div>
            </div>
          )}

          {actionType === 'Counseling' && (
            <div className="p-4 bg-[#F5F1E8] border-2 border-[#0D0D0D] space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Counseling Type <span className="text-[#D62828]">*</span></label>
                  <select value={counselingType} onChange={(e) => setCounselingType(e.target.value)} className="neo-input w-full p-2 text-sm">
                    <option value="Academic">Academic</option>
                    <option value="Personal">Personal</option>
                    <option value="Attendance-related">Attendance-related</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Scheduled Date/Time</label>
                  <input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} className="neo-input w-full p-2 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Counselor Name (Optional)</label>
                <input type="text" value={counselorName} onChange={(e) => setCounselorName(e.target.value)} placeholder={`Defaults to ${assignedBy}`} className="neo-input w-full p-2 text-sm" />
              </div>
            </div>
          )}

          {actionType === 'Financial Aid Referral' && (
            <div className="p-4 bg-[#F5F1E8] border-2 border-[#0D0D0D] space-y-4">
              <div className="space-y-1">
                <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Referred Department <span className="text-[#D62828]">*</span></label>
                <input type="text" required value={referredDepartment} onChange={(e) => setReferredDepartment(e.target.value)} placeholder="e.g. Accounts Office" className="neo-input w-full p-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Fee Notes</label>
                <input type="text" value={feeNotes} onChange={(e) => setFeeNotes(e.target.value)} className="neo-input w-full p-2 text-sm" />
              </div>
            </div>
          )}

          {actionType === 'Academic Support' && (
            <div className="p-4 bg-[#F5F1E8] border-2 border-[#0D0D0D] space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Support Type <span className="text-[#D62828]">*</span></label>
                  <select value={supportType} onChange={(e) => setSupportType(e.target.value)} className="neo-input w-full p-2 text-sm">
                    <option value="Tutoring">Tutoring</option>
                    <option value="Study Materials">Study Materials</option>
                    <option value="Peer Mentoring">Peer Mentoring</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Subject(s) Needing Support</label>
                  <input type="text" value={supportSubjects} onChange={(e) => setSupportSubjects(e.target.value)} placeholder="Comma separated subjects" className="neo-input w-full p-2 text-sm" />
                </div>
              </div>
            </div>
          )}

          {actionType === 'Parent/Guardian Notified' && (
            <div className="p-4 bg-[#F5F1E8] border-2 border-[#0D0D0D] space-y-4">
              <div className="space-y-1">
                <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Contact Method <span className="text-[#D62828]">*</span></label>
                <select value={contactMethod} onChange={(e) => setContactMethod(e.target.value)} className="neo-input w-full p-2 text-sm">
                  <option value="Call">Call</option>
                  <option value="Email">Email</option>
                  <option value="In-person meeting">In-person meeting</option>
                </select>
              </div>
            </div>
          )}

          {actionType === 'Other' && (
            <div className="p-4 bg-[#F5F1E8] border-2 border-[#0D0D0D] space-y-4">
              <div className="space-y-1">
                <label className="block font-bold text-xs uppercase tracking-wider text-[#0D0D0D]">Description <span className="text-[#D62828]">*</span></label>
                <input type="text" required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Discussed new study plan" className="neo-input w-full p-2 text-sm" />
              </div>
            </div>
          )}

          {/* Notes Textarea (Optional) */}
          <div className="space-y-1.5">
            <label
              htmlFor="notes-textarea"
              className="block font-black text-xs uppercase tracking-wider text-[#0D0D0D]"
            >
              Mentor Notes / Objectives (Optional)
            </label>
            <textarea
              id="notes-textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter context, goals, or check-in criteria for this intervention..."
              className="neo-input w-full p-2.5 text-sm"
            />
          </div>

          {/* Meta Information Bar */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-100 border-2 border-[#0D0D0D] text-xs font-mono">
            <div>
              <span className="font-sans font-extrabold uppercase text-neutral-500 block text-[10px]">
                Assigned By
              </span>
              <span className="font-bold text-[#0D0D0D]">{assignedBy}</span>
            </div>
            <div>
              <span className="font-sans font-extrabold uppercase text-neutral-500 block text-[10px]">
                Effective Start Date
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="neo-input bg-transparent border-none p-0 text-[#0D0D0D] font-bold outline-none"
              />
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onBack}
              className="neo-btn px-4 py-2.5 bg-white text-[#0D0D0D] text-xs font-bold"
            >
              Cancel
            </button>
            <button
              id="submit-intervention-btn"
              type="submit"
              className="neo-btn px-6 py-2.5 bg-[#D62828] text-white text-xs font-black uppercase tracking-wider flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Assign Intervention</span>
            </button>
          </div>
        </form>
      </div>
      )}
    </div>
  );
};
