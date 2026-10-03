import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { StudentSummary, UploadLog } from '@/lib/types';
import { StudentTableRow } from '@/components/StudentTableRow';
import { StudentCard } from '@/components/StudentCard';
import { normalizeWeek } from '@/lib/weeks';
import {
  AlertTriangle,
  ArrowDownUp,
  Filter,
  Search,
  Users,
  CheckCircle2,
  Activity,
  X,
  UploadCloud,
  CheckCircle,
  AlertCircle,
  Eye,
  Trash2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

interface DashboardViewProps {
  students: StudentSummary[];
  onSelectStudent: (studentId: string) => void;
  uploadHistory?: UploadLog[];
  onDataUpload?: (parsedData: any[], weekLabel: string, uploadType: import('@/lib/types').UploadType, fileName?: string, overwrite?: boolean) => Promise<{ success: boolean; updatedCount: number; skippedCount: number }>;
  onClearAllData?: () => void | Promise<void>;
  onDeleteUpload?: (uploadedAt: string) => Promise<void>;
  isResetting?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  students,
  onSelectStudent,
  uploadHistory = [],
  onDataUpload,
  onClearAllData,
  onDeleteUpload,
  isResetting = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedRisk, setSelectedRisk] = useState<string>('All');
  const [sortAscending, setSortAscending] = useState(false); // default descending riskScore
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Upload UI State
  const [weekLabel, setWeekLabel] = useState<string>('Week 1');
  const [uploadType, setUploadType] = useState<import('@/lib/types').UploadType>('WeeklyAttendance');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUploadMinimized, setIsUploadMinimized] = useState(true);
  const [viewingRawData, setViewingRawData] = useState<{ week: string, type: string, data: any[], fileName?: string } | null>(null);

  // Unique departments and years
  const departments = useMemo(() => {
    const set = new Set(students.map((s) => s.department));
    return ['All', ...Array.from(set)];
  }, [students]);

  const years = useMemo(() => {
    const set = new Set(students.map((s) => s.year.toString()));
    return ['All', ...Array.from(set).sort()];
  }, [students]);

  // Group upload history by week
  const groupedHistory = useMemo(() => {
    const groups: Record<string, UploadLog[]> = {};
    uploadHistory.forEach((log) => {
      if (!groups[log.week]) groups[log.week] = [];
      groups[log.week].push(log);
    });
    // Sort weeks in descending order, putting 'Initial' at the bottom
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Initial') return 1;
      if (b === 'Initial') return -1;
      return b.localeCompare(a, undefined, { numeric: true });
    });
    return sortedKeys.map((key) => ({ week: key, logs: groups[key] }));
  }, [uploadHistory]);

  // Filter and sort students
  const filteredStudents = useMemo(() => {
    return students
      .filter((s) => {
        const matchesSearch =
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.studentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.department.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDept = selectedDept === 'All' || s.department === selectedDept;
        const matchesYear = selectedYear === 'All' || s.year.toString() === selectedYear;
        const matchesRisk = selectedRisk === 'All' || s.riskLevel === selectedRisk;
        return matchesSearch && matchesDept && matchesYear && matchesRisk;
      })
      .sort((a, b) => {
        if (!sortAscending) {
          if (a.riskLevel === 'High' && b.riskLevel !== 'High') return -1;
          if (a.riskLevel !== 'High' && b.riskLevel === 'High') return 1;
        }
        return sortAscending ? a.riskScore - b.riskScore : b.riskScore - a.riskScore;
      });
  }, [students, searchQuery, selectedDept, selectedYear, selectedRisk, sortAscending]);

  // Aggregate metrics
  const totalCount = students.length;
  const highRiskCount = students.filter((s) => s.riskLevel === 'High').length;
  const activeInterventionsCount = students.filter((s) => s.interventionStatus === 'Active').length;
  const avgRiskScore = Math.round(
    students.reduce((acc, curr) => acc + curr.riskScore, 0) / (totalCount || 1)
  );

  const handleProcessUpload = () => {
    if (!uploadedFile) {
      setUploadMessage({ type: 'error', text: 'Please select a CSV file first.' });
      return;
    }
    const requiresWeek = uploadType === 'WeeklyAttendance';
    if (requiresWeek && !weekLabel.trim()) {
      setUploadMessage({ type: 'error', text: 'Please enter a Week label.' });
      return;
    }

    const finalWeekLabel = requiresWeek ? normalizeWeek(weekLabel) : 'Initial';

    setIsUploading(true);
    setUploadMessage(null);

    Papa.parse(uploadedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setIsUploading(false);
        const data = results.data as any[];

        // Validate columns
        if (data.length > 0) {
          const firstRow = data[0];
          if (!('studentId' in firstRow)) {
            setUploadMessage({ type: 'error', text: 'Invalid CSV format. Required column: studentId.' });
            return;
          }
          if (uploadType === 'WeeklyAttendance' && (!('attendance' in firstRow))) {
            setUploadMessage({ type: 'error', text: 'Invalid CSV format for Weekly Attendance. Required columns: studentId, attendance.' });
            return;
          }
          if (uploadType === 'FeeStatus' && (!('feeStatus' in firstRow) || !('overdueDays' in firstRow))) {
            setUploadMessage({ type: 'error', text: 'Invalid CSV format for Fee. Required columns: studentId, feeStatus, overdueDays.' });
            return;
          }
          if (uploadType === 'Backlogs' && !('backlogCount' in firstRow)) {
            setUploadMessage({ type: 'error', text: 'Invalid CSV format for Backlog. Required columns: studentId, backlogCount.' });
            return;
          }
        } else {
          setUploadMessage({ type: 'error', text: 'The CSV file is empty.' });
          return;
        }

        if (onDataUpload) {
          // The handler loads each affected student's full record from the server
          // before applying the upload, so this is awaited.
          setIsUploading(true);
          onDataUpload(data, finalWeekLabel, uploadType, uploadedFile.name)
            .then((res) => {
              setIsUploading(false);
              if (res.success) {
                setUploadMessage({ type: 'success', text: `Upload successful! ${res.updatedCount} records updated, ${res.skippedCount} skipped.` });
                setUploadedFile(null);
                // Suggest next week if it uses week labels
                if (requiresWeek) {
                  const currentWeekMatch = weekLabel.match(/\d+/);
                  if (currentWeekMatch) {
                    setWeekLabel(`Week ${parseInt(currentWeekMatch[0]) + 1}`);
                  }
                }
              }
            })
            .catch((err) => {
              setIsUploading(false);
              setUploadMessage({ type: 'error', text: `Upload failed: ${err?.message || 'unknown error'}` });
            });
        }
      },
      error: (error: Error) => {
        setIsUploading(false);
        setUploadMessage({ type: 'error', text: `Failed to parse CSV: ${error.message}` });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / System Stat blocks */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="neo-card p-3.5 md:p-4 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black uppercase tracking-wider text-neutral-600">
              Monitored
            </span>
            <Users className="w-4 h-4 text-[#0D0D0D]" />
          </div>
          <div className="text-2xl md:text-3xl font-black text-[#0D0D0D] mt-1">
            {totalCount}
          </div>
          <span className="text-[11px] font-bold text-neutral-500">Total active cohort</span>
        </div>

        <div className="neo-card p-3.5 md:p-4 bg-red-50 text-red-900 border-red-900">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black uppercase tracking-wider text-red-600">
              High Risk
            </span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl md:text-3xl font-black text-red-700 mt-1">
            {highRiskCount}
          </div>
          <span className="text-[11px] font-bold text-red-600">Requires immediate contact</span>
        </div>

        <div className="neo-card p-3.5 md:p-4 bg-[#F4C430] text-[#0D0D0D]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black uppercase tracking-wider text-neutral-900">
              Active Plans
            </span>
            <Activity className="w-4 h-4 text-[#0D0D0D]" />
          </div>
          <div className="text-2xl md:text-3xl font-black text-[#0D0D0D] mt-1">
            {activeInterventionsCount}
          </div>
          <span className="text-[11px] font-bold text-neutral-800">Support underway</span>
        </div>

        <div className="neo-card p-3.5 md:p-4 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black uppercase tracking-wider text-neutral-600">
              Avg Cohort Risk
            </span>
            <CheckCircle2 className="w-4 h-4 text-[#2D9D5F]" />
          </div>
          <div className="text-2xl md:text-3xl font-black text-[#0D0D0D] mt-1">
            {avgRiskScore}
            <span className="text-sm font-sans font-bold text-neutral-400">/100</span>
          </div>
          <span className="text-[11px] font-bold text-neutral-500">Threshold baseline</span>
        </div>
      </div>

      {/* Weekly Data Upload Section */}
      <div className="neo-card p-4 bg-[#F5F1E8] border-2 border-dashed border-[#0D0D0D]">
        <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-neutral-300">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-[#0D0D0D] uppercase tracking-tight flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-[#D62828]" />
              Weekly Data Upload
            </h3>
            <button onClick={() => setIsUploadMinimized(!isUploadMinimized)} className="p-1 hover:bg-neutral-200 rounded">
              {isUploadMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
          {onClearAllData && (
            <button
              onClick={() => { void onClearAllData?.(); }}
              disabled={isResetting}
              className="neo-btn px-3 py-1 bg-[#D62828] text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 hover:bg-red-700 disabled:opacity-60"
            >
              <Trash2 className="w-3 h-3" /> {isResetting ? 'Resetting…' : 'Reset All Data'}
            </button>
          )}
        </div>

        {!isUploadMinimized && (
          <React.Fragment>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-neutral-600 mt-1">
                    Upload CSV with attendance and test scores to update risk profiles.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 self-center mr-1">Weekly</span>
                      <button
                        onClick={() => { setUploadType('WeeklyAttendance'); setUploadedFile(null); setUploadMessage(null); }}
                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-[#0D0D0D] transition-colors shadow-[2px_2px_0px_#0D0D0D] ${uploadType === 'WeeklyAttendance' ? 'bg-[#0D0D0D] text-white' : 'bg-white text-[#0D0D0D] hover:bg-neutral-100'}`}
                      >
                        Attendance
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 self-center mr-1">Tests</span>
                      {(['UnitTest1', 'UnitTest2'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => { setUploadType(type); setUploadedFile(null); setUploadMessage(null); }}
                          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-[#0D0D0D] transition-colors shadow-[2px_2px_0px_#0D0D0D] ${uploadType === type ? 'bg-[#0D0D0D] text-white' : 'bg-white text-[#0D0D0D] hover:bg-neutral-100'}`}
                        >
                          {type === 'UnitTest1' ? 'Unit Test 1' : 'Unit Test 2'}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 self-center mr-1">Semester</span>
                      {(['LastSemResult', 'EndSemResult'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => { setUploadType(type); setUploadedFile(null); setUploadMessage(null); }}
                          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-[#0D0D0D] transition-colors shadow-[2px_2px_0px_#0D0D0D] ${uploadType === type ? 'bg-[#0D0D0D] text-white' : 'bg-white text-[#0D0D0D] hover:bg-neutral-100'}`}
                        >
                          {type === 'LastSemResult' ? 'Last Sem Result' : 'End Sem Result'}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 self-center mr-1">Other</span>
                      {(['Backlogs', 'FeeStatus'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => { setUploadType(type); setUploadedFile(null); setUploadMessage(null); }}
                          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-[#0D0D0D] transition-colors shadow-[2px_2px_0px_#0D0D0D] ${uploadType === type ? 'bg-[#0D0D0D] text-white' : 'bg-white text-[#0D0D0D] hover:bg-neutral-100'}`}
                        >
                          {type === 'FeeStatus' ? 'Fee Status' : 'Backlogs'}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 w-full border-t-2 border-neutral-300 pt-3 mt-1">
                  {(uploadType === 'WeeklyAttendance') && (
                    <input
                      type="text"
                      value={weekLabel}
                      onChange={(e) => setWeekLabel(e.target.value)}
                      placeholder="e.g. Week 5"
                      className="neo-input py-1.5 px-3 text-sm font-bold w-28"
                    />
                  )}
                  <label className="neo-btn px-4 py-2 bg-neutral-800 text-white text-sm font-black uppercase tracking-wider cursor-pointer flex items-center gap-2 hover:bg-black transition-colors">
                    <UploadCloud className="w-4 h-4" />
                    <span>{uploadedFile ? 'Change File' : 'Choose CSV'}</span>
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          setUploadedFile(e.target.files[0]);
                          setUploadMessage(null);
                        }
                      }}
                    />
                  </label>
                  {uploadedFile && (
                    <button
                      onClick={handleProcessUpload}
                      disabled={isUploading}
                      className="neo-btn px-4 py-2 bg-[#D62828] text-white text-sm font-black uppercase tracking-wider flex items-center gap-2 hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {isUploading ? (
                        <span className="animate-pulse">Processing...</span>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Upload
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

              {/* File Selected & Message Feedback */}
              <div className="flex items-center justify-between mt-2">
                <div>
                  {uploadedFile && !uploadMessage && (
                    <span className="text-sm font-bold text-neutral-800 bg-white px-2 py-1 border border-neutral-300">
                      Ready: {uploadedFile.name}
                    </span>
                  )}
                </div>
                {uploadMessage && (
                  <div className={`flex items-center gap-2 px-3 py-1.5 text-sm font-bold border-2 ${uploadMessage.type === 'success' ? 'bg-[#D4EDDA] text-[#155724] border-[#155724]' : 'bg-[#F8D7DA] text-[#721C24] border-[#721C24]'}`}>
                    {uploadMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {uploadMessage.text}
                  </div>
                )}
              </div>
            </div>

            {/* Upload History Table */}
            {groupedHistory.length > 0 && (
              <div className="mt-6 border-t-2 border-[#0D0D0D] pt-4">
                <h4 className="font-black text-sm uppercase tracking-wider text-[#0D0D0D] mb-3">Recent Uploads (Grouped by Week)</h4>
                <div className="bg-white border-2 border-[#0D0D0D] overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-neutral-100 border-b-2 border-[#0D0D0D] font-black uppercase tracking-wider text-neutral-600">
                        <th className="p-2 border-r-2 border-[#0D0D0D] w-24">Week</th>
                        <th className="p-2 border-r-2 border-[#0D0D0D]">Type</th>
                        <th className="p-2 border-r-2 border-[#0D0D0D]">File Name</th>
                        <th className="p-2 border-r-2 border-[#0D0D0D]">Uploaded On</th>
                        <th className="p-2 border-r-2 border-[#0D0D0D]">Students Updated</th>
                        <th className="p-2 border-r-2 border-[#0D0D0D]">Status</th>
                        <th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedHistory.map((group, groupIdx) => (
                        <React.Fragment key={groupIdx}>
                          {group.logs.map((log, idx) => (
                            <tr key={`${groupIdx}-${idx}`} className={`border-b border-neutral-200 font-bold ${idx === 0 && groupIdx !== 0 ? 'border-t-2 border-[#0D0D0D]' : ''}`}>
                              {idx === 0 && (
                                <td className="p-2 border-r-2 border-[#0D0D0D] bg-neutral-50 align-top" rowSpan={group.logs.length}>
                                  {group.week}
                                </td>
                              )}
                              <td className="p-2 border-r-2 border-[#0D0D0D] capitalize">{log.type.replace('_', ' ')}</td>
                              <td className="p-2 border-r-2 border-[#0D0D0D] text-neutral-600 italic font-mono text-[10px]">{log.fileName || 'N/A'}</td>
                              <td className="p-2 border-r-2 border-[#0D0D0D]">{new Date(log.uploadedAt).toLocaleString()}</td>
                              <td className="p-2 border-r-2 border-[#0D0D0D]">{log.studentsUpdated}</td>
                              <td className="p-2 border-r-2 border-[#0D0D0D]"><div className="text-[#2D9D5F] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Success</div></td>
                              <td className="p-2">
                                {log.rawData && (
                                  <button
                                    onClick={() => setViewingRawData({ week: group.week, type: log.type, data: log.rawData!, fileName: log.fileName })}
                                    className="neo-btn px-2 py-1 bg-white border border-[#0D0D0D] text-[10px] font-black uppercase tracking-wider flex items-center gap-1 hover:bg-neutral-100"
                                  >
                                    <Eye className="w-3 h-3" /> View Data
                                  </button>
                                )}
                                {onDeleteUpload && (
                                  <button
                                    onClick={() => onDeleteUpload(log.uploadedAt)}
                                    className="neo-btn px-2 py-1 bg-[#D62828] border border-[#0D0D0D] text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 hover:bg-red-700 mt-1"
                                    title="Delete Log"
                                  >
                                    <Trash2 className="w-3 h-3" /> Delete
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </React.Fragment>
        )}
      </div>


      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg md:text-xl font-black uppercase tracking-tight text-[#0D0D0D] flex items-center gap-2">
          <span className="w-3 h-3 bg-[#D62828] inline-block border border-[#0D0D0D]" />
          Flagged Student Cohort ({filteredStudents.length})
        </h2>
        <span className="text-sm font-bold text-neutral-500">
          Click any row to open diagnostic detail
        </span>
      </div>

      {/* Filter and Control Bar */}
      <div className="neo-card p-4 bg-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              id="student-search-input"
              type="text"
              placeholder="Search by student name, ID, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="neo-input w-full pl-9 pr-8 py-2 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-black"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#0D0D0D]" />
              <span className="text-sm font-black uppercase tracking-wider text-[#0D0D0D]">
                Dept:
              </span>
              <select
                id="dept-filter-select"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="neo-input py-1.5 px-2.5 text-sm font-bold"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black uppercase tracking-wider text-[#0D0D0D]">
                Year:
              </span>
              <select
                id="year-filter-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="neo-input py-1.5 px-2.5 text-sm font-bold"
              >
                {years.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr === 'All' ? 'All Years' : `Year ${yr}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black uppercase tracking-wider text-[#0D0D0D]">
                Risk:
              </span>
              <select
                id="risk-filter-select"
                value={selectedRisk}
                onChange={(e) => setSelectedRisk(e.target.value)}
                className="neo-input py-1.5 px-2.5 text-sm font-bold"
              >
                <option value="All">All Risks</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            {/* Sort Order Toggle */}
            <button
              id="sort-risk-toggle-btn"
              onClick={() => setSortAscending((prev) => !prev)}
              className="neo-btn px-3 py-1.5 bg-[#0D0D0D] text-white text-sm font-black uppercase tracking-wider flex items-center gap-1.5"
              title="Toggle Risk Score sorting"
            >
              <ArrowDownUp className="w-3.5 h-3.5" />
              <span>{sortAscending ? 'Risk: Low → High' : 'Risk: High → Low'}</span>
            </button>
          </div>
        </div>

        {/* Active Filter Indicators */}
        {(selectedDept !== 'All' || selectedYear !== 'All' || selectedRisk !== 'All' || searchQuery) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t-2 border-[#0D0D0D] text-sm">
            <span className="font-extrabold uppercase tracking-wider text-neutral-500">
              Active Filters:
            </span>
            {searchQuery && (
              <span className="bg-neutral-100 border border-[#0D0D0D] px-2 py-0.5 font-bold">
                "{searchQuery}"
              </span>
            )}
            {selectedDept !== 'All' && (
              <span className="bg-neutral-100 border border-[#0D0D0D] px-2 py-0.5 font-bold">
                Dept: {selectedDept}
              </span>
            )}
            {selectedYear !== 'All' && (
              <span className="bg-neutral-100 border border-[#0D0D0D] px-2 py-0.5 font-bold">
                Year: {selectedYear}
              </span>
            )}
            {selectedRisk !== 'All' && (
              <span className="bg-neutral-100 border border-[#0D0D0D] px-2 py-0.5 font-bold">
                Risk: {selectedRisk}
              </span>
            )}
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedDept('All');
                setSelectedYear('All');
                setSelectedRisk('All');
              }}
              className="text-[#D62828] font-black underline ml-auto cursor-pointer"
            >
              Reset All
            </button>
          </div>
        )}
      </div>

      {/* Raw Data Viewer Modal */}
      {viewingRawData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="neo-card bg-white w-full max-w-4xl max-h-[80vh] flex flex-col shadow-[8px_8px_0px_#0D0D0D] border-4 border-[#0D0D0D]">
            <div className="flex items-center justify-between p-4 border-b-4 border-[#0D0D0D] bg-[#F5F1E8]">
              <div>
                <h3 className="font-black text-lg uppercase tracking-tight text-[#0D0D0D] flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[#D62828]" />
                  Uploaded CSV Data
                </h3>
                <p className="text-sm font-bold text-neutral-600">
                  {viewingRawData.week} : {viewingRawData.type.replace('_', ' ').toUpperCase()} {viewingRawData.fileName ? `(${viewingRawData.fileName})` : ''}
                </p>
              </div>
              <button
                onClick={() => setViewingRawData(null)}
                className="neo-btn p-2 bg-[#D62828] text-white hover:bg-red-700"
                title="Close Viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-auto bg-white flex-1">
              <table className="w-full text-left text-sm border-collapse font-mono">
                <thead>
                  <tr className="bg-neutral-100 border-b-2 border-[#0D0D0D] uppercase font-black text-neutral-800 sticky top-0">
                    {Object.keys(viewingRawData.data[0] || {}).map((key) => (
                      <th key={key} className="p-2 border-r border-[#0D0D0D]">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewingRawData.data.map((row, idx) => (
                    <tr key={idx} className="border-b border-neutral-200 hover:bg-neutral-50">
                      {Object.values(row).map((val: any, vIdx) => (
                        <td key={vIdx} className="p-2 border-r border-neutral-300 truncate max-w-[150px]">
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {viewingRawData.data.length === 0 && (
                    <tr>
                      <td className="p-4 text-center font-bold" colSpan={10}>No valid rows found in this upload.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t-2 border-[#0D0D0D] bg-neutral-100 flex items-center justify-between text-sm font-bold">
              <span>Total Rows: {viewingRawData.data.length}</span>
              <button onClick={() => setViewingRawData(null)} className="neo-btn px-4 py-1.5 bg-[#0D0D0D] text-white">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Student Data Table (Desktop) & Card List (Mobile) */}
      <div className="space-y-4">

        {filteredStudents.length === 0 ? (
          <div className="neo-card p-10 text-center bg-white">
            <p className="font-black text-lg text-[#0D0D0D]">No students match your criteria.</p>
            <p className="text-sm text-neutral-600 mt-1">
              Try adjusting your search filters or clear the active query.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedDept('All');
                setSelectedYear('All');
                setSelectedRisk('All');
              }}
              className="neo-btn px-4 py-2 bg-[#0D0D0D] text-white text-sm mt-4"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block neo-card bg-white overflow-x-auto overflow-y-auto max-h-[60vh]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 shadow-[0_2px_0_#0D0D0D]">
                  <tr className="bg-[#0D0D0D] text-white font-black text-sm uppercase tracking-wider">
                    <th className="p-3.5 border-r-2 border-neutral-700">ID</th>
                    <th className="p-3.5 border-r-2 border-neutral-700">Student Name</th>
                    <th className="p-3.5 border-r-2 border-neutral-700">Department</th>
                    <th
                      className="p-3.5 border-r-2 border-neutral-700 cursor-pointer hover:bg-neutral-800 select-none"
                      onClick={() => setSortAscending((prev) => !prev)}
                    >
                      <div className="flex items-center gap-1">
                        <span>Risk Score</span>
                        <ArrowDownUp className="w-3 h-3 text-neutral-300" />
                      </div>
                    </th>
                    <th className="p-3.5 border-r-2 border-neutral-700">Risk Level</th>
                    <th className="p-3.5 border-r-2 border-neutral-700">Intervention</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <StudentTableRow
                      key={student.studentId}
                      student={student}
                      onSelect={onSelectStudent}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden overflow-y-auto max-h-[60vh] pr-1 pb-1">
              {filteredStudents.map((student) => (
                <StudentCard
                  key={student.studentId}
                  student={student}
                  onSelect={onSelectStudent}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
