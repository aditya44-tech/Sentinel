# Sentinel Logic System — Detailed Technical Report

**Date:** September 17, 2026
**Version:** 1.1
**Engine file:** `lib/riskEngine.ts`
**API route:** `app/api/groq/explain/route.ts`

---

## 1. Executive Summary

Sentinel uses a **deterministic, rule-based scoring engine** (no ML/LLM involvement in score calculation) that produces a 0–100 risk score for each student based on five weighted factors. The engine is purely TypeScript, runs server-side, and has zero external dependencies. A separate Groq AI layer translates raw scores into human-readable narratives, but never influences the score itself.

**Test results:** 26/31 passing (5 Groq integration tests skipped — dev server not running). Typecheck clean.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  RawStudentData                      │
│  (attendanceHistory with subjects, termTests,        │
│   backlogs, feeOverdueDays, submissionRate)          │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              computeRiskScore(student)                │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │scoreAtt- │ │scoreTerm-│ │scoreBack-│ │scoreFee│ │
│  │endance   │ │Tests     │ │logs      │ │Overdue │ │
│  │(0-30)   │ │(0-25)   │ │(0-20)   │ │(0-15) │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│  ┌──────────────────┐                               │
│  │scoreEngagement   │                               │
│  │(0-10)            │                               │
│  └──────────────────┘                               │
│         │                                           │
│         ▼                                           │
│  total = clamp(sum, 0, 100)                         │
│  riskLevel = total >= 61 ? 'High' :                 │
│              total >= 31 ? 'Medium' : 'Low'         │
│  factors.sort(by points desc)                       │
│  dominantFactor = factors[0] or 'None'              │
│  suggestedAction = getSuggestedAction(dominant, stu) │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                   RiskResult                         │
│  { riskScore, riskLevel, contributingFactors,        │
│    dominantFactor, suggestedAction }                 │
└──────────────────────┬──────────────────────────────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
┌──────────────────┐  ┌──────────────────┐
│ Groq AI Layer    │  │ Fallback Text    │
│ (human-readable  │  │ (deterministic,  │
│  narrative)      │  │  no API needed)  │
└──────────────────┘  └──────────────────┘
```

---

## 3. Input Data Shape

```typescript
interface AttendanceHistoryItem {
  week: string;
  percentage: number;
  subjects?: { subject: string; percentage: number }[];
}

interface RawStudentData {
  studentId: string;
  name: string;
  department: string;
  year: number;
  attendanceHistory: AttendanceHistoryItem[];  // Now includes subject breakdown
  subjectAttendance: { subject: string; percentage: number }[];  // Legacy
  termTests: { testName: string; score: number; maxMarks: number }[];
  backlogs: number;
  backlogSubjects: string[];
  feeOverdueDays: number;
  submissionRate: number;   // 0-100
}
```

---

## 4. Scoring Sub-Functions — Complete Breakdown

### 4.1 Attendance (0–30 points)

**Input:** Last 4 weeks of attendance percentages. Each week now includes optional subject-level breakdown. Invalid entries (NaN, negative, >100) are filtered out.

**Algorithm:**
1. Compute `latest` (most recent), `earliest` (oldest in window), `drop = earliest - latest`, `slope` (linear regression), and `avg`.
2. Score based on `latest` value using **linear interpolation within bands** (no hard cliffs):

| Latest Attendance | Base Points (interpolated) | Bonus Conditions | Bonus | Max |
|---|---|---|---|---|
| **< 60%** | 30 | — | — | 30 |
| **60–74%** | lerp(30, 20, (latest-60)/15) | `drop >= 15` OR `slope < -2` | +8 | 30 |
| **75–84%** | lerp(20, 8, (latest-75)/10) | `drop >= 15` OR `slope < -3` | +10 | 30 |
| **≥ 85%** | 0 | `drop >= 15` OR `slope < -4` → 12; `drop >= 8` → 5 | — | 12 |

**Subject-level data:** Stored in `attendanceHistory[i].subjects` for UI display. The scoring engine uses the `percentage` field (overall average). Subject data is available for:
- Per-subject trend visualization in the attendance chart
- `getSuggestedAction()` picks the lowest-attending subject for tutoring recommendations

---

### 4.2 Term Tests / Grades (0–25 points)

**Input:** Array of unit test results. Test names are **normalized** (trim + lowercase) before matching. Unrecognized names trigger `console.warn`. Invalid scores (<0, >100, NaN) are filtered.

**Algorithm — UT1 only (baseline):**

| UT1 Score | Points |
|---|---|
| **< 40** | 25 |
| **40–54** | 18 |
| **55–64** | 12 |
| **65–74** | 5 |
| **≥ 75** | 0 |

**Algorithm — UT2 only (no UT1):** Same baseline tiers.

**Algorithm — Both UT1 and UT2 (delta signal):**

| Diff | Effect | Label |
|---|---|---|
| **≥ +15** | pts − 15 (clamped ≥ 0) | Significant improvement |
| **+5 to +14** | pts − 5 (clamped ≥ 0) | Improvement |
| **−5 to +4** | no change | Stable |
| **−15 to −6** | pts + 5 (clamped ≤ 25) | Decline |
| **< −15** | pts + 10 (clamped ≤ 25) | Significant decline |

---

### 4.3 Backlogs (0–20 points)

| Backlogs | Points |
|---|---|
| **0** | 0 |
| **1** | 6 |
| **2** | 13 |
| **3** | 17 |
| **≥ 4** | 20 |

---

### 4.4 Fee Overdue (0–15 points)

| Overdue Days | Points |
|---|---|
| **0** | 0 |
| **1–10** | 6 |
| **11–30** | 12 |
| **> 30** | 15 |

---

### 4.5 Engagement / Submission Rate (0–10 points)

| Submission Rate | Points |
|---|---|
| **< 40%** | 10 |
| **40–54%** | 7 |
| **55–64%** | 4 |
| **65–74%** | 2 |
| **≥ 75%** | 0 |

---

## 5. Aggregation & Risk Levels

```
total = clamp(att + grade + backlog + fee + engagement, 0, 100)
```

| Score Range | Risk Level |
|---|---|
| **0–30** | Low |
| **31–60** | Medium |
| **61–100** | High |

---

## 6. Suggested Actions

| Dominant Factor | Suggested Action |
|---|---|
| **Grade Decline** | `Extra Class / Tutoring: {subject}` |
| **Attendance Decline** | `Counseling / Check-in` |
| **Fee Overdue** | `Financial Aid Referral` |
| **Backlogs** | `Academic Support` |
| **Low Engagement** | `Counseling / Check-in` |
| **None / Unknown** | `Monitor` |

---

## 7. Groq AI Integration

### Two Modes
1. **`explain`** — Risk narrative (220 max tokens, temp 0.4)
2. **`rationale`** — Intervention rationale (80 max tokens, temp 0.4)

### Model
- **Primary:** `qwen/qwen3.8-27b` (Preview, 450 tps)
- **Fallback:** `llama-3.3-70b-versatile` (Production, 280 tps)

---

## 8. Mock Data — 50 Students with Realistic Patterns

| Pattern | Count | Description | Typical Risk |
|---|---|---|---|
| **Stable High** | 10 | 85-95% attendance, 85-95 scores | Low |
| **Stable Mid** | 9 | 74-80% attendance, 62-72 scores | Medium |
| **Stable Low** | 5 | 46-53% attendance, 34-47 scores | High |
| **Declining** | 6 | Started 72-78%, dropped to 47-55% | High |
| **Was Good Then Bad** | 5 | Strong W1-W2, sharp crash W3-W4 | High |
| **Improving** | 5 | Started 50-65%, trending up | Medium |
| **Good Att, Bad Grades** | 4 | 78-87% attendance, 30-50 scores | High |
| **Spike Then Drop** | 3 | One good week then complete crash | High |
| **Recovering** | 3 | Was declining, now bouncing back | Medium |

Each student has:
- 4-week attendance trajectory with per-subject breakdown (DBMS, Computer Network, Python Programming)
- Unit Test 1 score (and Unit Test 2 for some students showing decline/improvement)
- Realistic backlog distribution (0-4 subjects)
- Fee overdue days (0-20 days for financially stressed students)
- Engagement/submission rate (30-88% based on pattern)

---

## 9. Upload History & Revert System

### Snapshot-Based Revert

When a CSV is uploaded:
1. **Before** modifying any student data, a deep snapshot of each affected student's state is saved
2. The upload proceeds normally (upsert by week, replace by test name, etc.)
3. The snapshot is stored in the upload log (`snapshots` field)

When an upload is deleted:
1. Each student's data is **restored from the snapshot** — not just "remove the entry"
2. Students **created by the upload** (no snapshot) are removed entirely
3. Risk scores are recalculated from restored data
4. Changes are synced to server

### Subject Attendance Merging

| Upload Type | Behavior |
|---|---|
| **WeeklyAttendance** | Sets overall % for the week, preserves existing subject breakdown |
| **SubjectAttendance** | Merges subject data into the matching week, recalculates overall as average |
| **Delete** | Restores from snapshot (both overall and subjects) |

---

## 10. Test Coverage

### Risk Engine Tests (26 passing)

| Test Category | Tests | Status |
|---|---|---|
| Baseline (healthy student) | 1 | ✅ |
| Attendance scoring (interpolated tiers) | 5 | ✅ |
| Grade scoring (UT1 tiers, UT2 delta) | 3 | ✅ |
| Backlog scoring (0–4+) | 1 | ✅ |
| Fee overdue scoring | 1 | ✅ |
| Engagement scoring | 1 | ✅ |
| Maximum risk (100 pts) | 1 | ✅ |
| Risk level boundaries | 1 | ✅ |
| Factor sort order | 1 | ✅ |
| Dominant factor tie-breaking | 1 | ✅ |
| Empty history handling | 1 | ✅ |
| Negative/out-of-range inputs | 1 | ✅ |
| Suggested action mapping | 2 | ✅ |
| Fallback explanation (0/1/2+ factors) | 3 | ✅ |
| Term test name normalization | 1 | ✅ |
| UT2-only baseline scoring | 1 | ✅ |
| Smooth interpolation verification | 1 | ✅ |

### Groq Integration Tests (5 skipped — no dev server)

| Test | Status | Notes |
|---|---|---|
| Prompt construction | ✅ | Pure unit test |
| Malformed input handling | ⏭️ | Requires server |
| Invalid mode rejection | ⏭️ | Requires server |
| Live explain (high-risk) | ⏭️ | Requires server + API key |
| Live explain (low-risk) | ⏭️ | Requires server + API key |
| Live rationale | ⏭️ | Requires server + API key |

---

## 11. Bug Fixes Applied

| Fix | Issue | Solution | Impact |
|---|---|---|---|
| **Name normalization** | `"unit test 1"` vs `"Unit Test 1"` | Trim + lowercase | No missed grade data |
| **UT2-without-UT1** | Low UT2 scored as "stable" | Baseline tier scoring | Correct risk for UT2-only |
| **Smooth interpolation** | Hard cliffs at tier boundaries | Linear interpolation | No sudden score jumps |
| **Input validation** | Negative scores / >100% | All scorers filter | Dirty CSV safe |
| **API key resilience** | Expired key → silent fallback | Auto model fallback | AI features resilient |
| **Upload revert** | Deleting upload didn't undo changes | Snapshot-based restore | Clean undo on delete |
| **Subject attendance merge** | Subject and overall were separate | Merged into attendanceHistory | Unified data model |
| **Realistic mock data** | All students had similar patterns | 9 different trend profiles | Realistic demo |

---

*Report generated by Sentinel automated testing system.*
