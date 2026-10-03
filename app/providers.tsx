"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthUser } from '@/views/LoginView';
import { StudentSummary, StudentDetail, UploadLog, MentorActionPayload, OutcomeComparisonData } from '@/lib/types';
import { computeRiskScore, generateFallbackExplanation, RawStudentData } from '@/lib/riskEngine';
import { buildSnapshot, planUploadRevert, affectedStudentIds } from '@/lib/uploadRevert';
import { normalizeWeek, weekNum } from '@/lib/weeks';

/** Case/whitespace-insensitive column lookup, so "Week", "WEEK" and " week " all work. */
function getField(row: any, name: string): any {
  if (!row || typeof row !== 'object') return undefined;
  const key = Object.keys(row).find(k => k.trim().toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : row[key];
}

function getWeekFromRow(row: any): string | null {
  const raw = getField(row, 'week');
  const v = String(raw ?? '').trim();
  if (!v) return null;
  return normalizeWeek(v);
}

function mergeWeek(existing: any[] | undefined, entry: any) {
  const cur = existing ?? [];
  const week = normalizeWeek(entry.week);
  // Keep all previously uploaded weeks, then replace/add this one
  const rest = cur.filter(h => normalizeWeek(h.week) !== week);
  return [...rest, { ...entry, week, isUploaded: true }].sort((a, b) => weekNum(a.week) - weekNum(b.week));
}

interface SentinelContextType {
  authUser: AuthUser | null;
  role: 'mentor' | 'student';
  login: (user: AuthUser) => void;
  logout: () => void;
  students: StudentSummary[];
  setStudents: React.Dispatch<React.SetStateAction<StudentSummary[]>>;
  uploadHistory: UploadLog[];
  setUploadHistory: React.Dispatch<React.SetStateAction<UploadLog[]>>;
  detailsMap: Record<string, StudentDetail>;
  /** Bumped whenever the dataset changes (upload, reset, delete) so pages re-read from the server. */
  dataVersion: number;
  isResetting: boolean;
  fetchStudentDetail: (id: string, opts?: { force?: boolean }) => Promise<StudentDetail | null>;
  handleDataUpload: (parsedData: any[], weekLabel: string, uploadType: import('@/lib/types').UploadType, fileName?: string) => Promise<{ success: boolean; updatedCount: number; skippedCount: number }>;
  handleClearAllData: () => Promise<void>;
  handleDeleteUpload: (uploadedAt: string) => Promise<void>;
  handleInterventionAssigned: (payload: MentorActionPayload) => Promise<void>;
  handleResolveIntervention: (studentId: string) => Promise<void>;
  handleReopenIntervention: (studentId: string) => Promise<void>;
}

const SentinelContext = createContext<SentinelContextType | undefined>(undefined);

export function SentinelProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<'mentor' | 'student'>('mentor');
  
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [uploadHistory, setUploadHistory] = useState<UploadLog[]>([]);
  const [detailsMap, setDetailsMap] = useState<Record<string, StudentDetail>>({});
  const [dataVersion, setDataVersion] = useState(0);
  const [isResetting, setIsResetting] = useState(false);

  /** Re-read the authoritative list from the server. */
  const refreshFromServer = async () => {
    try {
      const [studRes, histRes] = await Promise.all([
        fetch('/api/students', { cache: 'no-store' }),
        fetch('/api/history', { cache: 'no-store' }),
      ]);
      setStudents(studRes.ok ? await studRes.json() : []);
      setUploadHistory(histRes.ok ? await histRes.json() : []);
    } catch (e) {
      console.error('Failed to refresh from server', e);
    }
  };

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const fetchData = async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const s = await meRes.json();
          let name = s.role === 'mentor' ? 'Mentor' : 'Student';
          try {
            const saved = localStorage.getItem('ea_authName');
            if (saved) name = saved;
          } catch {}
          const user: AuthUser = s.role === 'mentor'
            ? { role: 'mentor', name }
            : { role: 'student', studentId: s.id, name };
          setAuthUser(user);
          setRole(s.role);
        } else {
          setAuthUser(null);
        }

        const [histRes, studRes] = await Promise.all([
          fetch('/api/history', { cache: 'no-store' }),
          fetch('/api/students', { cache: 'no-store' })
        ]);
        if (histRes.ok) setUploadHistory(await histRes.json());
        if (studRes.ok) setStudents(await studRes.json());
      } catch (e) {
        console.error("Failed to fetch data from DB", e);
      }
    };
    fetchData();
  }, []);

  const login = (user: AuthUser) => {
    setAuthUser(user);
    setRole(user.role === 'student' ? 'student' : 'mentor');
    localStorage.setItem('ea_authName', user.name);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthUser(null);
    setRole('mentor');
    localStorage.removeItem('ea_authName');
  };

  const fetchStudentDetail = async (id: string, opts?: { force?: boolean }) => {
    if (!opts?.force && detailsMap[id]) return detailsMap[id];
    try {
      const res = await fetch(`/api/students/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.student) {
        setDetailsMap(prev => ({ ...prev, [id]: data.student }));
        return data.student as StudentDetail;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const handleDataUpload = async (parsedData: any[], weekLabel: string, uploadType: import('@/lib/types').UploadType, fileName?: string): Promise<{ success: boolean; updatedCount: number; skippedCount: number }> => {
    // The client-side detail cache is lazy — make sure we hold each affected
    // student's FULL record from the server before applying changes. Otherwise a
    // student we have never opened would be replaced by an empty stub, wiping
    // their attendance, grades and backlogs.
    const affectedIds = Array.from(new Set(
      parsedData
        .map(row => (typeof row?.studentId === 'string' ? row.studentId.trim() : ''))
        .filter(Boolean)
    ));

    // The server is the authority for every student this upload touches. We read
    // each record back before applying changes so that:
    //   • a student we have never opened is not replaced by an empty stub, and
    //   • a student the server no longer knows about (e.g. wiped by "Reset All
    //     Data", possibly from another tab) becomes a brand-new record instead of
    //     inheriting a stale intervention status from our cache.
    const serverConfirm: { confirmed: Record<string, StudentDetail>; missing: Set<string> } =
      { confirmed: {}, missing: new Set<string>() };

    await Promise.all(affectedIds.map(async (sid) => {
      try {
        const res = await fetch(`/api/students/${sid}`, { cache: 'no-store' });
        if (res.status === 404) {
          serverConfirm.missing.add(sid);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (data?.student) serverConfirm.confirmed[sid] = data.student as StudentDetail;
      } catch {
        // Network hiccup: keep whatever we already hold rather than dropping the
        // student's real record.
      }
    }));

    const newDetails: Record<string, StudentDetail> = { ...detailsMap, ...serverConfirm.confirmed };
    for (const sid of serverConfirm.missing) delete newDetails[sid];
    let updatedCount = 0;
    let skippedCount = 0;

    // Snapshot original state of each affected student BEFORE making changes
    // This allows clean revert when the upload is deleted
    const snapshots: Record<string, any> = {};

    parsedData.forEach(row => {
      const sid = row.studentId?.trim();
      if (!sid) { skippedCount++; return; }

      // Save snapshot of original state before any modifications
      if (newDetails[sid] && !snapshots[sid]) {
        snapshots[sid] = buildSnapshot(newDetails[sid]);
      }

      if (!newDetails[sid]) {
        const name = row.name?.trim() || sid;
        newDetails[sid] = {
          studentId: sid, name, department: row.department?.trim() || 'Computer Science', year: parseInt(row.year, 10) || 1,
          riskScore: 0, riskLevel: 'Low', contributingFactors: [], attendanceHistory: [], subjectAttendance: [], termTests: [], endSemResult: { status: 'Upcoming' }, lastSemResult: { score: 0, maxMarks: 0 }, aiExplanation: '', suggestedAction: 'Monitor', interventionStatus: 'None'
        };
        // Mark as created by this upload (no snapshot needed — delete will remove student)
        snapshots[sid] = null;
      }

      const existing = { ...newDetails[sid] };
      if (snapshots[sid] === null) {
        delete existing.activeIntervention;
        existing.interventionStatus = 'None';
      }

      if (uploadType === 'WeeklyAttendance') {
        const att = parseFloat(getField(row, 'attendance'));
        // If CSV has its own "week" column (new overall format), prefer that over the UI-provided label
        const effectiveWeekLabel = getWeekFromRow(row) || weekLabel;
        
        if (!isNaN(att)) {
          // Parse subject attendance columns from CSV (e.g., "DBMS_attendance", "CN_attendance")
          const subjectCols = Object.keys(row).filter(k => k.endsWith('_attendance'));
          const subjectBreakdown = subjectCols.map(k => ({
            subject: k.replace('_attendance', '').trim(),
            percentage: parseFloat(row[k])
          })).filter(s => !isNaN(s.percentage));

          // Merge with any existing subject data for this week
          const existingWeek = existing.attendanceHistory.find(h => h.week === effectiveWeekLabel);
          let mergedSubjects = subjectBreakdown;
          if (existingWeek?.subjects && existingWeek.subjects.length > 0) {
            mergedSubjects = [...existingWeek.subjects];
            for (const newSub of subjectBreakdown) {
              const idx = mergedSubjects.findIndex(s => s.subject === newSub.subject);
              if (idx !== -1) mergedSubjects[idx] = newSub;
              else mergedSubjects.push(newSub);
            }
          }

          existing.attendanceHistory = mergeWeek(existing.attendanceHistory, {
            week: effectiveWeekLabel,
            percentage: att,
            subjects: mergedSubjects.length > 0 ? mergedSubjects : undefined,
          });
          
          // Also update the top-level subjectAttendance with this latest data
          if (mergedSubjects.length > 0) {
            existing.subjectAttendance = mergedSubjects.map(sub => ({
              subject: sub.subject,
              week: effectiveWeekLabel,
              percentage: sub.percentage
            }));
          }
          const raw: RawStudentData = {
            studentId: sid, name: existing.name, department: existing.department, year: existing.year,
            attendanceHistory: existing.attendanceHistory, subjectAttendance: existing.subjectAttendance, termTests: existing.termTests,
            backlogs: existing.backlogCount || 0, backlogSubjects: existing.backlogSubjects || [], feeOverdueDays: existing.feeOverdueDays || 0,
            submissionRate: existing.submissionRate,
          };
          const result = computeRiskScore(raw);
          existing.riskScore = result.riskScore; existing.riskLevel = result.riskLevel; existing.contributingFactors = result.contributingFactors; existing.suggestedAction = result.suggestedAction;
          existing.aiExplanation = generateFallbackExplanation({ name: existing.name, department: existing.department, year: existing.year }, result);
        }
      } else if (uploadType === 'UnitTest1' || uploadType === 'UnitTest2') {
        const score = parseFloat(row.score);
        const maxMarks = parseFloat(row.maxMarks) || 100;
        const date = row.date || new Date().toISOString().split('T')[0];
        
        if (!isNaN(score)) {
          const testName = uploadType === 'UnitTest1' ? 'Unit Test 1' : 'Unit Test 2';
          const filteredTests = existing.termTests.filter(t => t.testName !== testName);
          existing.termTests = [...filteredTests, { testName, score, maxMarks, date }];
          
          const raw: RawStudentData = {
            studentId: sid, name: existing.name, department: existing.department, year: existing.year,
            attendanceHistory: existing.attendanceHistory, subjectAttendance: existing.subjectAttendance, termTests: existing.termTests,
            backlogs: existing.backlogCount || 0, backlogSubjects: existing.backlogSubjects || [], feeOverdueDays: existing.feeOverdueDays || 0,
            submissionRate: existing.submissionRate,
          };
          const result = computeRiskScore(raw);
          existing.riskScore = result.riskScore; existing.riskLevel = result.riskLevel; existing.contributingFactors = result.contributingFactors; existing.suggestedAction = result.suggestedAction;
          existing.aiExplanation = generateFallbackExplanation({ name: existing.name, department: existing.department, year: existing.year }, result);
        }
      } else if (uploadType === 'FeeStatus') {
        const overdue = parseInt(row.overdueDays || '0', 10);
        if (!isNaN(overdue)) {
          existing.feeOverdueDays = overdue;
          existing.feeStatus = row.feeStatus;
          const raw: RawStudentData = {
            studentId: sid, name: existing.name, department: existing.department, year: existing.year,
            attendanceHistory: existing.attendanceHistory, subjectAttendance: existing.subjectAttendance, termTests: existing.termTests,
            backlogs: existing.backlogCount || 0, backlogSubjects: existing.backlogSubjects || [], feeOverdueDays: overdue,
            submissionRate: existing.submissionRate,
          };
          const result = computeRiskScore(raw);
          existing.riskScore = result.riskScore; existing.riskLevel = result.riskLevel; existing.contributingFactors = result.contributingFactors; existing.suggestedAction = result.suggestedAction;
          existing.aiExplanation = generateFallbackExplanation({ name: existing.name, department: existing.department, year: existing.year }, result);
        }
      } else if (uploadType === 'Backlogs') {
        const count = parseInt(row.backlogCount || '0', 10);
        const subjects = row.backlogSubjects ? row.backlogSubjects.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : [];
        if (!isNaN(count)) {
          existing.backlogCount = count;
          existing.backlogSubjects = subjects;
          const raw: RawStudentData = {
            studentId: sid, name: existing.name, department: existing.department, year: existing.year,
            attendanceHistory: existing.attendanceHistory, subjectAttendance: existing.subjectAttendance, termTests: existing.termTests,
            backlogs: count, backlogSubjects: subjects, feeOverdueDays: existing.feeOverdueDays || 0,
            submissionRate: existing.submissionRate,
          };
          const result = computeRiskScore(raw);
          existing.riskScore = result.riskScore; existing.riskLevel = result.riskLevel; existing.contributingFactors = result.contributingFactors; existing.suggestedAction = result.suggestedAction;
          existing.aiExplanation = generateFallbackExplanation({ name: existing.name, department: existing.department, year: existing.year }, result);
        }
      } else if (uploadType === 'LastSemResult') {
        const score = parseFloat(row.score || row.marks || '0');
        const maxMarks = parseFloat(row.maxMarks || '100');
        if (!isNaN(score)) {
          existing.lastSemResult = { score, maxMarks };
        }
      } else if (uploadType === 'EndSemResult') {
        const scoreStr = row.score || row.marks || '';
        const statusStr = row.status || (scoreStr ? 'Completed' : 'Upcoming');
        if (statusStr === 'Upcoming' || scoreStr === '' || scoreStr?.toLowerCase() === 'upcoming') {
          existing.endSemResult = { status: 'Upcoming' };
        } else {
          const score = parseFloat(scoreStr);
          const maxMarks = parseFloat(row.maxMarks || '100');
          existing.endSemResult = { score: isNaN(score) ? undefined : score, maxMarks, status: 'Completed' };
        }
      }

      newDetails[sid] = existing;
      updatedCount++;
    });

    // TEMP DEBUG: remove once weekly attendance is confirmed working
    if (uploadType === 'WeeklyAttendance') {
      console.log('[upload] sample row:', parsedData[0]);
      console.log('[upload] attendanceHistory after merge:', newDetails[affectedIds[0]]?.attendanceHistory);
    }

    const newLog = {
      uploadedAt: new Date().toISOString(),
      fileName: fileName || `dataset_${uploadType}.csv`,
      week: weekLabel || 'Initial',
      type: uploadType,
      studentsUpdated: updatedCount,
      uploadedBy: 'Mentor',
      rawData: parsedData,
      snapshots: snapshots,
    };
    
    try {
      const toSave = affectedIds.map(id => newDetails[id]).filter(Boolean);
      const saveRes = await fetch('/api/students', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toSave),
      });
      if (!saveRes.ok) throw new Error(`Saving students failed (${saveRes.status})`);

      const histRes = await fetch('/api/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newLog),
      });
      if (!histRes.ok) throw new Error(`Saving upload log failed (${histRes.status})`);

      setDetailsMap(prev => ({ ...prev, ...newDetails }));
      setStudents(prev => {
        const nextStudents = [...prev];
        for (const sid of affectedIds) {
          const detail = newDetails[sid];
          if (!detail) continue;
          const idx = nextStudents.findIndex(s => s.studentId === sid);
          if (idx !== -1) {
            nextStudents[idx] = { ...nextStudents[idx], riskScore: detail.riskScore, riskLevel: detail.riskLevel };
          } else {
            nextStudents.push({ 
              studentId: detail.studentId, 
              name: detail.name, 
              department: detail.department, 
              year: detail.year, 
              riskScore: detail.riskScore, 
              riskLevel: detail.riskLevel, 
              interventionStatus: detail.interventionStatus || 'None' 
            });
          }
        }
        return nextStudents.sort((a, b) => b.riskScore - a.riskScore);
      });
      
      setUploadHistory(prev => [newLog as any, ...prev]);
      setDataVersion(v => v + 1);
      return { success: true, updatedCount, skippedCount };
    } catch (e) {
      console.error('Upload save failed', e);
      throw e;
    }
  };

  const handleClearAllData = async () => {
    setIsResetting(true);
    // Clear all client-side state immediately so the UI never shows stale rows
    // while the server catches up.
    setStudents([]);
    setDetailsMap({});
    setUploadHistory([]);

    // Wipe every server-side store: students, details, interventions, outcomes
    // and upload history. Awaiting these matters — a reset that is still in
    // flight when the next upload lands would either wipe the fresh upload or
    // leave the old intervention status behind.
    try {
      const res = await fetch('/api/students', { method: 'DELETE' });
      if (!res.ok) throw new Error('Reset failed');
    } catch (e) {
      console.error('Failed to reset server data', e);
    }

    // Re-read from the server so the client reflects exactly what survived the
    // reset instead of its own optimistic copy.
    await refreshFromServer();
    setDataVersion(v => v + 1);
    setIsResetting(false);
  };

  const handleDeleteUpload = async (uploadedAt: string) => {
    const uploadLog = uploadHistory.find(log => log.uploadedAt === uploadedAt);
    if (!uploadLog) return;

    try {
      const deleteParam = (uploadLog as any).id
        ? `id=${encodeURIComponent((uploadLog as any).id)}`
        : `uploadedAt=${encodeURIComponent(uploadedAt)}`;
      const res = await fetch(`/api/history?${deleteParam}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Revert failed');
      const data = await res.json();
      
      const restored = data.restored || [];
      const deleted = data.deleted || [];
      
      setDetailsMap(prev => {
        const next = { ...prev };
        for (const sid of deleted) delete next[sid];
        for (const st of restored) next[st.studentId] = st;
        return next;
      });
      
      await refreshFromServer();
      setDataVersion(v => v + 1);
    } catch (e) {
      console.error('Failed to delete upload log', e);
      throw e;
    }
  };

  const handleInterventionAssigned = async (payload: MentorActionPayload) => {
    const status = (payload.status || 'Active') as import('@/lib/types').InterventionStatus;

    // Single server call — handles both Notified log-append and real interventions
    const res = await fetch('/api/interventions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, baselineRiskScore: detailsMap[payload.studentId]?.riskScore }),
    });
    if (!res.ok) { console.error('Failed to assign intervention', await res.text()); return; }

    if (status === 'Notified') return; // log-only, no local state change needed

    const data = await res.json();
    const activeIntervention: import('@/lib/types').StudentActiveIntervention =
      data.activeIntervention ?? {
        type: payload.type,
        details: payload.details,
        status,
        assignedDate: payload.startDate,
        baselineRiskScore: data.baselineRiskScore ?? detailsMap[payload.studentId]?.riskScore ?? 0,
      };

    setStudents(prev => prev.map(s => s.studentId === payload.studentId ? { ...s, interventionStatus: status } : s));
    setDetailsMap(prev => ({
      ...prev,
      [payload.studentId]: { ...prev[payload.studentId], interventionStatus: status, activeIntervention },
    }));
  };

  const handleResolveIntervention = async (studentId: string) => {
    const res = await fetch(`/api/interventions/${studentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve' }),
    });
    if (!res.ok) { console.error('Failed to resolve intervention', await res.text()); return; }
    const data = await res.json();

    setStudents(prev => prev.map(s => s.studentId === studentId ? { ...s, interventionStatus: 'Resolved' } : s));
    setDetailsMap(prev => {
      const existing = prev[studentId];
      if (!existing) return prev;
      const updated = data.student ?? {
        ...existing,
        interventionStatus: 'Resolved' as import('@/lib/types').InterventionStatus,
        activeIntervention: existing.activeIntervention
          ? { ...existing.activeIntervention, status: 'Resolved' as import('@/lib/types').InterventionStatus }
          : null,
      };
      return { ...prev, [studentId]: updated };
    });
  };

  const handleReopenIntervention = async (studentId: string) => {
    const res = await fetch(`/api/interventions/${studentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reopen' }),
    });
    if (!res.ok) { console.error('Failed to reopen intervention', await res.text()); return; }
    const data = await res.json();

    setStudents(prev => prev.map(s => s.studentId === studentId ? { ...s, interventionStatus: 'Active' } : s));
    setDetailsMap(prev => {
      const existing = prev[studentId];
      if (!existing) return prev;
      const updated = data.student ?? {
        ...existing,
        interventionStatus: 'Active' as import('@/lib/types').InterventionStatus,
        activeIntervention: existing.activeIntervention
          ? { ...existing.activeIntervention, status: 'Active' as import('@/lib/types').InterventionStatus }
          : null,
      };
      return { ...prev, [studentId]: updated };
    });
  };

  if (!isClient) return null;

  return (
    <SentinelContext.Provider value={{
      authUser, role, login, logout,
      students, setStudents,
      uploadHistory, setUploadHistory,
      detailsMap, dataVersion, isResetting, fetchStudentDetail,
      handleDataUpload, handleClearAllData, handleDeleteUpload,
      handleInterventionAssigned, handleResolveIntervention, handleReopenIntervention
    }}>
      {children}
    </SentinelContext.Provider>
  );
}

export function useSentinel() {
  const context = useContext(SentinelContext);
  if (context === undefined) {
    throw new Error('useSentinel must be used within a SentinelProvider');
  }
  return context;
}
