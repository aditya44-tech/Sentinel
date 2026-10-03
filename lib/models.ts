import mongoose from 'mongoose';

import { INTERVENTION_STATUSES } from './types';

// Ensure models aren't redefined upon hot reloads
const SubjectEntry = { _id: false, subject: String, percentage: Number };

const StudentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  department: { type: String, required: true },
  year: { type: Number, required: true },
  
  riskScore: { type: Number, default: 0 },
  riskLevel: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
  interventionStatus: { type: String, enum: INTERVENTION_STATUSES, default: 'None' },
  
  // Detailed Data
  attendanceHistory: [{
    _id: false,
    week: String,
    percentage: Number,
    isUploaded: { type: Boolean, default: false },
    subjects: [SubjectEntry]
  }],
  subjectAttendance: [{
    subject: String,
    week: String,
    percentage: Number
  }],
  termTests: [{
    testName: String,
    score: Number,
    maxMarks: Number,
    date: String
  }],
  endSemResult: {
    score: Number,
    maxMarks: Number,
    status: String
  },
  lastSemResult: {
    score: Number,
    maxMarks: Number
  },
  backlogCount: { type: Number },
  backlogSubjects: [{ type: String }],
  feeStatus: { type: String },
  feeOverdueDays: { type: Number },
  submissionRate: { type: Number },
  contributingFactors: [{
    factor: String,
    points: Number,
    reason: String
  }],
  suggestedAction: { type: String },
  aiExplanation: { type: String },

  activeIntervention: {
    type: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: INTERVENTION_STATUSES },
    assignedDate: { type: String },
    assignedBy: { type: String },
    baselineRiskScore: { type: Number },
    dataPointsAtAssign: { type: Number }
  },
  notificationLog: [mongoose.Schema.Types.Mixed]
}, { timestamps: true });

export const Student = mongoose.models.Student || mongoose.model('Student', StudentSchema);

const UploadHistorySchema = new mongoose.Schema({
  id: { type: String },
  week: { type: String, required: true },
  type: { type: String, required: true },
  uploadedAt: { type: String, required: true },
  studentsUpdated: { type: Number, required: true },
  uploadedBy: { type: String, required: true },
  rawData: { type: mongoose.Schema.Types.Mixed },
  snapshots: { type: mongoose.Schema.Types.Mixed },
  fileName: { type: String }
}, { timestamps: true });

export const UploadHistory = mongoose.models.UploadHistory || mongoose.model('UploadHistory', UploadHistorySchema);

const MetaSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: Boolean });
export const Meta = mongoose.models.Meta || mongoose.model('Meta', MetaSchema);
