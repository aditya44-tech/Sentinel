/**
 * lib/types.ts: Shared types (identical to src/types.ts)
 */

export type RiskLevel = 'Low' | 'Medium' | 'High';
export const INTERVENTION_STATUSES = [
  'None', 'Active', 'Resolved', 'Referred', 'Notified', 'Discontinued',
] as const;
export type InterventionStatus = (typeof INTERVENTION_STATUSES)[number];

export const ACTION_TYPES = [
  'Extra Class', 'Counseling', 'Financial Aid Referral',
  'Academic Support', 'Parent/Guardian Notified', 'Other',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];


export interface StudentSummary {
  studentId: string;
  name: string;
  department: string;
  year: number;
  riskScore: number;
  riskLevel: RiskLevel;
  interventionStatus: InterventionStatus;
}

export interface ContributingFactor {
  factor: string;
  points: number;
  reason: string;
}

export interface SubjectAttendanceEntry {
  subject: string;
  percentage: number;
}

export interface AttendanceHistoryItem {
  week: string;
  percentage: number;
  subjects?: SubjectAttendanceEntry[];
  isUploaded?: boolean;
}

export interface NotificationLogEntry {
  type: string;
  details?: Record<string, unknown>;
  assignedBy?: string;
  startDate?: string;
  at: string;
}


// Legacy type kept for backward compatibility
export interface SubjectAttendanceItem {
  subject: string;
  week: string;
  percentage: number;
}

export interface TermTestItem {
  testName: string;
  score: number;
  maxMarks: number;
  date: string;
}

export interface SemesterResult {
  score?: number;
  maxMarks?: number;
  status?: "Upcoming" | "Completed";
}

export interface StudentDetail {
  studentId: string;
  name: string;
  department: string;
  year: number;
  riskScore: number;
  riskLevel: RiskLevel;
  interventionStatus?: InterventionStatus;
  activeIntervention?: StudentActiveIntervention | null;
  notificationLog?: NotificationLogEntry[];
  contributingFactors: ContributingFactor[];
  attendanceHistory: AttendanceHistoryItem[];
  subjectAttendance: SubjectAttendanceItem[];
  termTests: TermTestItem[];
  endSemResult: SemesterResult;
  lastSemResult: SemesterResult;
  backlogCount?: number;
  backlogSubjects?: string[];
  feeStatus?: string;
  feeOverdueDays?: number;
  /** Assignment submission rate (0-100) driving the Low Engagement factor */
  submissionRate?: number;
  aiExplanation: string;
  suggestedAction: string;
}

export interface InterventionDetails {
  subject?: string;
  schedule?: string;
  instructor?: string;
  counselingType?: string;
  counselorName?: string;
  referredDepartment?: string;
  feeNotes?: string;
  supportType?: string;
  supportSubjects?: string[];
  contactMethod?: string;
  [key: string]: unknown;
}

export interface MentorActionPayload {
  studentId: string;
  type: ActionType;
  details: InterventionDetails;
  notes: string;
  assignedBy: string;
  startDate: string;
  status: string;
  /** The risk score visible in the UI at the moment the intervention is assigned. Sent by the client to ensure the baseline is always accurate even if the server's in-memory state is stale after a CSV upload. */
  baselineRiskScore?: number;
}

export interface StudentActiveIntervention {
  type: string;
  details: {
    subject?: string;
    schedule?: string;
    instructor?: string;
    description?: string;
    [k: string]: unknown;
  };
  status: InterventionStatus;
  assignedDate: string;
  assignedBy?: string;
  baselineRiskScore?: number;
  dataPointsAtAssign?: number;
}

export interface StudentStatusData {
  studentId: string;
  name: string;
  activeIntervention?: StudentActiveIntervention | null;
}

export interface OutcomeComparisonData {
  studentId: string;
  name: string;
  intervention: {
    type: string;
    details: {
      subject?: string;
      schedule?: string;
      instructor?: string;
      [key: string]: unknown;
    };
    startDate: string;
  };
  /** Risk score recorded when the intervention was assigned. Never re-derived. */
  baselineScore: number;
  currentScore: number;
  scoreDelta: number;
  outcome: 'Improving' | 'No Change' | 'Worsening';
  checkpointDate: string;
  /** Current lifecycle state of the intervention backing this comparison */
  status?: string;
}

export type UploadType = 'WeeklyAttendance' | 'UnitTest1' | 'UnitTest2' | 'Backlogs' | 'FeeStatus' | 'LastSemResult' | 'EndSemResult';

export interface UploadLog {
  id?: string;
  week: string;
  type: UploadType;
  uploadedAt: string;
  studentsUpdated: number;
  uploadedBy: string;
  rawData?: any[];
  snapshots?: Record<string, any> | null;
  fileName?: string;
}
