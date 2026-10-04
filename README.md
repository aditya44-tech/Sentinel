# Sentinel: AI-Powered Student Dropout Prediction Platform 🎯

> **Identifying at-risk students before they drop out using deterministic scoring + AI-powered narratives.**

Sentinel is a full-stack web application that helps college mentors detect, understand, and intervene with students at risk of dropping out. It analyzes attendance (overall + subject-wise), grades, backlogs, fee status, and engagement to produce a 0–100 risk score, generates human-readable AI explanations, and tracks intervention outcomes over time.

Built for **Hack2Ignite 2026**.

---

## 📋 Table of Contents

- [Demo Overview](#-demo-overview)
- [Login Credentials](#-login-credentials)
- [Key Features](#-key-features)
- [How It Works](#-how-it-works)
- [Risk Engine Deep Dive](#-risk-engine-deep-dive)
- [How the AI Works](#-how-the-ai-works)
- [Tech Stack](#️-tech-stack)
- [Getting Started](#-getting-started)
- [CSV Upload Format](#-csv-upload-format)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Testing](#-testing)
- [Demo Data](#-demo-data)
- [Architecture Decisions](#️-architecture-decisions)
- [AI Usage Disclosure](#-ai-usage-disclosure)

---

## 🎬 Demo Overview

### What you can do in the live demo:

1. **Log in as a Mentor** → See the dashboard with 50 pre-seeded students, sorted by risk score
2. **View high-risk students** → Click any student to see their full risk breakdown with AI-generated explanations
3. **Upload CSV data** → Update attendance, grades, or backlogs for students and watch risk scores recalculate in real-time
4. **Assign interventions** → Assign tutoring, counseling, or financial aid to at-risk students
5. **Track outcomes** → Compare baseline risk scores against current scores to measure intervention success
6. **Log in as a Student** → Students see their own risk profile, active interventions, and suggested actions

### Key screens:
- **Dashboard** — Student list with risk badges, distribution chart, upload history
- **Student Detail** — Full risk breakdown, attendance trend chart, grade comparison, AI narrative, intervention panel
- **Outcome Comparison** — Before/after intervention risk scores with improvement indicators

---

## 🔐 Login Credentials

| Role | ID / Username | Password |
|------|---------------|----------|
| **Mentor** | `mentor` | `sentinel123` |
| **Student** | `S001` through `S050` | _(no password — just enter the ID)_ |

Examples for student login:
- `S006` — Kabir Kale (High Risk, declining attendance)
- `S019` — Radhika Reddy (High Risk, fee overdue)
- `S022` — Ruchi Reddy (High Risk, 3 backlogs)
- `S001` — Mohit Chopra (Low Risk, stable high performance)

---

## 🔑 Key Features

| Feature | Description |
|---------|-------------|
| **Deterministic Risk Engine** | Pure TypeScript rule engine — no ML, no randomness. Every score is auditable and explainable. |
| **Subject-wise Attendance** | New CSV format includes per-subject attendance (`DBMS_attendance`, `DS_attendance`, etc.) merged alongside overall attendance. |
| **AI-Powered Narratives** | Groq AI translates raw numbers into empathetic, human-readable explanations for mentors. |
| **Dual-Risk Explanation** | AI narrative when available, deterministic fallback text when not — the UI never breaks. |
| **Real-Time Recomputation** | Upload a CSV → risk scores recalculate instantly across the entire student body. |
| **Upload Revert** | Deleting an upload in Recent Uploads restores each student to the state they were in before the upload (snapshot-based), then recalculates scores. |
| **Subject Attendance in Overall View** | Per-subject attendance is stored alongside overall attendance each week; the attendance chart shows overall attendance (subject data supports weak-subject recommendations internally). |
| **Intervention Management** | Assign, track, and resolve interventions with full audit trail. |
| **Outcome Tracking** | Before/after comparison shows if interventions are working (Improving/Worsening/No Change). |
| **Persistent Storage** | Fully integrated with MongoDB for robust, scalable persistent storage of student data. |
| **Input Validation** | Dirty CSV data (negative scores, >100% attendance) is filtered — never inflates risk scores. |
| **Initial Consultancy** | Deep-dive qualitative assessment using a 5-question framework to detect root causes (e.g. forced admission, financial stress). |
| **Escalation Ladder** | Automated timeline tracking for interventions. Escalates from 'Awaiting Reply' to 'Refer Up' if students are unresponsive. |
| **SMS Integration** | Automated, rate-limited SMS dispatch logic to securely contact students. Includes banned-word filtering. |

---

## 🔄 How It Works

### Complete Workflow (A–Z)

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: DATA INGESTION                                         │
│  Mentor uploads CSV files (attendance, grades, backlogs, fees)  │
│  → Parsed client-side, validated, stored in-memory + MongoDB    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: RISK SCORING                                           │
│  Deterministic engine analyzes 5 weighted factors:              │
│  Attendance (30) + Grades (25) + Backlogs (20) +               │
│  Fees (15) + Engagement (10) = 0–100 total                     │
│  → Risk Level: Low (0-30) | Medium (31-60) | High (61-100)     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: AI EXPLANATION                                         │
│  Server-side Groq API call translates scores → human text       │
│  Primary: qwen/qwen3.8-27b | Fallback: llama-3.3-70b-versatile │
│  If API unavailable → deterministic fallback text (never errors)│
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: INTERVENTION                                           │
│  Mentor reviews student detail → assigns intervention:          │
│  • Extra Class / Tutoring (for grade decline)                   │
│  • Counseling / Check-in (for attendance/engagement decline)    │
│  • Financial Aid Referral (for fee overdue)                     │
│  • Academic Support (for backlogs)                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: STUDENT VISIBILITY                                     │
│  Student logs in → sees their risk profile, active intervention │
│  with schedule, instructor, and subject details                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: OUTCOME TRACKING                                       │
│  Next week: mentor uploads new attendance/grades                │
│  → Risk score recalculates → compared against baseline          │
│  → Outcome: Improving / Worsening / No Change                   │
│  → Mentor marks intervention as Resolved when student stabilizes│
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧮 Risk Engine Deep Dive

The engine in `lib/riskEngine.ts` is the core of Sentinel. It is **100% deterministic** — no ML, no LLM involvement in scoring, no randomness. Every score can be traced back to specific input values.

### Five Weighted Factors

#### 1. Attendance (0–30 points)
Uses the last 4 weeks of attendance data. Scores smoothly within bands using linear interpolation:

| Latest Attendance | Base Points | Trend Bonus |
|---|---|---|
| < 60% | 30 | — |
| 60–74% | 20–30 (interpolated) | +8 if dropping fast |
| 75–84% | 8–20 (interpolated) | +10 if dropping fast |
| ≥ 85% | 0–12 (if large drop) | +5 for moderate drops |

Trend detection uses linear regression (slope) over 4 data points:
- Slope < -2 → "declining trend" (adds risk points)
- Slope > 2 → "improving trend"
- Slope ≈ 0 → "stable"

All interpolated values are **rounded to integers** before display.

#### 2. Grades (0–25 points)
Scores Unit Test 1 and Unit Test 2 with name normalization (case-insensitive, whitespace-trimmed):

| Score | Points |
|---|---|
| < 40 | 25 |
| 40–54 | 18 |
| 55–64 | 12 |
| 65–74 | 5 |
| ≥ 75 | 0 |

When both UT1 and UT2 exist, the engine calculates the **delta** (improvement or decline) and adjusts:
- UT2 improved by 15+ → subtract 15 points (strong recovery)
- UT2 dropped by 15+ → add 10 points (significant decline)

#### 3. Backlogs (0–20 points)
| Count | Points |
|---|---|
| 0 | 0 |
| 1 | 6 |
| 2 | 13 |
| 3 | 17 |
| 4+ | 20 |

#### 4. Fee Overdue (0–15 points)
| Days Overdue | Points |
|---|---|
| 0 | 0 |
| 1–10 | 6 |
| 11–30 | 12 |
| 30+ | 15 |

#### 5. Engagement / Submission Rate (0–10 points)
| Rate | Points |
|---|---|
| < 40% | 10 |
| 40–54% | 7 |
| 55–64% | 4 |
| 65–74% | 2 |
| ≥ 75% | 0 |

### Aggregation

```
Total = Math.round(clamp(attendance + grade + backlog + fee + engagement, 0, 100))

Risk Level:
  0–30   → Low     (green badge)
  31–60  → Medium  (yellow badge)
  61–100 → High    (red badge)
```

### Suggested Actions

The engine automatically recommends interventions based on the **dominant factor** (highest-pointing):

| Dominant Factor | Recommended Action |
|---|---|
| Grade Decline | Extra Class / Tutoring: {weakest subject} |
| Attendance Decline | Counseling / Check-in |
| Fee Overdue | Financial Aid Referral |
| Backlogs | Academic Support |
| Low Engagement | Counseling / Check-in |
| None | Monitor |

---

## 🤖 How the AI Works

Sentinel uses AI **exclusively as a translation layer, never for scoring.**

1. The deterministic engine calculates that a student has a score of `78/100` due to a 20% attendance drop and 3 backlogs
2. The server-side API securely sends this structured data to the Groq API
3. Groq generates a readable narrative: *"This student is at high risk due to a sharp attendance decline over the last 3 weeks, compounded by 3 active backlogs in DBMS, Computer Network, and Python Programming."*
4. If the Groq API fails, is rate-limited, or no API key is configured, the system automatically falls back to locally generated, rule-based text — **the UI never breaks during a demo**

> **Important:** The AI narrative is generated **only on explicit refresh**, not on every page visit. This prevents unnecessary API calls and quota exhaustion.

### Two AI Modes

| Mode | Purpose | Output |
|------|---------|--------|
| `explain` | Risk narrative for a student | 2–3 sentence summary |
| `rationale` | Why a specific intervention was recommended | 1 sentence (max 30 words) |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15 (App Router, Turbopack) |
| **Language** | TypeScript (strict mode) |
| **UI** | React 19, Tailwind CSS v4 |
| **Icons** | Lucide React |
| **Charts** | Recharts |
| **AI** | Groq API (`qwen/qwen3.8-27b` primary, `llama-3.3-70b-versatile` fallback) |
| **Database** | MongoDB via Mongoose |
| **Testing** | Node.js built-in test runner (41 tests) |
| **Build** | `next build`, `tsc --noEmit` |

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+ (v24 recommended for native test runner)
- A [Groq API Key](https://console.groq.com/keys) (free tier available)
- MongoDB connection string

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env.local` in the project root:

```env
# Required for AI narratives (get from https://console.groq.com/keys)
GROQ_API_KEY=gsk_your_api_key_here

# Required for persistent storage
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/sentinel

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Note:** If `GROQ_API_KEY` is not set, the app still works — AI narratives fall back to deterministic text.

### 3. Start the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Run Tests

```bash
npm test
```

Expected result this session: `41 passing, 0 skipped, 0 failing` in ~3 seconds.

---

## 📂 CSV Upload Format

The Weekly Attendance CSV uses a unified "overall" format that includes both overall and subject-wise attendance in a single file:

```csv
studentId,name,department,year,attendance,week,DBMS_attendance,DS_attendance,Computational Math_attendance,Computer Network_attendance,Python Programming_attendance
S001,Suresh Nair,Computer Science,4,64,Week 1,56,75,57,70,64
S002,Nidhi Pillai,Computer Science,2,50,Week 1,46,60,52,49,41
```

| Column | Description |
|--------|-------------|
| `studentId` | Unique student ID (e.g. `S001`) |
| `name` | Full student name |
| `department` | Department name |
| `year` | Academic year (1–4) |
| `attendance` | Overall attendance % for the week |
| `week` | Week label (e.g. `Week 1`) — **read directly from CSV, not the UI input** |
| `*_attendance` | Per-subject attendance % (any number of columns, named `SubjectName_attendance`) |

> The parser automatically detects all `*_attendance` columns and stores them per-week. Subject names are extracted by stripping the `_attendance` suffix.

### Other CSV Formats

| Upload Type | Required Columns |
|-------------|-----------------|
| Unit Test 1 / 2 | `studentId, score, maxMarks, date` |
| Backlogs | `studentId, backlogCount, backlogSubjects` |
| Fee Status | `studentId, feeStatus, overdueDays` |

---

## 📁 Project Structure

```
sentinel/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout (providers, header, fonts)
│   ├── page.tsx                      # Login page → redirects to dashboard/student
│   ├── providers.tsx                 # Global state (SentinelProvider context)
│   ├── globals.css                   # Tailwind + custom styles
│   ├── error.tsx                     # Route-level error boundary
│   ├── not-found.tsx                 # 404 page
│   ├── global-error.tsx              # Root layout error boundary
│   │
│   ├── dashboard/                    # Mentor views
│   │   ├── page.tsx                  # Dashboard: student list, charts, uploads
│   │   └── student/[id]/page.tsx     # Student detail: full profile + AI + interventions
│   │
│   ├── student/                      # Student self-view
│   │   └── page.tsx                  # Students see their own risk profile
│   │
│   └── api/                          # Server-side API routes
│       ├── students/route.ts         # GET/POST/DELETE students
│       ├── students/[id]/route.ts    # GET/PATCH individual student
│       ├── groq/explain/route.ts     # Groq AI proxy (explain + rationale)
│       ├── history/route.ts          # Upload history CRUD
│       ├── interventions/            # Intervention management
│       └── outcomes/                 # Outcome comparison data
│
├── components/                       # Reusable UI components
│   ├── Header.tsx                    # Top navigation bar
│   ├── TrendChart.tsx                # Attendance trajectory chart (Recharts)
│   ├── AttendanceChart.tsx           # Subject-wise attendance chart
│   ├── StudentTableRow.tsx           # Dashboard table row
│   ├── StudentCard.tsx               # Mobile dashboard card
│   ├── RiskBadge.tsx                 # Risk level badge (Low/Medium/High)
│   └── InterventionStatusBadge.tsx   # Intervention status badge
│
├── views/                            # Major application screens
│   ├── LoginView.tsx                 # Login screen (mentor/student selection)
│   ├── DashboardView.tsx             # Main dashboard with charts
│   ├── StudentDetailView.tsx         # Full student profile + risk breakdown
│   ├── MentorActionPanel.tsx         # Intervention assignment panel
│   └── OutcomeComparisonView.tsx     # Before/after intervention comparison
│
├── lib/                              # Core logic & utilities
│   ├── riskEngine.ts                 # Deterministic scoring engine (0–100)
│   ├── types.ts                      # Shared TypeScript interfaces
│   ├── db.ts                         # In-memory data store
│   ├── dbConnect.ts                  # MongoDB connection (optional)
│   ├── models.ts                     # Mongoose schemas (incl. subject attendance)
│   └── mockData.ts                   # 50 pre-seeded CS students
│
├── tests/                            # Test suite (41 tests)
│   ├── riskEngine.test.ts            # Risk-engine unit tests (attendance, grades, backlogs, fees, engagement, boundaries, edge cases)
│   ├── interventionLifecycle.test.ts # Intervention lifecycle: baseline freeze, resolve/reopen, legacy repair
│   ├── dbRevert.test.ts              # Upload revert: snapshot restore, created-student removal, legacy cleanup
│   ├── groq.test.ts                  # Groq prompt construction and integration tests
│   ├── ts-register.mjs               # TypeScript test bootstrap
│   └── ts-resolve-hooks.mjs          # Module resolution hook
│
├── data/                             # Raw CSV files
│   ├── CS_Week1_overall.csv          # Week 1: overall + subject attendance
│   ├── CS_Week2_overall.csv          # Week 2: overall + subject attendance
│   ├── CS_Week3_overall.csv          # Week 3: overall + subject attendance
│   ├── CS_Week4_overall.csv          # Week 4: overall + subject attendance
│   ├── CS_UnitTest1.csv              # Unit Test 1 scores
│   ├── CS_UnitTest2.csv              # Unit Test 2 scores
│   ├── CS_Backlogs.csv               # Backlog counts and subjects
│   ├── CS_FeeStatus.csv              # Fee status and overdue days
│   ├── CS_EndSem.csv                 # End semester results
│   └── CS_LastSemResult.csv          # Last semester results
│
└── next.config.ts                    # Next.js config (Turbopack, standalone output)
```

---

## 📡 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/students` | GET | List all students (summaries) |
| `/api/students` | POST | Bulk upsert students |
| `/api/students` | DELETE | Clear all students |
| `/api/students/[id]` | GET | Get full student detail |
| `/api/students/[id]` | PATCH | Update student risk/intervention |
| `/api/groq/explain` | POST | Generate AI narrative (explain/rationale) |
| `/api/history` | GET | List upload history |
| `/api/history` | POST | Log a new upload |
| `/api/history` | DELETE | Remove upload record |
| `/api/interventions` | GET | List all interventions |
| `/api/interventions` | POST | Create new intervention |
| `/api/interventions/[id]` | PATCH | Update intervention status |
| `/api/outcomes/[id]` | GET | Get outcome comparison |

---

## 🧪 Testing

The project includes an automated test suite using Node.js built-in test runner. Run it with:

```bash
npm test          # Run all tests
npx tsc --noEmit  # Type-check without emitting
```

### Current Test Result

```bash
✔ ... 41 passing, 0 skipped, 0 failing
ℹ duration_ms ~3-5s
```

### Test Categories

#### Risk Engine Tests
- Healthy baseline student scoring
- All 5 factor scoring tiers (attendance, grades, backlogs, fees, engagement)
- Grade delta calculation (UT2 improvement/decline vs UT1)
- Risk level boundaries (30/31/60/61)
- Factor ranking and tie-breaking
- Edge cases: empty data, negative inputs, out-of-range values
- Term test name normalization (case-insensitive, whitespace-trimmed match for `Unit Test 1` / `Unit Test 2`)
- Smooth interpolation at tier boundaries (no hard cliffs at 60%/75%/85%)
- UT2-only scoring against baseline tiers when UT1 is missing

#### Intervention Lifecycle Tests
- Baseline is frozen at assignment while the current score moves
- Legacy intervention without a baseline gets frozen once, not tracked
- Resolving closes the intervention everywhere; re-opening restores it
- Resolving leaves no stale baseline behind
- A student with no intervention has no outcome
- Seeded interventions ship with a frozen baseline and a real score gap

#### Groq Integration Tests
- Prompt construction accuracy
- Live API calls (when server + Groq API key are available)
- Malformed input handling
- Invalid mode rejection

> **Note:** The Groq tests only run when the dev server is up **and** a valid `GROQ_API_KEY` is configured. If either is missing, those tests are skipped (not failing) and the suite still reports the other passing tests.

---

## 📊 Demo Data

Sentinel ships with **50 pre-seeded Computer Science students** (S001–S050) with realistic data:

| Trend Profile | Students | Description |
|---|---|---|
| Stable High | 10 | Consistent good attendance + grades (low risk) |
| Stable Mid | 9 | Average attendance + grades (medium risk) |
| Stable Low | 5 | Consistently poor performance (high risk) |
| Declining | 6 | Started good, dropped over 4 weeks (high risk) |
| Was Good Then Bad | 5 | Strong early weeks, sharp drop after (high risk) |
| Improving | 5 | Started low, trending upward (medium risk) |
| Good Attendance, Bad Grades | 4 | Attend regularly but failing (high risk) |
| Spike Then Drop | 3 | One good week then collapse (high risk) |
| Recovering | 3 | Was declining, now bouncing back (medium risk) |

### Pre-Seeded Interventions (for demo)

| Student | Risk Score | Intervention | Status |
|---------|-----------|--------------|--------|
| S006 — Kabir Kale | 62 (Medium) | Extra Class: DS & DBMS, Tue/Thu 4PM | Active |
| S019 — Radhika Reddy | 74 (High) | Counseling, Mon 3PM | Active |
| S022 — Ruchi Reddy | 72 (High) | Academic Support, Wed/Fri 5PM | Active |

---

## 🏗️ Architecture Decisions

| Decision | Why |
|----------|-----|
| **Deterministic scoring (no ML)** | Transparent, auditable, works offline, no training data needed |
| **MongoDB Persistence** | Robust, scalable storage of student data, interventions, and historical outcomes |
| **Groq API** | Faster (450 tps), cheaper, free tier available |
| **Client-side CSV parsing** | No server upload needed, instant feedback |
| **Fire-and-forget server sync** | UI updates immediately, background persistence |
| **Dual-risk explanation** | AI narrative when available, deterministic fallback when not |
| **Turbopack dev server** | Faster HMR, no Webpack worker crashes |
| **Week label from CSV** | Parser reads `week` column directly from CSV — no user-input mismatch possible |

---

## 🧩 Bug Fixes & Robustness

| Fix | Issue | Solution |
|-----|-------|----------|
| Name normalization | `"unit test 1"` vs `"Unit Test 1"` missed matches | Trim + lowercase before comparison |
| UT2-without-UT1 | Low UT2 scored as "stable" (0 pts) | UT2-only now scores against baseline tiers |
| Smooth interpolation | Hard cliffs at 60%/75%/85% boundaries | Linear interpolation within each band |
| Integer scores | Floating-point risk scores leaked into UI | `Math.round()` applied to all interpolated values |
| Input validation | Negative scores / >100% inflated risk | All scorers filter invalid values |
| API key resilience | Expired key → silent fallback | Automatic model fallback + clear logging |
| Subject attendance | Separate subject-wise CSVs were redundant | Single `*_overall.csv` with `*_attendance` columns |
| Week label mismatch | UI week box could differ from CSV data | Parser now reads `week` column directly from CSV row |
| Reset-after-revert | Deleting an upload left stale data and drifted scores | Uploads snapshot each student before applying changes; delete restores the snapshot and recalculates scores
| Score drift after revert | `submissionRate` cleared after revert, recomputing the engagement factor incorrectly | `submissionRate` is now persisted on the student and used by both upload and revert paths
| Intervention baseline | On assignment, the "before" score could be the current score (missing baseline → fake 0-vs-current comparison) | Baseline is recorded once on assignment and never moved; outcome page uses the frozen baseline
| Resolve status mismatch | Clicking Mark as Resolved only flipped a summary flag, leaving the outcome page and student portal showing "Monitoring in Progress" | Resolving now flips status in every store (summary, detail, intervention record, outcome, student-facing) and the outcome page re-reads the student after the mutation
| Outcome page refresh | Outcome page could render the pre-click `status` and miss the change | Outcome page re-fetches the student detail after resolve/reopen when the intervention status actually changed
| Subject-wise upload | Separate overall and subject-wise upload buttons were redundant after the merge | Single attendance upload now accepts overall + per-subject `*_attendance` columns in one CSV
| Hydration warning | Bitdefender extension injected `bis_skin_checked` | `suppressHydrationWarning` on `<html>` and `<body>` |

## 🤖 AI Usage Disclosure

This project used the following AI tools during development:

- **Google AI Studio** — for UI/UX design
- **Antigravity** (Gemini 3.1, Claude Sonnet 4.6) — for core logic implementation and development
- **Freebuff** (Mimo 2.5) — for testing

Architecture decisions, the risk-scoring engine's logic, and overall feature design were made by the team; AI tools were used to assist implementation, not to generate the solution's core ideas.

---

## 📄 License

Built for **Hack2Ignite 2026**.

---

*Sentinel — Because every student deserves a chance to succeed.*
