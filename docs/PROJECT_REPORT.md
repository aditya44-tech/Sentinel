# Sentinel — Complete Project Report

**Date:** September 17, 2026
**Version:** 1.1
**Stack:** Next.js 15 + TypeScript + Tailwind CSS + MongoDB (optional) + Groq AI
**Purpose:** AI-powered student dropout prediction and intervention management system

---

## 1. What Sentinel Does

Sentinel is a **predictive student dropout detection platform** for college mentors. It:

1. **Ingests** student data via CSV uploads (attendance with subject breakdown, grades, backlogs, fees, engagement)
2. **Scores** each student's dropout risk (0–100) using a deterministic rule engine
3. **Explains** the risk via AI-generated narratives (Groq API) or fallback text
4. **Recommends** targeted interventions (tutoring, counseling, financial aid, etc.)
5. **Tracks** intervention outcomes over time (before/after risk comparison)
6. **Visualizes** everything on a dashboard with charts, tables, and drill-down views

---

## 2. Recent Updates (v1.1)

### Subject-Level Attendance Merged into Overall

**Before:** Two separate fields — `attendanceHistory` (overall) and `subjectAttendance` (per-subject, last week only)

**After:** Single unified field with subject breakdown:
```typescript
attendanceHistory: [{
  week: "Week 1",
  percentage: 85,
  subjects: [
    { subject: "DBMS", percentage: 82 },
    { subject: "Computer Network", percentage: 85 },
    { subject: "Python Programming", percentage: 88 }
  ]
}]
```

**Benefits:**
- Single source of truth for all attendance data
- UI shows overall trend + per-subject lines on one chart
- Subject attendance upload merges into matching week (recalculates overall as average)
- Weekly attendance upload preserves existing subject breakdown

### Realistic Mock Data (50 Students, 9 Patterns)

| Pattern | Count | Description | Risk |
|---|---|---|---|
| Stable High | 10 | 85-95% att, 85-95 scores | Low |
| Stable Mid | 9 | 74-80% att, 62-72 scores | Medium |
| Stable Low | 5 | 46-53% att, 34-47 scores | High |
| Declining | 6 | Started 72-78%, dropped to 47-55% | High |
| Was Good Then Bad | 5 | Strong W1-W2, sharp crash W3-W4 | High |
| Improving | 5 | Started 50-65%, trending up | Medium |
| Good Att, Bad Grades | 4 | 78-87% att, 30-50 scores | High |
| Spike Then Drop | 3 | One good week then complete crash | High |
| Recovering | 3 | Was declining, now bouncing back | Medium |

### Upload Revert System

Deleting an upload from history now **restores the exact pre-upload state**:
- Snapshots student data before each upload
- On delete, restores from snapshot (not just "remove entry")
- Students created by upload are removed entirely
- Risk scores recalculated from restored data

---

## 3. Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript (strict mode) |
| **UI** | React 19, Tailwind CSS v4 |
| **Icons** | Lucide React |
| **Charts** | Recharts (custom AttendanceChart with subject lines) |
| **AI** | Groq API (`qwen/qwen3.8-27b` primary, `llama-3.3-70b-versatile` fallback) |
| **Database** | MongoDB via Mongoose (optional — in-memory fallback) |
| **Testing** | Node.js built-in test runner (31 tests) |

---

## 4. Project Structure

```
sentinel/
├── app/
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Login page
│   ├── providers.tsx             # Global state (SentinelProvider)
│   ├── dashboard/                # Mentor views
│   │   ├── page.tsx              # Dashboard
│   │   └── student/[id]/page.tsx # Student detail
│   ├── student/                  # Student self-view
│   └── api/                      # Server routes
│       ├── students/route.ts
│       ├── groq/explain/route.ts
│       ├── history/route.ts
│       └── interventions/
├── components/
│   ├── Header.tsx
│   ├── TrendChart.tsx            # Generic line chart
│   └── AttendanceChart.tsx       # NEW: Attendance with subject lines
├── views/
│   ├── LoginView.tsx
│   ├── DashboardView.tsx
│   ├── StudentDetailView.tsx
│   └── OutcomeComparisonView.tsx
├── lib/
│   ├── riskEngine.ts             # Scoring engine
│   ├── types.ts                  # TypeScript interfaces
│   ├── db.ts                     # In-memory store
│   ├── dbConnect.ts              # MongoDB connection
│   ├── models.ts                 # Mongoose schemas
│   └── mockData.ts               # 50 students, 9 patterns
└── tests/
    ├── riskEngine.test.ts        # 28 engine tests
    └── groq.test.ts              # 6 integration tests
```

---

## 5. Login Credentials

| Role | ID / Username | Password |
|------|---------------|----------|
| **Mentor** | `mentor` | `sentinel123` |
| **Student** | `S001` through `S050` | _(no password)_ |

---

## 6. Data Flow

### Upload → Risk Score → Dashboard

```
1. Mentor uploads CSV (WeeklyAttendance, SubjectAttendance, UnitTest, etc.)
2. handleDataUpload() in providers.tsx:
   a. Snapshots each affected student's current state
   b. Parses CSV rows, updates student data:
      - WeeklyAttendance → upserts by week label (preserves subject data)
      - SubjectAttendance → merges into attendanceHistory week (recalculates overall)
      - UnitTest1/2 → replaces test entry
      - Backlogs/FeeStatus → updates directly
   c. Calls computeRiskScore() for each affected student
   d. Syncs to server (fire-and-forget)
3. Dashboard re-renders with updated risk scores
```

### Upload Delete → Revert → Dashboard

```
1. Mentor clicks Delete on an entry in Recent Uploads (Grouped by Week)
2. handleDeleteUpload() in providers.tsx:
   a. Finds the upload log holding the pre-upload snapshots
   b. Loads any affected student it does not already hold from /api/students/[id]
   c. planUploadRevert() (lib/uploadRevert.ts — shared with the API route):
      - snapshot exists  → restore every field (attendance, grades, backlogs, fees, …)
      - snapshot is null → the upload created the student → remove them
      - no snapshot     → legacy upload, strip only the entries that upload added
   d. Recalculates risk score / factors / suggested action for each student
   e. POSTs the restored records to /api/students (and DELETEs created students)
   f. DELETEs the log from /api/history
   g. Clears the client detail cache
3. Dashboard, student detail, and outcome pages all re-read the restored data
```

The revert planner is one shared pure function (`lib/uploadRevert.ts`) used by
the browser **and** by `DELETE /api/history`, so both layers agree on what the
pre-upload state was. The client performs the write through `/api/students`
because that is the same store the dashboard reads back from.

---

## 7. API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/students` | GET/POST/DELETE | Student CRUD |
| `/api/students/[id]` | GET/PATCH | Individual student |
| `/api/groq/explain` | POST | AI narrative (explain/rationale) |
| `/api/history` | GET/POST/DELETE | Upload history with snapshots |
| `/api/interventions` | GET/POST | Intervention management |
| `/api/outcomes/[id]` | GET | Outcome comparison |

---

## 8. Intervention Lifecycle

```
1. Mentor assigns an intervention from the student profile
2. POST /api/interventions records the baseline risk score SERVER-SIDE
   (the value at the moment of assignment) and creates the intervention record
3. The student record stores activeIntervention = { type, details, status,
   assignedDate, baselineRiskScore }
4. The dashboard / profile / outcome page read that stored baseline
5. New attendance or test data only ever moves the CURRENT score — the baseline
   is immutable for the life of the intervention
6. MARK AS RESOLVED flips status to 'Resolved' on the student summary, the
   student record, the intervention itself and the cached outcome, so the
   outcome page, the profile chip and the student portal all close together
```

Rules that keep "before" honest:

| Situation | Behaviour |
|---|---|
| Baseline recorded at assignment | Used as-is, never recalculated |
| Legacy record with no baseline | Current score frozen into it **once** (`ensureBaseline`), then fixed |
| No intervention at all | `/api/outcomes/[id]` returns 404 — no fabricated comparison |
| Data changed after assignment | `currentScore` moves, `baselineScore` does not |

---

## 9. Testing

**41 tests total:**
- 26 risk engine unit tests
- 6 Groq integration tests (live — skipped only when the dev server is down)
- 4 upload-revert tests
- 6 intervention lifecycle tests (frozen baseline, legacy repair, resolve/reopen)

**Key test categories:**
- All 5 scoring factors (attendance, grades, backlogs, fees, engagement)
- Risk level boundaries (30/31/60/61)
- Grade delta calculation (UT2 improvement/decline vs UT1)
- Name normalization (case-insensitive, whitespace-trimmed)
- UT2-only baseline scoring
- Smooth interpolation at tier boundaries
- Upload revert (snapshot restore, created students, legacy logs)
- Intervention baseline freeze + resolve/reopen
- Edge cases (empty data, negative inputs, invalid values)

---

## 9. Architecture Decisions

| Decision | Why |
|----------|-----|
| **Deterministic scoring (no ML)** | Transparent, auditable, works offline |
| **In-memory primary + MongoDB optional** | Zero-config for demo, persistence when needed |
| **Groq API** | Faster (450 tps), cheaper, free tier available |
| **Snapshot-based upload revert** | Perfect undo — restores exact pre-upload state |
| **Merged subject attendance** | Single source of truth, unified chart display |
| **9 mock data patterns** | Realistic demo with varied risk profiles |

---

*Report generated by Sentinel automated testing system.*
