import React, { useState, useEffect, useRef } from 'react';
import { StudentDetail } from '@/lib/types';
import { RiskBadge } from '@/components/RiskBadge';
import { TrendChart } from '@/components/TrendChart';
import { FactorBreakdownList } from '@/components/FactorBreakdownList';
import { CounselingCard } from '@/components/CounselingCard';
import { ContactPanel } from '@/components/ContactPanel';
import { computeEscalationStep } from '@/lib/counseling';
import { EscalationLadder } from '@/components/EscalationLadder';
import { computeRiskScore, RawStudentData } from '@/lib/riskEngine';
import { weekNum } from '@/lib/weeks';
import type { ContactLogEntry } from '@/lib/counseling';
import {
  ArrowLeft,
  Sparkles,
  CheckCircle,
  ExternalLink,
  Calendar,
  GraduationCap,
  RefreshCw,
  Clock,
  TrendingDown,
  Layers,
  Zap,
  MessageSquare,
  Phone,
} from 'lucide-react';


interface StudentDetailViewProps {
  student: StudentDetail;
  hasIntervention?: boolean;
  onBackToDashboard: () => void;
  onAssignAction: (studentId: string, suggestedAction: string) => void;
  onViewInterventions: (studentId: string) => void;
}

export const StudentDetailView: React.FC<StudentDetailViewProps> = ({
  student,
  hasIntervention = false,
  onBackToDashboard,
  onAssignAction,
  onViewInterventions,
}) => {
  const [groqExplanation, setGroqExplanation] = useState<string>(student.aiExplanation);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGroqPowered, setIsGroqPowered] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [groqError, setGroqError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'counseling' | 'contact' | 'escalation'>('overview');
  const [localContactLog, setLocalContactLog] = useState<ContactLogEntry[]>(student.contactLog ?? []);
  const lastFetchedId = useRef<string>('');

  // The lifecycle status is persisted on both the student record and the
  // intervention itself; either one saying "Resolved" means the plan is closed.
  const interventionResolved =
    student.interventionStatus === 'Resolved' || student.activeIntervention?.status === 'Resolved';

  // Synchronize local state on student view load.
  const q5Stress = student.counseling?.answers?.find((a: any) => a.questionId === 'Q5')?.rating;
  const lastContactDate = student.contactLog && student.contactLog.length > 0
    ? [...student.contactLog].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
    : null;
  const escalation = student.activeIntervention ? computeEscalationStep(
    student.activeIntervention.assignedDate,
    lastContactDate,
    student.planResponse?.responseType || null,
    student.riskLevel,
    null,
    q5Stress
  ) : null;

  // With no contributing factors the engine recommends "Monitor" — routine
  // observation, not a case to open. Offering an assignable action there led to
  // empty "Other" interventions, so the banner becomes informational instead.
  const noRiskFactors = (student.contributingFactors?.length ?? 0) === 0;

  useEffect(() => {
    setGroqExplanation(student.aiExplanation);
    setIsGroqPowered(false);
    setUsedFallback(false);
    setAiModel(null);
    setGroqError(null);
    setLocalContactLog(student.contactLog ?? []);
    if (lastFetchedId.current !== student.studentId && !student.aiExplanation) {
      handleRefreshGroq();
    }
  }, [student.studentId]);

  const handleRefreshGroq = async () => {
    setIsAiLoading(true);
    setGroqError(null);
    try {
      const res = await fetch('/api/groq/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'explain',
          studentId: student.studentId,
          studentName: student.name,
          department: student.department,
          year: student.year,
          riskScore: student.riskScore,
          riskLevel: student.riskLevel,
          contributingFactors: student.contributingFactors,
          // Include counseling reason in narrative context if available
          counselingReason: student.counseling?.reasonCode ?? null,
        })
      });
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();

      const newExplanation = data.text || student.aiExplanation;
      setGroqExplanation(newExplanation);

      const powered = Boolean(data.powered) && !data.fallback;
      setIsGroqPowered(powered);
      setUsedFallback(!powered);
      if (data.model) setAiModel(data.model);
      if (!powered) {
        setGroqError(
          data.error
            ? `Live AI narrative unavailable (${data.error}) — showing structured analysis.`
            : 'Live AI narrative unavailable — showing structured analysis.',
        );
      }

      if (powered && data.text) {
        await fetch(`/api/students/${student.studentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aiExplanation: data.text })
        });
      }
    } catch {
      setUsedFallback(true);
      setGroqError('Groq API unavailable: showing structured analysis.');
    } finally {
      setIsAiLoading(false);
      lastFetchedId.current = student.studentId;
    }
  };

  const handleAddContactLog = async (entry: ContactLogEntry) => {
    const newLog = [...localContactLog, entry];
    setLocalContactLog(newLog);
    // Persist to server
    try {
      await fetch(`/api/students/${student.studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactLog: newLog }),
      });
    } catch {
      console.error('Failed to save contact log');
    }
  };

  const hasCounseling = !!student.counseling;
  const hasContact = !!student.contactInfo;
  const hasIntv = !!student.activeIntervention;

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    ...(hasCounseling ? [{ key: 'counseling' as const, label: 'Counseling' }] : []),
    ...(hasContact ? [{ key: 'contact' as const, label: 'Contact' }] : []),
    ...(hasIntv ? [{ key: 'escalation' as const, label: 'Escalation' }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          id="back-to-dashboard-btn"
          onClick={onBackToDashboard}
          className="neo-btn px-3.5 py-1.5 bg-white text-[#0D0D0D] text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Cohort Overview</span>
        </button>

        <div className="flex items-center gap-2">
          {hasIntervention && (
            <button
              id="view-interventions-btn"
              onClick={() => onViewInterventions(student.studentId)}
              className="neo-btn px-3.5 py-1.5 bg-[#2563EB] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
            >
              <Layers className="w-4 h-4" />
              <span>View Interventions &amp; Outcome</span>
            </button>
          )}
          <span className="font-mono text-xs font-bold text-neutral-500 bg-white px-2 py-1 border-2 border-[#0D0D0D]">
            ID: {student.studentId}
          </span>
        </div>
      </div>

      {/* Header Profile Card */}
      <div className="neo-card p-5 md:p-6 bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-[#0D0D0D] pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono font-bold bg-[#0D0D0D] text-white px-2 py-0.5">
                {student.studentId}
              </span>
              <span className="text-xs font-bold text-neutral-600">
                Department of {student.department}
              </span>
              <span className="text-xs font-mono font-bold bg-neutral-100 border border-[#0D0D0D] px-2 py-0.5">
                Year {student.year}
              </span>
              {student.lastSemResult && (
                <span className="text-xs font-mono font-bold bg-[#F4C430] border border-[#0D0D0D] px-2 py-0.5" title="Last Semester Result">
                  Last Sem: {student.lastSemResult.score}%
                </span>
              )}
              {student.endSemResult && (
                <span className="text-xs font-mono font-bold bg-neutral-200 border border-[#0D0D0D] px-2 py-0.5" title="Current Semester Result">
                  This Sem: {student.endSemResult.status === 'Completed' ? `${student.endSemResult.score}%` : student.endSemResult.status}
                </span>
              )}
              {student.planResponse && !student.planResponse.responseType && (
                <span className="text-xs font-black bg-[#D62828] text-white px-2 py-0.5 border border-[#0D0D0D]">
                  NO RESPONSE
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-[#0D0D0D] tracking-tight">
              {student.name}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-500">
                Calculated Risk Score
              </span>
              <div className="flex items-baseline justify-end gap-1">
                <span className="font-mono text-3xl md:text-4xl font-black text-[#0D0D0D]">
                  {student.riskScore}
                </span>
                <span className="font-mono text-xs font-bold text-neutral-500">/100</span>
              </div>
              {student.scoreBreakdownNote && (
                <span className="text-[10px] font-mono text-neutral-500 block">
                  {student.scoreBreakdownNote}
                </span>
              )}
            </div>
            <div className="border-l-2 border-[#0D0D0D] pl-3 flex flex-col items-end gap-1">
              <RiskBadge riskLevel={student.riskLevel} size="lg" />
              {escalation && escalation.isPriority && (
                <span className="inline-flex items-center px-1.5 py-0.5 bg-[#D62828] text-white text-[10px] font-black uppercase border border-[#0D0D0D]">
                  Urgent Priority
                </span>
              )}
              {escalation && escalation.statusLabel && escalation.statusLabel !== 'None' && (
                <span className="inline-flex items-center px-1.5 py-0.5 bg-neutral-200 text-[#0D0D0D] text-[10px] font-bold border border-[#0D0D0D]">
                  {escalation.statusLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Prompt Banner */}
        {hasIntervention ? (
          <div className={`mt-5 p-4 border-2 border-[#0D0D0D] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[4px_4px_0px_#0D0D0D] ${interventionResolved ? 'bg-[#E8F8F0]' : 'bg-[#4ADE80]'}`}>
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#0D0D0D] flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                {interventionResolved ? 'Intervention Resolved' : 'Intervention Assigned'}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-base sm:text-lg font-black text-[#0D0D0D]">
                  {interventionResolved ? 'Resolved Intervention Plan' : 'Active Intervention Plan'}
                </div>
                <span
                  id="profile-intervention-status"
                  className={`px-2 py-0.5 border border-[#0D0D0D] text-[10px] font-black uppercase tracking-wider ${
                    interventionResolved ? 'bg-[#2D9D5F] text-white' : 'bg-[#2563EB] text-white'
                  }`}
                >
                  {interventionResolved ? 'Resolved' : 'Monitoring'}
                </span>
                <RiskBadge riskLevel={student.riskLevel} size="sm" />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                id="track-status-btn"
                onClick={() => onViewInterventions(student.studentId)}
                className="neo-btn px-4 py-2 bg-white text-[#0D0D0D] text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border-2 border-[#0D0D0D]"
              >
                <span>{interventionResolved ? 'View Outcome' : 'Track Status'}</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : noRiskFactors ? (
          <div className="mt-5 p-4 bg-[#E8F8F0] border-2 border-[#0D0D0D] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[4px_4px_0px_#0D0D0D]">
            <div className="space-y-0.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-[#2D9D5F]" />
                No Action Needed
              </span>
              <div className="text-base sm:text-lg font-black text-[#0D0D0D]">
                No risk factors detected — routine monitoring only
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <RiskBadge riskLevel={student.riskLevel} size="sm" />
            </div>
          </div>
        ) : (
          <div className="mt-5 p-4 bg-[#FFFDEB] border-2 border-[#0D0D0D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#D62828]" />
                System Recommended Action
              </span>
              <div className="text-base sm:text-lg font-black text-[#0D0D0D]">
                {student.suggestedAction}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                id="assign-action-btn"
                onClick={() => onAssignAction(student.studentId, student.suggestedAction)}
                className="neo-btn px-4 py-2 bg-[#D62828] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
              >
                <span>Assign This Action</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b-2 border-[#0D0D0D]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                activeTab === tab.key
                  ? 'border-[#D62828] text-[#D62828] bg-white'
                  : 'border-transparent text-neutral-500 hover:text-[#0D0D0D]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'overview' && (
        <>
          {/* Groq AI Diagnostic Explanation Box */}
          <div className="neo-card p-5 bg-white border-[3px] border-[#0D0D0D]">
            <div className="flex items-center justify-between mb-3 border-b-2 border-[#0D0D0D] pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-[#0D0D0D] text-white flex items-center justify-center font-bold text-xs border border-[#0D0D0D]">
                  AI
                </div>
                <h3 className="font-black text-sm uppercase tracking-wider text-[#0D0D0D]">
                  Predictive Risk Narrative &amp; Diagnostic Explanation
                </h3>
                {isGroqPowered && !isAiLoading && (
                  <span
                    className="flex items-center gap-1 text-[10px] font-black bg-[#0D0D0D] text-[#F4C430] px-1.5 py-0.5 border border-[#0D0D0D]"
                    title="Narrative generated live by the Groq API"
                  >
                    <Zap className="w-2.5 h-2.5" />
                    GROQ · {aiModel || 'qwen/qwen3.8-27b'}
                  </span>
                )}
                {usedFallback && !isAiLoading && (
                  <span
                    className="flex items-center gap-1 text-[10px] font-black bg-neutral-200 text-neutral-700 px-1.5 py-0.5 border border-[#0D0D0D]"
                    title="Deterministic template — the Groq call did not return a live narrative"
                  >
                    STRUCTURED FALLBACK
                  </span>
                )}
              </div>
              <button
                onClick={handleRefreshGroq}
                disabled={isAiLoading}
                title="Re-generate explanation via Groq API"
                className="text-xs font-bold text-neutral-600 hover:text-black flex items-center gap-1 cursor-pointer bg-neutral-100 px-2 py-1 border border-[#0D0D0D] disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isAiLoading ? 'animate-spin' : ''}`} />
                <span>{isAiLoading ? 'Generating...' : 'Refresh via Groq'}</span>
              </button>
            </div>

            <div className="p-4 bg-[#F5F1E8] border-2 border-[#0D0D0D] text-sm text-[#0D0D0D] font-medium leading-relaxed">
              <div className="flex items-start gap-2.5">
                <span className="w-3 h-3 bg-[#D62828] shrink-0 mt-1 border border-[#0D0D0D]" />
                <div className="space-y-2 flex-1">
                  <p className={isAiLoading ? 'opacity-75 transition-opacity' : ''}>
                    {groqExplanation || 'Generating diagnostic analysis...'}
                  </p>
                  {isAiLoading && (
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-600 pt-1">
                      <RefreshCw className="w-3 h-3 animate-spin text-[#D62828]" />
                      <span>Synthesizing live narrative via Groq...</span>
                    </div>
                  )}
                </div>
              </div>
              {groqError && (
                <p className="text-[11px] text-neutral-500 mt-2 font-mono">{groqError}</p>
              )}
            </div>
          </div>

          {/* Contributing Risk Factors Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black uppercase tracking-tight text-[#0D0D0D] flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-[#D62828]" />
                Contributing Risk Factors Breakdown
              </h3>
              <span className="text-xs font-mono font-bold text-neutral-500">
                {student.contributingFactors.length} factors evaluated
              </span>
            </div>
            <FactorBreakdownList factors={student.contributingFactors} counseling={student.counseling} />


          </div>


          {/* Historical Trend Charts: Attendance and Grades */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Attendance Trend Chart */}
            <div className="neo-card p-5 bg-white">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#0D0D0D]" />
                  <h3 className="font-black text-sm uppercase tracking-wider text-[#0D0D0D]">
                    Weekly Attendance Trajectory
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold px-1.5 py-0.5 bg-red-100 text-[#D62828] border border-[#0D0D0D]">
                  {(() => {
                    const weeks = (student.attendanceHistory ?? []).filter(h => weekNum(h.week) > 0);
                    const totalWeeks = Math.max(4, ...weeks.map(w => weekNum(w.week)));
                    return `${weeks.length}/${totalWeeks} Weeks`;
                  })()}
                </span>
              </div>
              <p className="text-xs text-neutral-600 mb-4 font-medium">
                Bi-weekly institutional sensor &amp; LMS participation logs.
              </p>
              {(() => {
                const weeks = (student.attendanceHistory ?? [])
                  .filter(h => weekNum(h.week) > 0)
                  .slice()
                  .sort((a, b) => weekNum(a.week) - weekNum(b.week));
                const totalWeeks = Math.max(4, ...weeks.map(w => weekNum(w.week)));
                return (
                  <TrendChart
                    data={weeks as unknown as Record<string, unknown>[]}
                    xKey="week"
                    yKey="percentage"
                    unit="%"
                    lineColor="#D62828"
                    targetThreshold={75}
                    thresholdLabel="Min 75%"
                    yDomain={[0, 100]}
                    totalWeeks={totalWeeks}
                  />
                );
              })()}
            </div>

            {/* Term Test Trend Chart */}
            <div className="neo-card p-5 bg-white">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-[#0D0D0D]" />
                  <h3 className="font-black text-sm uppercase tracking-wider text-[#0D0D0D]">
                    Term Test Scores
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold px-1.5 py-0.5 bg-neutral-100 text-[#0D0D0D] border border-[#0D0D0D]">
                  {student.termTests?.length || 0} Assessments
                </span>
              </div>
              <p className="text-xs text-neutral-600 mb-4 font-medium">
                Continuous internal assessment test scores.
              </p>
              <TrendChart
                data={(student.termTests || []) as unknown as Record<string, unknown>[]}
                xKey="testName"
                yKey="score"
                unit=" pts"
                lineColor="#0D0D0D"
                targetThreshold={70}
                thresholdLabel="Target (70)"
                secondThreshold={40}
                secondThresholdLabel="Fail (<40)"
                yDomain={[0, 100]}
              />
            </div>
          </div>
        </>
      )}

      {/* Counseling Tab */}
      {activeTab === 'counseling' && hasCounseling && student.counseling && (
        <div className="neo-card p-5 bg-white">
          <CounselingCard
            counseling={student.counseling}
            academicScore={student.academicScore}
            scoreBreakdownNote={student.scoreBreakdownNote}
          />
        </div>
      )}

      {/* Contact Tab */}
      {activeTab === 'contact' && hasContact && student.contactInfo && (
        <div className="neo-card p-5 bg-white">
          <h3 className="font-black text-sm uppercase tracking-wider text-[#0D0D0D] mb-4 border-b-2 border-[#0D0D0D] pb-2">
            Contact Panel
          </h3>
          <ContactPanel
            contact={student.contactInfo}
            contactLog={localContactLog}
            onAddContactLog={handleAddContactLog}
          />
        </div>
      )}

      {/* Escalation Tab */}
      {activeTab === 'escalation' && (
        <div className="neo-card p-5 bg-white">
          <h3 className="font-black text-sm uppercase tracking-wider text-[#0D0D0D] mb-4 border-b-2 border-[#0D0D0D] pb-2">
            Escalation Ladder
          </h3>
          <EscalationLadder
            intervention={student.activeIntervention}
            planResponse={student.planResponse}
            currentRiskLevel={student.riskLevel}
            riskTrend={null}
            lastContactDate={localContactLog.length > 0 ? localContactLog[localContactLog.length - 1].date : null}
            onLogContact={() => setActiveTab('contact')}
          />
        </div>
      )}

      {/* Action Footer Bar */}
      <div className="neo-card p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-neutral-600" />
          <span className="text-xs font-bold text-neutral-700">
            Last diagnostic refresh: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} &bull; Sentinel Inference Engine v1.0
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToDashboard}
            className="neo-btn px-4 py-2 bg-white text-[#0D0D0D] text-xs font-bold"
          >
            Return to Cohort
          </button>
          {!noRiskFactors && (
            <button
              onClick={() => onAssignAction(student.studentId, student.suggestedAction)}
              className="neo-btn px-4 py-2 bg-[#D62828] text-white text-xs font-black uppercase tracking-wider"
            >
              Assign Intervention
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

