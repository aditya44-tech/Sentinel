# Sentinel — Project Report, SOP & Error Register

**Document type:** Engineering Project Report + Standard Operating Procedure + Error/Wrong-Logic Register
**Project:** Sentinel — Predictive Student Dropout Detection & Intervention System
**Stack:** Next.js 15 (App Router) · React 19 · TypeScript 5.8 (strict) · Tailwind CSS v4 · Recharts · Papaparse · Mongoose 8 / MongoDB (optional) · Groq AI
**Deployment target:** Vercel (serverless)
**Verification run:** `npx tsc --noEmit` → exit 0, no diagnostics. `npm test` → 49 tests, 42 pass, 7 skipped, 0 fail (~2.53 s).
**Author note:** This document describes what the code does **now**, not what the README claims. Every finding cites `file:line` and quotes the code. `CONFIRMED` = proven from source; `SUSPECTED` = needs runtime evidence (stated).

> **Side effect disclosure:** running the permitted `npx tsc --noEmit` touched the incremental build artifact `tsconfig.tsbuildinfo` (already tracked). No source, config, test, or data file was modified. Only `SENTINEL_PROJECT_REPORT_SOP.md` was created.

---

## Table of Contents

- [Part A — Project Report](#part-a--project-report)
  - [A1. Purpose, users, problem](#a1-purpose-users-problem)
  - [A2. Architecture and data-flow diagrams](#a2-architecture-and-data-flow-diagrams)
  - [A3. Storage model, source of truth, Vercel behaviour](#a3-storage-model-source-of-truth-vercel-behaviour)
  - [A4. Data model and Mongoose strict-mode comparison](#a4-data-model-and-mongoose-strict-mode-comparison)
  - [A5. Risk engine](#a5-risk-engine)
  - [A6. Upload pipeline per type](#a6-upload-pipeline-per-type)
  - [A7. Intervention and outcome logic](#a7-intervention-and-outcome-logic)
  - [A8. Charts and week handling](#a8-charts-and-week-handling)
  - [A9. API reference](#a9-api-reference)
  - [A10. AI layer (Groq)](#a10-ai-layer-groq)
  - [A11. Security review](#a11-security-review)
  - [A12. Test coverage and verification results](#a12-test-coverage-and-verification-results)
- [Part B — SOP](#part-b--sop)
  - [B1. Local setup](#b1-local-setup)
  - [B2. Deploying to Vercel + Atlas](#b2-deploying-to-vercel--atlas)
  - [B3. Weekly attendance upload](#b3-weekly-attendance-upload)
  - [B4. Other uploads](#b4-other-uploads)
  - [B5. Reset All Data](#b5-reset-all-data)
  - [B6. Deleting / reverting an upload](#b6-deleting--reverting-an-upload)
  - [B7. Interventions](#b7-interventions)
  - [B8. Student portal](#b8-student-portal)
  - [B9. Troubleshooting](#b9-troubleshooting)
  - [B10. Pre-demo / pre-release checklist](#b10-pre-demo--pre-release-checklist)
- [Part C — Error and Wrong-Logic Register](#part-c--error-and-wrong-logic-register)
- [Part D — Summary](#part-d--summary)

---

# Part A — Project Report

## A1. Purpose, users, problem

Sentinel is a web application that helps a college mentor find students at risk of dropping out and act on that risk.

- **Mentor (staff):** logs in, sees a ranked cohort of students with risk scores, uploads weekly/periodic CSV data, reads an AI-generated narrative and a deterministic factor breakdown per student, assigns interventions (tutoring, counseling, financial-aid referral, academic support, parent notification), and tracks before/after outcomes.
- **Student:** logs in with just their student ID and sees a supportive, score-free view of their own active support plan and focus areas.

The problem it solves: identification and intervention are usually manual and late. Sentinel converts raw attendance/grades/backlogs/fees/engagement into an auditable 0–100 risk score, keeps a frozen baseline so change can be measured, and uses an LLM only to *explain* — never to score.

Login credentials (`README.md`; enforced in `views/LoginView.tsx`): mentor `mentor` / `sentinel123`; students `S001`–`S050` with no password.

---

## A2. Architecture and data-flow diagrams

### Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│ UI LAYER — app/*/page.tsx  →  views/*.tsx  →  components/*.tsx          │
│   DashboardView, StudentDetailView, MentorActionPanel,                 │
│   OutcomeComparisonView, StudentFacingStatusView, LoginView            │
│   (Recharts charts, Lucide icons, Tailwind neo-brutalist classes)      │
└───────────────▲──────────────────────────────────────┬────────────────┘
                │ useSentinel() context                 │ fetch()
┌───────────────┴──────────────────────────────────────▼────────────────┐
│ CLIENT STATE LAYER — app/providers.tsx                                 │
│   authUser, students[], uploadHistory[], detailsMap{}, dataVersion      │
│   handleDataUpload / handleDeleteUpload / handleClearAllData /          │
│   handleInterventionAssigned / handleResolve / handleReopen             │
│   (optimistic state + fire-and-forget server sync)                     │
└──────────────────────────────┬────────────────────────────────────────┘
                               │ HTTP
┌──────────────────────────────▼────────────────────────────────────────┐
│ API LAYER — app/api/**/route.ts (Next.js route handlers, Node runtime) │
│   students, students/[id], history, interventions, interventions/[id],  │
│   outcomes/[id], groq/explain                                          │
└───────┬───────────────────────────────────────────────┬───────────────┘
        │ try Mongo first (isDbConnected)                │ always update
┌───────▼──────────────────────────┐        ┌────────────▼───────────────┐
│ MONGODB (Mongoose, optional)      │        │ MEMORY STORE — lib/db.ts    │
│  Student, UploadHistory, Outcome  │        │  globalThis.__sentinelDb:   │
│  (Outcome is never written)       │        │  students, details,statuses,│
└───────────────────────────────────┘        │  outcomes, interventions,   │
                                             │  history (seeded mockData)  │
                                             └────────────┬───────────────┘
                                                          │
                                             ┌────────────▼───────────────┐
                                             │ GROQ API (server-side only) │
                                             │  /api/groq/explain proxy    │
                                             └─────────────────────────────┘
```

**Layer responsibilities (evidence):**
- Client state and all client-side mutation logic: `app/providers.tsx` (`SentinelProvider`, `useSentinel`).
- Deterministic scoring: `lib/riskEngine.ts` (`computeRiskScore`, `generateFallbackExplanation`).
- Shared pure revert planner: `lib/uploadRevert.ts` (`planUploadRevert`, `buildSnapshot`, `recomputeStudentRisk`).
- In-memory store + lifecycle: `lib/db.ts` (state on `globalThis`, lines 95–104).
- Mongo connection: `lib/dbConnect.ts`; schemas: `lib/models.ts`.
- AI proxy: `app/api/groq/explain/route.ts`.

### Data-flow: CSV upload → score → dashboard

```
Papa.parse(file)                         views/DashboardView.tsx:154
  → validate required columns            DashboardView.tsx:161-186
  → handleDataUpload(...)                providers.tsx:127
      → GET /api/students/{id} per affected id (serverConfirm)   providers.tsx:147-161
      → newDetails = {...detailsMap, ...serverConfirm.confirmed} providers.tsx:163
      → snapshot each student BEFORE mutate (buildSnapshot)      providers.tsx:178-189
      → per-type merge (attendance/tests/fees/backlogs/...)      providers.tsx:198-330
      → computeRiskScore + generateFallbackExplanation           providers.tsx:253-...
      → optimistic setStudents/setDetailsMap                     providers.tsx:339-365
      → FIRE-AND-FORGET POST /api/students (whole cache)         providers.tsx:369
      → setUploadHistory + setDataVersion++                      providers.tsx:385-386
      → FIRE-AND-FORGET POST /api/history                        providers.tsx:387
```

### Data-flow: Reset All Data

```
handleClearAllData()                     providers.tsx:399
  → clear client state (students/details/history)              providers.tsx:402-404
  → await Promise.all[
        DELETE /api/students      → clearAllStudents()=resetAllData() db.ts:409 + Student.deleteMany  students/route.ts:70-76
        DELETE /api/history       → memory history clear + UploadHistory.deleteMany  history/route.ts:91-101
        DELETE /api/interventions → resetAllData() again + Outcome.deleteMany  interventions/route.ts:51-58
    ]                                                          providers.tsx:409-414
  → refreshFromServer(); dataVersion++                         providers.tsx:417-419
```

### Data-flow: Upload delete / revert

```
handleDeleteUpload(uploadedAt)           providers.tsx:425
  → find log; preload missing affected students from server    providers.tsx:429-454
  → planUploadRevert(log, details) [shared pure]               providers.tsx:456 → lib/uploadRevert.ts:104
  → POST restored students ; DELETE created students            providers.tsx:459-467
  → DELETE /api/history?uploadedAt=...                          providers.tsx:474
  → clear detailsMap; re-fetch students; filter history         providers.tsx:478-486
Server side, DELETE /api/history independently calls revertUpload(record) (same planner) history/route.ts:69-89
```

### Data-flow: Intervention assign / resolve

```
Assign (mentor):
  handleInterventionAssigned(payload)                          providers.tsx:489
    → if status 'Notified': PATCH student {notificationLog} and RETURN   providers.tsx:491-503
    → POST /api/interventions {client-side score as baseline}            providers.tsx:515-527
        server: createIntervention(payload, baseline)                    interventions/route.ts:34, db.ts:140
    → optimistic students/detailsMap update (activeIntervention)          providers.tsx:538-550
    → PATCH /api/students/{id} {interventionStatus, activeIntervention}  providers.tsx:551

Resolve / Reopen:
  handleResolveIntervention(id)  providers.tsx:568
    → optimistic status flip; PATCH /api/interventions/{id} {status}; PATCH /api/students/{id}
  Outcome page then force-refetches                                      outcome/page.tsx:118-131
```

### Data-flow: AI explanation

```
StudentDetailView (no stored aiExplanation) → POST /api/groq/explain {mode:'explain'}
  → route builds prompt → Groq primary qwen/qwen3.8-27b → fallback openai/gpt-oss-20b
  → 429: wait (bounded) + retry ; empty content: retry with reasoning_effort:'low'
  → returns {text, model, powered} OR {text, fallback:true, error}
  → persist aiExplanation onto Student (Mongo if connected, else memory)   route.ts:294-311
  → UI badge: "GROQ · model" vs "STRUCTURED FALLBACK"                     StudentDetailView.tsx:240-266
```

---

## A3. Storage model, source of truth, Vercel behaviour

### What is stored where

| Data | In-memory (`lib/db.ts` state) | MongoDB | Notes |
|---|---|---|---|
| Student summaries + full details | Yes (seeded from `mockData`) | Yes (`Student`) | `POST /api/students` writes both; `GET` prefers Mongo if non-empty |
| Upload history + snapshots | Yes | Yes (`UploadHistory`) | both |
| Interventions (log) | Yes (`state.interventions`) | **No** | no `Intervention` model exists |
| Student-facing status | Yes (`state.statuses`) | **No** (only via student doc's `activeIntervention`) | memory-only store |
| Outcomes | Yes (`state.outcomes`) | **Never written** (`Outcome` only ever `deleteMany`) | see C-12 |
| Groq `aiExplanation` | Yes | Yes | persisted on the `Student` doc |
| Auth session | Client `localStorage` (`ea_authUser`) | No | no server session |

Evidence: `lib/db.ts:95-104`; `lib/models.ts:4-96`; `grep Outcome` shows only `Outcome.deleteMany({})` at `app/api/interventions/route.ts:58` and no `.create`/`.save` anywhere.

### Source of truth by mode

- **No `MONGODB_URI`:** memory is the **only** store. `isDbConnected()` returns `false` immediately (`lib/dbConnect.ts:31-33`). The app works fully, but every restart/redeploy resets to the seeded 50 students.
- **With `MONGODB_URI` and reachable:** `students` and `history` reads prefer Mongo **only if Mongo returns a non-empty result** (`students/route.ts:8-28`, `history/route.ts:8-19`). Interventions and outcomes are **always memory-first/source**, so Mongo is *not* the source of truth for them.
- **With `MONGODB_URI` but unreachable:** after a 2.5 s failure the app enters a 60 s cooldown (`dbConnect.ts:22,35-37,63`) during which all writes are memory-only (item C-09).

### Vercel serverless behaviour

`state` lives on `globalThis.__sentinelDb` (`lib/db.ts:95-97`). On Vercel:
- Each serverless instance has **its own** `globalThis`. A write on instance A is invisible to instance B.
- A **cold start** re-initialises `state` from `mockData`, including the seeded interventions for **S006, S019, S022** (`lib/db.ts:97-104` initialised from `initialStudents`, `studentStatusMap`, `outcomeComparisonsMap`; seeds attached in `lib/mockData.ts:383,412,421-432`).
- Because reads fall back to memory when Mongo is empty (`students/route.ts:8-28`), a reset that empties Mongo can be undone visually by any cold instance, which re-serves the seeded cohort.

**CONFIRMED** in code; the *degree* of impact on a given deployment is SUSPECTED (depends on instance reuse).

---

## A4. Data model and Mongoose strict-mode comparison

### `StudentDetail` (`lib/types.ts:56-81`) vs `StudentSchema` (`lib/models.ts:4-65`)

| Field | In types | In Mongoose schema | Dropped on save? |
|---|---|---|---|
| `studentId` | yes | yes (`:5`) | no |
| `name` | yes | yes (`:6`) | no |
| `department` | yes | yes (`:7`) | no |
| `year` | yes | yes (`:8`) | no |
| `riskScore` | yes | yes (`:10`) | no |
| `riskLevel` | yes | yes (`:11`) | no |
| `interventionStatus` | yes | yes (`:12`) but **enum `['None','Active','Resolved']`** | **`'Referred'`/`'Notified'` rejected** (see C-13) |
| `activeIntervention.type/details/status/assignedDate/baselineRiskScore` | yes | yes (`:56-62`), `status` enum `['Active','Resolved','Discontinued']` | **`'Referred'`/`'Notified'` rejected** |
| `contributingFactors` | yes | yes (`:47-51`) | no |
| `attendanceHistory[].week/.percentage/.subjects` | yes | yes (`:15-22`) | no |
| **`attendanceHistory[].isUploaded`** | yes (`types.ts:41`) | **absent** | **YES** |
| `subjectAttendance[].subject/.week/.percentage` | yes | yes (`:23-27`) | no |
| `termTests[].testName/.score/.maxMarks/.date` | yes | yes (`:28-33`) | no |
| `endSemResult` / `lastSemResult` | yes | yes (`:34-44`) | no |
| `backlogCount`/`backlogSubjects`/`feeStatus`/`feeOverdueDays`/`submissionRate` | yes | yes (`:45-46,52-55`) | no |
| `aiExplanation`/`suggestedAction` | yes | yes (`:52-55`) | no |
| **`notificationLog`** (written by client) | **not in types either** | **absent** | **YES** |

Evidence for the two dropped fields:
```ts
// lib/types.ts:38-42
export interface AttendanceHistoryItem {
  week: string;
  percentage: number;
  subjects?: SubjectAttendanceEntry[];
  isUploaded?: boolean;      // ← never declared in models.ts
}
```
```ts
// lib/models.ts:15-22   (no isUploaded path)
attendanceHistory: [{
  week: String,
  percentage: Number,
  subjects: [{ subject: String, percentage: Number }]
}],
```
```ts
// app/providers.tsx:501  (notificationLog sent, unschema'd)
body: JSON.stringify({ notificationLog: payload })
```

### `UploadLog` (`lib/types.ts:132-143`) vs `UploadHistorySchema` (`lib/models.ts:67-79`)

All fields present: `id, week, type, uploadedAt, studentsUpdated, uploadedBy, rawData, snapshots, fileName`. Schema adds `createdAt`/`updatedAt` via `{timestamps:true}`. **No drop.**

### `activeIntervention` type vs schema
```ts
// lib/types.ts:96-105
export interface StudentActiveIntervention {
  type: string;
  details: { subject?: string; schedule?: string; instructor?: string; [key: string]: unknown };
  status: string;
  assignedDate: string;
  baselineRiskScore?: number;
}
```
Schema (`models.ts:56-62`) declares `type, details: Mixed, status, assignedDate, baselineRiskScore`. Structurally matches, but `status` enum narrowing causes rejections for `Referred`/`Notified` (**C-13**).

---

## A5. Risk engine (`lib/riskEngine.ts`)

All scoring is deterministic and dependency-free. `computeRiskScore` at `:256`, aggregation at `:263-268`.

### Attendance (0–30) — `scoreAttendance` `:67-104`

```
vals = last 4 weeks (invalid filtered)              :68-70
latest, earliest, drop, slope(linear regression), avg :72-76
latest < 60            → 30                          :82-84
60 <= latest < 75      → lerp(30,20,(latest-60)/15)  :85-88
                         +8 if drop>=15 or slope<-2 (cap 30)
75 <= latest < 85      → lerp(20,8,(latest-75)/10)   :89-92
                         +10 if drop>=15 or slope<-3 (cap 30)
latest >= 85           → 0, but 12 if drop>=15 or slope<-4,
                         else 5 if drop>=8            :93-97
pts = Math.round(clamp(pts,0,30))                     :99
```
```ts
// lib/riskEngine.ts:99
  pts = Math.round(clamp(pts, 0, 30));
```

**Arithmetic check — CONFIRMED discontinuity at 85:** the bands are continuous at 60 and 75, but at 85 the base drops from ≈8 (at 84.99, `lerp(20,8,~1)`) to **0**, a hard ~8-point cliff. The `>=85` band's 12-point "sharp drop" value is also **larger** than the 84%-flat value, so the function is non-monotonic there. The test at `riskEngine.test.ts` only asserts `pts84 > pts85`, which passes and hides the cliff.

### Grades (0–25) — `scoreTermTests` `:121-181`

```ts
// lib/riskEngine.ts:113-119
function baselineTierPoints(score: number): number {
  if (score < 40) return 25;
  if (score < 55) return 18;
  if (score < 65) return 12;
  if (score < 75) return 5;
  return 0;
}
```
- UT1 only → tier score (`:145-148`). UT2 only → tier score (`:172-176`).
- Both → score UT2, then delta (`:157-170`): `diff>=15 → pts-15`; `diff>=5 → pts-5`; `diff<-15 → pts+10`; `diff<-5 → pts+5`; else stable. Clamped 0–25 (`:180`).
- Names normalized `trim().toLowerCase()`; unknown names warn and are excluded (`:127-132`).

Boundaries: `diff=-15` → falls to `< -5` → +5 (matches README "−15 to −6"); `diff=-5` → stable (matches "−5 to +4"). **No off-by-one found.**

### Backlogs (0–20) — `:183-193`
`>=4→20`, `3→17`, `2→13`, `1→6`, `0→0`.

### Fee overdue (0–15) — `:195-202`
`>30→15`, `>10→12`, `>0→6`, else 0.

**README mismatch — CONFIRMED:** `README.md` states "30+ → 15", but code requires strictly `>30`, so exactly 30 days scores 12 (test asserts `[30,12]`). Cosmetic wording bug.

### Engagement (0–10) — `:204-217`
`<40→10`, `<55→7`, `<65→4`, `<75→2`, else 0. Invalid/out-of-range → 0.

### Aggregation and risk levels — `:263-268`
```ts
263  const total = Math.round(clamp(
264    attResult.points + gradeResult.points + backlogResult.points + feeResult.points + engResult.points,
265    0, 100
266  ));
268  const riskLevel: RiskLevel = total >= 61 ? 'High' : total >= 31 ? 'Medium' : 'Low';
```
Max = 30+25+20+15+10 = 100. Matches README (0–30 Low, 31–60 Medium, 61–100 High).

### Suggested action — `:219-241`
Grade→`Extra Class / Tutoring: {weakest subject}`; Attendance→`Counseling / Check-in`; Fee→`Financial Aid Referral`; Backlogs→`Academic Support`; Engagement→`Counseling / Check-in`; none→`Monitor`. `getActionTypeForSuggestion` (`:243-254`) maps wording→`ActionType`; `Monitor`→`'Other'` deliberately.

**Verdict:** arithmetic is correct except the **85% boundary discontinuity** (new finding) and the README "30+" wording.

---

## A6. Upload pipeline per type (`app/providers.tsx:127-393`)

Common steps: server-confirm each affected student (`:147-161`), base map (`:163`), snapshot before mutate (`:178-189`), per-type merge, recompute risk, optimistic state, fire-and-forget sync.

| Type | Required columns (client validation) | Merge behaviour | Line refs |
|---|---|---|---|
| `WeeklyAttendance` | `studentId`, `attendance` | week from CSV `week` col else UI label; parse `*_attendance` subject cols; merge subjects into the week; **filter mock history via `isUploaded`**; upsert week; mirror subjects to `subjectAttendance`; recompute | `:198-270`, `DashboardView.tsx:167-176` |
| `UnitTest1`/`UnitTest2` | `studentId`, `score` | replace matching `termTests` by normalized name; recompute | `:271-297` |
| `FeeStatus` | `studentId`, `feeStatus`, `overdueDays` | set `feeOverdueDays`, `feeStatus`; recompute | `:298-314` |
| `Backlogs` | `studentId`, `backlogCount` | split `backlogSubjects` on `,`/`;`; set count+subjects; recompute | `:315-331` |
| `LastSemResult` | `studentId`, `score`/`marks` | set `lastSemResult` | `:332-337` |
| `EndSemResult` | `studentId`, `score`/`marks`, `status` | `{status:'Upcoming'}` or `{score,maxMarks,status:'Completed'}` | `:338-347` |

**Week label normalization** (`providers.tsx:16-22`):
```ts
function getWeekFromRow(row: any): string | null {
  const raw = getField(row, 'week');
  const v = String(raw ?? '').trim();
  if (!v) return null;
  return /^\d+$/.test(v) ? `Week ${v}` : v; // "2" -> "Week 2"
}
```
Only bare digits are normalized; `"week 2"` vs `"Week 2"` remain distinct (case-sensitive comparison at `:237`).

**Snapshot logic** (`:178-189`): existing student → `buildSnapshot`; non-existing → new stub + `snapshots[sid]=null` (means "created by this upload").

**The `isUploaded` filter** (`:231-243`) is documented in C-02 (root cause of the one-week graph).

**Overwrite branch is dead:** `overwrite` is only ever passed `false` (`DashboardView.tsx:166`), so `providers.tsx:203-207` never executes (**C-15**).

**Whole-cache write:** `Object.values(newDetails)` at `:368` is `{...detailsMap, ...serverConfirm.confirmed}` — the entire client cache, not just affected students (**C-08**).

---

## A7. Intervention and outcome logic

- **Assign:** `createIntervention(payload, baselineRiskScore)` (`lib/db.ts:140-198`) writes to four places: the intervention log (`:154`), the student summary status (`:158`), the student detail `activeIntervention` (`:172-175`), and the status + outcome stores (`:178-195`). The log record's status is **hard-coded `'Active'`** (`:151`) regardless of payload.
- **Baseline freeze:** `ensureBaseline` (`:207-228`) returns the stored baseline or freezes the current score **once** for legacy records.
- **Resolve/Reopen:** `resolveIntervention`/`reopenIntervention` (`:230-246`) call `setInterventionStatus` (`:255-268`) which flips status on summary, detail (incl. `activeIntervention`), student store and cached outcome.
- **Outcome classification:** `getOutcome` (`:270-346`): `scoreDelta < -2 → Improving`, `> +2 → Worsening`, else `No Change`; baseline never re-derived; synthesizes a record for legacy interventions.
- **Where stored:** all four in **memory only**; only the student doc (`interventionStatus`, `activeIntervention`) also reaches Mongo via `PATCH /api/students/[id]`. Interventions/outcomes have **no Mongo persistence** (**C-01, C-12**).

**`__awaiting__` is effectively unreachable:** `getOutcome` sets `hasNewData=true` whenever `attendanceHistory.length > 0` (`lib/db.ts:324-327`), which is true for every seeded student and any attendance upload; the same is true in `outcome/page.tsx` `buildOutcomeData`. So the "Awaiting New Data" state almost never renders (**C-16**).

---

## A8. Charts and week handling

- **`StudentDetailView.tsx:371`** badge is hard-coded `/4`:
  ```tsx
  {student.attendanceHistory.length}/4 Weeks
  ```
- **`StudentDetailView.tsx:378-389`** sorts by parsed week number but then **re-labels by index**, discarding the real week:
  ```tsx
  .map((item, idx) => ({ ...item, displayWeek: `Week ${idx + 1}` }))
  xKey="displayWeek"
  ```
- **`TrendChart.tsx:83-93`** pads to a **hard-coded** four weeks:
  ```ts
  const isWeeklyAttendance = xKey === 'displayWeek' || xKey === 'week';
  const ALL_WEEKS = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  return ALL_WEEKS.map((weekLabel) => {
    const existing = sortedData.find((d) => String(d[xKey]) === weekLabel);
    return existing ?? { [xKey]: weekLabel, [yKey]: null };
  });
  ```
  Weeks outside 1–4 (e.g. `Week 5`) are excluded from the chart entirely.
- **`AttendanceChart.tsx`** supports per-subject lines but is **never imported** anywhere (dead component, **C-14**).
- **Badge vs axis mismatch:** the badge counts raw `attendanceHistory` entries while the axis is built from index labels + the fixed pad, so they can disagree.

---

## A9. API reference

| Route | Method | Backend | Request | Response | Error handling |
|---|---|---|---|---|---|
| `/api/students` | GET | **Mongo if non-empty, else memory** (`:8-28`) | — | `StudentSummary[]` | try/catch → falls back to memory |
| `/api/students` | POST | both (`:39-60`) | `StudentDetail[]` | `{success,count}` | 400 non-array; Mongo errors warned |
| `/api/students` | DELETE | both (`:70-76`) | — | `{success}` | Mongo errors warned |
| `/api/students/[id]` | GET | Mongo-if-found else memory (`:13-27`) | — | `{student}` | 404 if absent; 500 on throw |
| `/api/students/[id]` | DELETE | both (`:44-58`) | — | `{success,studentId}` | Mongo errors warned |
| `/api/students/[id]` | PATCH | both (`:65-100`) | partial `StudentDetail` | `{success,student}` | `runValidators:true` can reject enums |
| `/api/history` | GET | Mongo if non-empty else memory (`:8-19`) | — | `UploadLog[]` | falls back to memory |
| `/api/history` | POST | both (`:26-41`) | `UploadLog`-ish | `{success,record}` | Mongo errors warned |
| `/api/history` | DELETE | both (`:43-107`) | `?id=` or `?uploadedAt=` | `{success,revertedStudentIds,removedStudentIds}` | reverts then deletes |
| `/api/interventions` | GET | **memory only** (`:9`) | — | `{interventions,count}` | — |
| `/api/interventions` | POST | **memory only** (`:34`) | `MentorActionPayload` | 201 `{success,intervention,baselineRiskScore}` | 400 missing fields; **404 if memory lacks student** |
| `/api/interventions` | DELETE | memory + Mongo Outcome (`:51-58`) | — | `{success}` | — |
| `/api/interventions/[id]` | PATCH | **memory only** (`:35`) | `{status?}` | `{success,status,outcome}` | defaults to Resolved |
| `/api/outcomes/[id]` | GET | **memory only** (`:7`) | — | `{outcome}` | 404 if no intervention |
| `/api/groq/explain` | POST | Groq + Mongo/memory persist | `{mode,...}` | `{text,model,powered}` or `{text,fallback,error}` | always 200 except 400 invalid mode/JSON |

**No route performs authentication** (**C-17**).

---

## A10. AI layer (Groq) — `app/api/groq/explain/route.ts`

- **Endpoints/models:** `PRIMARY_MODEL = 'qwen/qwen3.8-27b'` (`:8`), `FALLBACK_MODEL = 'openai/gpt-oss-20b'` (`:9`). README claims the fallback is `llama-3.3-70b-versatile` (`README.md:106,258`) — **CONFIRMED README/code mismatch** (**C-04**).
- **Modes:** `explain` (220 max tokens), `rationale` (80), `temperature 0.4`; invalid mode → 400.
- **Rate limits:** `RATE_LIMIT_COOLDOWN_MS = 60_000`, wait budget 6 s, max wait 2.5 s, 2 retries; reads `retry-after`/`x-ratelimit-reset-tokens`. Primary cooldown skips the exhausted model (`:256-266`).
- **Reasoning models:** `openai/gpt-oss` may return empty content; the route retries with `reasoning_effort:'low'` and strips ` thinking…</think>`.
- **Fallback:** on missing key / any error / empty output, returns deterministic text with 200 and `fallback:true` — never 500.
- **Persisted:** on a powered `explain` with `studentId`, writes `aiExplanation` to Mongo if connected, else memory (`:294-311`).

---

## A11. Security review

| Topic | Finding | Evidence | Label |
|---|---|---|---|
| Secrets | `GROQ_API_KEY` and `MONGODB_URI` read only via `process.env` in server routes; never in `next.config` `env` block | `groq/route.ts:58,175`; `dbConnect.ts:5`; `next.config.ts` comment | CONFIRMED (good) |
| Secrets in git | `.env*` ignored, only `.env.example` tracked | `.gitignore` lines; `git ls-files` | CONFIRMED (good) |
| Mentor password | Hard-coded in a client component, shipped to every browser | `LoginView.tsx:24` `const MENTOR_PASSWORD = 'sentinel123';`; `:37` | CONFIRMED |
| Student login | Any existing student ID logs in, no password | `LoginView.tsx:44-57` (lookup then `onLogin`) | CONFIRMED |
| API auth | No route verifies identity/role; any client can read/write/delete all data | all `app/api/**/route.ts` | CONFIRMED |
| Session | Client-only, `localStorage['ea_authUser']`, trivially forged | `providers.tsx` login/logout | CONFIRMED |
| NoSQL operator injection | `POST /api/students` builds Mongo filters from **request body** fields | `students/route.ts:49-52` `filter: { studentId: student.studentId }` | CONFIRMED (potential) |
| Input validation | Only client-side column checks; server trusts bodies | `DashboardView.tsx:161-186`; routes | CONFIRMED |
| Prompt injection | Student `name`/factors are interpolated into the LLM prompt | `groq/route.ts` prompt build | SUSPECTED (low impact) |
| Enum rejection | `Referred`/`Notified` statuses violate schema enums with `runValidators` → Mongo write fails | `models.ts:11,58`; `providers.tsx:538-556` | CONFIRMED |

---

## A12. Test coverage and verification results

**Commands run (read-only):**

```
$ npx tsc --noEmit
(no output)                         → exit 0, clean

$ npm test
ℹ tests 49   ℹ pass 42   ℹ skip 7   ℹ fail 0   ℹ duration_ms ~2532
```

Per-file test counts (`grep -c "^test("`): `riskEngine` 26, `groq` 10 (3 unit run + 7 live skipped), `interventionLifecycle` 6, `dbRevert` 4, `resetAll` 3 = **49**.

**README/code mismatch (CONFIRMED):** `README.md:260,309` claim **"41 tests"** and **"41 passing, 0 skipped, 0 failing"**; actual is 49 total / 42 passed / **7 skipped**.

**What the tests DO cover:** risk-engine tiers, interpolation, name normalization, UT2-only, boundaries 30/31/60/61, fallback text; intervention baseline freeze + legacy repair + resolve/reopen; upload revert (snapshot/created/legacy/bystander); full reset; Groq mocked 429-retry and no-key fallback.

**What they do NOT cover:**
- Mongo read/write paths at all (no test ever sets `MONGODB_URI`).
- Multi-instance/`globalThis` divergence and cold-start re-seed.
- Upload **across a reload** (the `isUploaded`-stripped scenario).
- `getOutcome`'s `__awaiting__` branch.
- Enum rejections for `Referred`/`Notified`.
- Charts/week-labelling (`TrendChart`/`StudentDetailView`).
- API routes' HTTP status codes and error branches (except Groq).

---

# Part B — SOP

## B1. Local setup

1. **Install dependencies.** Run `npm install`. Expected: completes; `node_modules/` present.
2. **Create env file.** Copy `.env.example` to `.env.local`. Set `GROQ_API_KEY` (optional), `MONGODB_URI` (optional), `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
3. **Start the dev server.** `npm run dev` (Turbopack on port 3000, host `0.0.0.0`). Expected: "ready" and the app at `http://localhost:3000`.
4. **Verify typecheck.** `npx tsc --noEmit`. Expected: no output / exit 0 (matches this run).
5. **Run tests.** `npm test`. Expected: 42 pass, 7 skipped (Groq live tests skip when no server/key), 0 fail.
6. **Two modes:**
   - **Without MongoDB** (`MONGODB_URI` unset): app runs; data resets on every server restart. Failure sign: after a restart the dashboard shows the original 50 students.
   - **With MongoDB:** ensure Atlas Network Access allows your IP; data persists across restarts. Failure sign: console log "MongoDB not connected, using in-memory store".

## B2. Deploying to Vercel with MongoDB Atlas

1. **Create the Atlas cluster and DB user**, then copy the SRV connection string.
2. **Atlas → Network Access → Add IP Address.** For Vercel serverless (dynamic egress IPs) add `0.0.0.0/0` (restrict by user password and TLS). Expected: connection not blocked.
3. **Vercel → Project → Settings → Environment Variables.** Add `GROQ_API_KEY`, `MONGODB_URI` (include `/sentinel` DB name), `NEXT_PUBLIC_APP_URL`. Apply to Production/Preview/Development.
4. **Deploy** (`next build` with `output: 'standalone'`).
5. **Verify DB connection.** Open a URL that triggers a route reading Mongo (e.g. load the dashboard → `GET /api/students`), then check Vercel Function logs for absence of "MongoDB not connected". In Atlas → Data Explorer, confirm the `students` collection has documents after an upload. Failure signs: logs show the fallback message or `serverSelectionTimeoutMS` errors; Atlas shows no writes. **Caveat:** due to C-01/C-09/C-11 a successful connect does not guarantee reads == writes.
6. **Cold-start caveat:** because state is per-instance (`lib/db.ts:95-104`) and reads fall back to seed data when Mongo is empty, verify that the collection is non-empty for the UI to reflect the DB.

## B3. Weekly attendance upload

1. **Prepare CSV** with header: `studentId,name,department,year,attendance,week,DBMS_attendance,DS_attendance,Computational Math_attendance,Computer Network_attendance,Python Programming_attendance` (see `data/CS_Week1_merged__1_.csv`).
2. **Required columns:** `studentId`, `attendance`. `week` is read from the CSV when present (`providers.tsx:201`), else the UI week box is used.
3. **In the dashboard:** expand "Weekly Data Upload", choose **Attendance**, optionally set the week label, choose the CSV, click Upload. Expected: green "Upload successful! N records updated". Failure: red "Invalid CSV format…".
4. **Verify in the dashboard** by opening a student — attendance chart should show the uploaded week. **Known failure (C-02):** after any reload the graph may show only 1 week because `isUploaded` is stripped by Mongo.
5. **Verify in the database** (Atlas → Data Explorer → `students` → find the `studentId`): inspect `attendanceHistory`. Note: `isUploaded` will be **absent** (expected given the schema), and only weeks written since the last full reload may be present.
6. **Week-label rule:** `"2"` becomes `"Week 2"`; anything else is stored verbatim. Use one consistent casing/format (recommended `"Week N"`).

## B4. Other uploads

1. **Unit Test 1 / 2:** CSV `studentId,name,testName,score,maxMarks,date`. Choose the matching button. Verify `termTests` on the student (`Unit Test 1`/`Unit Test 2`).
2. **Backlogs:** `studentId,name,backlogCount,backlogSubjects`. Verify `backlogCount`/`backlogSubjects`.
3. **Fee Status:** `studentId,name,feeStatus,overdueDays`. Verify `feeOverdueDays`/`feeStatus`.
4. **Last Sem Result:** `studentId,name,semester,score,maxMarks,date`. Verify `lastSemResult`.
5. **End Sem Result:** `studentId,name,semester,score,maxMarks,date,status`. Verify `endSemResult`.
Expected for all: success banner and the risk score recomputed. Failure signs: column-validation errors; no score change if data matched existing values.

## B5. Reset All Data

1. Dashboard → "Reset All Data". Expected: students list empties, upload history clears, no interventions remain.
2. **What is deleted** (`providers.tsx:409-414`; `db.ts:409-434`; routes): memory students/details/interventions/statuses/outcomes/history; Mongo `Student.deleteMany`; Mongo `UploadHistory.deleteMany`; Mongo `Outcome.deleteMany`. Not deleted: nothing else exists in Mongo.
3. **What must be true afterwards:** `GET /api/students` returns `[]`; Atlas `students` collection empty; no `INT-*` records exist (they were memory-only).
4. **How to verify:** reload the dashboard (expect no students); in Atlas confirm empty collections.
5. **Known failure (C-03):** on a cold instance the seeded 50 students (and S006/S019/S022 interventions) reappear because reads fall back to re-seeded memory.

## B6. Deleting / reverting an upload

1. Dashboard → Recent Uploads → **Delete** on a row.
2. Expected: the affected students roll back to their pre-upload state; students created by that upload disappear; the log row disappears.
3. **Verify:** open an affected student — attendance/grades/backlogs match pre-upload; risk score recomputed. In Atlas, the student documents reflect the restored state.
4. Failure signs: created students remain; a seeded student's intervention reappears (C-05 path); stale risk score if the client POST and the server DELETE race.

## B7. Interventions

1. **Assign:** open a student → "Assign This Action" → fill the form → "Assign Intervention". Expected: success card with AI rationale; profile shows the plan.
2. **Track:** profile → "Track Status" / "View Interventions & Outcome". Expected: baseline vs current score.
3. **Resolve:** outcome page → "Mark as Resolved" (confirms if improvement < 10 pts). Expected: status becomes Resolved everywhere.
4. **Reopen:** outcome page → "Re-open Intervention". Expected: back to Active.
5. **Verify in DB:** check the student document's `interventionStatus` and `activeIntervention.baselineRiskScore`. **Known failure (C-13):** Financial-Aid (`Referred`) and `Notified` statuses fail Mongo enum validation; the intervention log itself is memory-only (C-01/C-12).

## B8. Student portal

1. Log in with a student ID (e.g. `S006`). Expected: a supportive view of the active plan, or "No Active Interventions" when none/`Resolved`.
2. Verify factor names are student-friendly ("Coursework performance", etc.) — mapping in `StudentFacingStatusView`.
3. Failure signs: raw factor jargon or a risk score appears (it should not); a `Resolved` plan showing as active (should be suppressed).

## B9. Troubleshooting

| Symptom | Likely cause | How to confirm | Where to look |
|---|---|---|---|
| Graph shows only one week ("1/4 Weeks") | `isUploaded` stripped by Mongo → upload wipes prior weeks | Upload W1, reload, upload W2 → only W2 remains | `providers.tsx:231-243`; `models.ts:15-22` |
| Old intervention plan reappears after reset | Stale/seeded memory record returned by `GET /api/students/[id]`; merged without clearing `activeIntervention` | Log the GET response body after reset; check Vercel instance IDs | `providers.tsx:163,193-196`; `students/[id]/route.ts:13-27` |
| Seeded students return after reset | Cold start re-seeds `mockData`; empty Mongo → memory fallback | Hit `GET /api/students` after reset in a fresh instance | `db.ts:95-104`; `students/route.ts:8-28`; `mockData.ts:421-432` |
| Intervention assign returns 404 | `getStudentDetail` is memory-only and the instance has no record | Response body `"Student … not found"` | `interventions/route.ts:23-26` |
| AI narrative shows "STRUCTURED FALLBACK" | No key / rate limit / empty model output | Check response `powered`/`error`, Vercel logs `[Groq]` | `groq/route.ts:175-300` |
| "MongoDB not connected" in logs | Bad URI / Atlas IP not allowed / cluster paused / cooldown | Vercel logs; Atlas connection test | `dbConnect.ts:35-72` |
| Write succeeded in UI but not in Atlas | Memory-only write during cooldown; or a different instance handled the read | Compare instance IDs; check logs for the fallback message | `dbConnect.ts:35-37`; `students/route.ts:43` |
| Referred/Notified intervention not saved | Enum validation rejects status | MongoDB validation warning in logs | `models.ts:11,58`; `providers.tsx:551` |

## B10. Pre-demo / pre-release checklist

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm test` shows 42 pass / 0 fail (7 skips acceptable).
- [ ] `GROQ_API_KEY` set and at least one live narrative returns `powered:true`.
- [ ] `MONGODB_URI` set; Atlas Network Access permits the deployment; `students` collection non-empty after an upload.
- [ ] Vercel function count/region reasonable; understand that memory is per-instance.
- [ ] Seed/upload exactly one week and confirm the graph does not collapse after a reload (C-02).
- [ ] Reset then re-upload and confirm no old plan returns (C-03/C-05).
- [ ] Confirm `Referred`/`Notified` behaviour if demoing financial aid (C-13).
- [ ] Confirm the student portal hides resolved plans and risk scores.
- [ ] If demoing on a platform, accept that data may reset on cold start unless Mongo is used.

---

# Part C — Error and Wrong-Logic Register

Legend: **Sev** C=Critical, H=High, M=Medium, L=Low. **St** = CONFIRMED / SUSPECTED.

| ID | Sev | Area | File:line | What is wrong | Evidence (quote) | St | Impact | Recommended fix (description) |
|---|---|---|---|---|---|---|---|---|
| C-01 | **Critical** | Mongo/schema | `lib/models.ts:15-22` | `isUploaded` is not in the schema; Mongo strict mode drops it | `attendanceHistory: [{ week: String, percentage: Number, subjects: [...] }]` (no `isUploaded`) | CONFIRMED | Breaks week accumulation after reload | Add `isUploaded: Boolean` to the subdocument schema (and include `week` typing) |
| C-02 | **Critical** | Upload | `app/providers.tsx:231-243` | When no entry has `isUploaded` (server copy), `baseHistory` becomes `[]`, so the upload replaces the whole history with one week | `const baseHistory = hasUploadedEntries ? currentHistory : currentHistory.filter(h => h.isUploaded);` | CONFIRMED | Graph collapses to "1/4 Weeks" | Persist/derive `isUploaded` server-side, or drive merge off real week labels/DB state instead of a client-only flag |
| C-03 | **Critical** | Reset / serverless | `lib/db.ts:95-104`; `mockData.ts:421-432` | `globalThis` memory is per-instance; cold start re-seeds all 50 students **and** seeded interventions S006/S019/S022 | `globalStore.__sentinelDb ?? (globalStore.__sentinelDb = { students: [...initialStudents], ... })` | CONFIRMED | Reset undone by any new instance | Move all state to a shared store (Mongo/KV); make seeding conditional on empty DB and one-time |
| C-04 | **High** | Docs/code | `README.md:106,258`; `groq/route.ts:9` | README fallback model is `llama-3.3-70b-versatile`; code uses `openai/gpt-oss-20b` | `const FALLBACK_MODEL = 'openai/gpt-oss-20b';` | CONFIRMED | Misleading docs | Update README |
| C-05 | **High** | Upload/revert | `app/providers.tsx:163,193-196` | Re-upload after reset keeps old `activeIntervention` when the server still returns a record (snapshot not null) | `if (snapshots[sid] === null) { delete existing.activeIntervention; … }` | CONFIRMED (path) | Old plan persists (symptom A) | Determine "created" from server 404/DB, and always reconcile intervention ownership on upload |
| C-06 | **High** | Mongo fallback | `app/api/students/route.ts:8-28`; `app/api/history/route.ts:8-19` | Empty Mongo returns seeded in-memory data | `if (dbStudents && dbStudents.length > 0) return ...; return NextResponse.json(getAllStudents());` | CONFIRMED | Reset appears ineffective; DB≠UI | Distinguish "DB empty" from "DB unavailable"; return empty when connected |
| C-07 | **High** | Fire-and-forget | `app/providers.tsx:369-372,386-391` | Upload POSTs are not awaited and `dataVersion` is bumped before persistence | `fetch('/api/students', {...}).catch(...)` then `setDataVersion(v => v + 1)` | CONFIRMED | Re-fetches can read stale server state | `await` the writes before bumping `dataVersion` |
| C-08 | **High** | Upload | `app/providers.tsx:163,368` | The whole client cache is POSTed, not only affected students | `const studentsArray = Object.values(newDetails);` | CONFIRMED | Overwrites unrelated cached records; heavy payloads | Send only affected students |
| C-09 | **High** | Mongo connect | `lib/dbConnect.ts:22,35-37,63` | During the 60 s cooldown writes go memory-only with no retry/queue | `if (lastFailedAt && Date.now() - lastFailedAt < COOLDOWN_MS) return false;` | CONFIRMED | Memory/Mongo divergence during outages | Queue/replay writes; surface a "degraded" state |
| C-10 | **High** | Charts | `components/TrendChart.tsx:83-93`; `views/StudentDetailView.tsx:371,378-389` | Hard-coded Week 1–4; index-based labels; `/4` badge | `const ALL_WEEKS = ['Week 1','Week 2','Week 3','Week 4'];` / `displayWeek: \`Week ${idx + 1}\`` | CONFIRMED | Weeks >4 dropped; labels wrong; badge mismatch | Derive weeks from data; use real labels; dynamic badge |
| C-11 | **High** | Storage model | `app/api/interventions/route.ts:9,34`; `interventions/[id]/route.ts:35`; `outcomes/[id]/route.ts:7` | Interventions/outcomes are memory-only | `const interventions = getAllInterventions();` (no `isDbConnected`) | CONFIRMED | Cross-instance 404s / lost plans | Add an `Intervention` model and persist; read outcome from Mongo |
| C-12 | **High** | Storage model | `app/api/interventions/route.ts:57-58` | `Outcome` model is delete-only; never written | `const { Outcome } = await import('@/lib/models'); await Outcome.deleteMany({});` | CONFIRMED | "DB" never contains outcomes | Persist outcome on create/resolve, or remove the dead model |
| C-13 | **Medium** | Schema/enum | `lib/models.ts:11,58`; `providers.tsx:538-556` | `Referred`/`Notified` violate enums with `runValidators:true` | `enum: ['None','Active','Resolved']` / `['Active','Resolved','Discontinued']` | CONFIRMED | Mongo write rejected for financial-aid/notification | Extend enums or use free string |
| C-14 | **Low** | Dead code | `components/AttendanceChart.tsx` | Never imported | `grep AttendanceChart` → no usages | CONFIRMED | Confusion | Remove or use |
| C-15 | **Low** | Dead code | `app/providers.tsx:203-207`; `DashboardView.tsx:166` | `overwrite` branch unreachable (always `false`) | `onDataUpload(data, finalWeekLabel, uploadType, uploadedFile.name, false)` | CONFIRMED | Misleading code | Remove or wire a real "overwrite" option |
| C-16 | **Medium** | Outcomes | `lib/db.ts:324-327` | `__awaiting__` never occurs (attendance always non-empty) | `if ((studentDetail.attendanceHistory ?? []).length > 0) { hasNewData = true; ... }` | CONFIRMED | "Awaiting New Data" unreachable | Base on data newer than the intervention baseline date |
| C-17 | **Critical** | Security | all `app/api/**/route.ts` | API has no authentication/authorisation | `export async function DELETE() { ... clearAllStudents(); ... }` | CONFIRMED | Anyone can read/write/delete all data | Add auth (session/JWT) + role checks |
| C-18 | **High** | Security | `views/LoginView.tsx:24,37,44-57` | Hard-coded mentor password in client bundle; student login is password-less | `const MENTOR_PASSWORD = 'sentinel123';` | CONFIRMED | Trivial bypass | Server-side auth, hashed credentials |
| C-19 | **Medium** | Security | `app/api/students/route.ts:49-52` | Mongo filter built from request body (operator injection) | `filter: { studentId: student.studentId }` | CONFIRMED (potential) | Bulk-match/overwrite | Coerce to string; validate id format |
| C-20 | **Medium** | Risk engine | `lib/riskEngine.ts:89-97` | Discontinuity at the 85% boundary (≈8→0) and 12 > 8 non-monotonic drop value | `} else if (latest < 85) { pts = lerp(20, 8, ...) } else { ... }` | CONFIRMED | Non-smooth scoring at 85% | Interpolate across the 85 boundary |
| C-21 | **Low** | Docs/code | `README.md:260,309` | README claims 41 tests / 0 skipped; actual 49 / 42 pass / 7 skip | `41 passing, 0 skipped, 0 failing` | CONFIRMED | Misleading | Update README |
| C-22 | **Low** | Docs/code | `README.md:406-411` | README lists non-existent data files | `CS_Week1_overall.csv`, `CS_UnitTest2.csv` | CONFIRMED | Confusion | Update paths (`CS_Week1_merged__1_.csv`, `CS_UnitTest2_updated (1).csv`) |
| C-23 | **Low** | Docs/code | `README.md` vs `riskEngine.ts:195-202` | README says fee "30+" → 15; code is `>30` | `if (overdueDays > 30) pts = 15; ... if (overdueDays > 10) pts = 12;` | CONFIRMED | Boundary wording | Fix README or boundary |
| C-24 | **Low** | Build/deps | `package.json` | `motion` dependency unused | `grep motion` → no imports | CONFIRMED | Bloat | Remove |
| C-25 | **Low** | API | `app/api/students/route.ts:2` etc. | Unused default `dbConnect` imports; `metadata.json` claims Gemini | `import dbConnect, { isDbConnected }` | CONFIRMED | Noise | Clean up |
| C-26 | **Medium** | Consistency | `app/providers.tsx:459-474`; `app/api/history/route.ts:69-89` | Revert runs on both client and server (duplicate logic) | client POSTs restored students, then server `revertUpload(record)` | CONFIRMED | Redundant writes; race risk | Make one layer authoritative |
| C-27 | **Medium** | Data quality | `providers.tsx:257,277,292,308`; `uploadRevert.ts:59` | `submissionRate` guessed (45/70) when missing | `existing.submissionRate ?? (… 'Low Engagement' ? 45 : 70)` | CONFIRMED | Engagement factor can be wrong | Require/persist `submissionRate` |
| C-28 | **Low** | Upload | `providers.tsx:16-22` | Week labels not case-normalized → duplicate weeks | `return /^\d+$/.test(v) ? \`Week ${v}\` : v;` | CONFIRMED | Duplicate/missing weeks | Normalize week labels |
| C-29 | **Low** | HTTP | `app/api/history/route.ts` DELETE (no id/uploadedAt) | Deleting history with no params wipes **all** history silently | `else { state.history.length = 0; }` | CONFIRMED | Accidental total history loss | Require an explicit flag |

**Status of the user-listed known problems:** `isUploaded` missing — **STILL PRESENT** (C-01). `notificationLog` missing — **STILL PRESENT** (see A4). `globalThis` + cold-start re-seed of S006/S019/S022 — **STILL PRESENT** (C-03). Empty-Mongo fallback — **STILL PRESENT** (C-06). Interventions/outcomes memory-only — **STILL PRESENT** (C-11/C-12). Re-upload retaining old plan — **STILL PRESENT** (C-05). Un-awaited uploads + early `dataVersion` — **STILL PRESENT** (C-07). Whole-cache POST — **STILL PRESENT** (C-08). Cooldown memory-only writes — **STILL PRESENT** (C-09). Hard-coded Week 1–4 / index labels / badge — **STILL PRESENT** (C-10, C-28). `submissionRate` heuristic — **STILL PRESENT** (C-27).

---

# Part D — Summary

## Overall health rating

**Rating: 4/10 — Functional demo, not production-safe.**

Justification: the deterministic risk engine is genuinely well-built and well-tested (arithmetic correct, smooth interpolation except one boundary, strong unit tests). The UI is complete and the AI fallback strategy is robust. However, the persistence layer is fundamentally unsound for serverless: the app mixes a per-instance `globalThis` store with Mongo, applies a "non-empty Mongo wins, else seed the mock data" rule, stores interventions/outcomes only in memory, and persists a schema that silently strips a field the upload logic depends on. There is no authentication on any API route and credentials are hard-coded client-side. `tsc` is clean and `npm test` is green (42 pass / 7 skip), but the test suite never exercises Mongo, multi-instance, or reload-between-uploads behaviour — precisely where the observed symptoms live.

## Top 10 issues (severity × likelihood)

1. **C-01 + C-02** — `isUploaded` stripped by Mongo, collapsing uploaded weeks to one. *Very likely the symptom you saw.*
2. **C-03** — per-instance `globalThis` + cold-start re-seed of seeded interventions/students.
3. **C-05** — re-upload after reset retains the old `activeIntervention`.
4. **C-06** — empty-Mongo fallback to seed data (reset looks ineffective; UI ≠ DB).
5. **C-11 + C-12** — interventions/outcomes memory-only; `Outcome` never written.
6. **C-17 + C-18** — no API auth; hard-coded mentor password; password-less student login.
7. **C-09** — Mongo cooldown → memory-only writes with no retry.
8. **C-07 + C-08** — un-awaited writes + whole-cache POST; stale reads.
9. **C-10** — hard-coded Week 1–4 / index labels / badge mismatch.
10. **C-13 + C-16** — enum-rejected `Referred`/`Notified`; unreachable "Awaiting New Data".

## Recommended fix order (with dependencies)

1. **Persist `isUploaded`** (C-01) → enables **sound week merging** (C-02). *Foundational; unblocks the graph bug.*
2. **Make DB the source of truth** for students (C-06) and **persist interventions/outcomes** (C-11/C-12). *Must precede reliable reset (C-03) and re-upload (C-05).*
3. **Fix reset/re-seed semantics** (C-03) — seed only when the DB is genuinely empty, and never re-seed interventions.
4. **Fix re-upload reconciliation** (C-05) — depends on 2 and 3.
5. **Await writes before `dataVersion++`; POST only affected students** (C-07/C-08) — depends on 2.
6. **Handle cooldown with a replay queue** (C-09) — depends on 2.
7. **Add API authentication + server-side auth** (C-17/C-18) — can start in parallel but should gate release.
8. **Charts/week handling** (C-10/C-28) — independent.
9. **Enum/validation fixes** (C-13), `__awaiting__` (C-16), `submissionRate` (C-27) — independent.
10. **Docs + dead code/deps + HTTP hygiene** (C-04/C-14/C-15/C-21–C-25/C-29) — last.

## Questions I could not answer from the code alone (and the evidence needed)

1. **Is `MONGODB_URI` set and reachable in production?** — Vercel env var list + function logs (`"MongoDB not connected"` presence/absence).
2. **How many Vercel instances serve this app, and is state shared?** — Vercel logs with instance IDs, and whether the same instance handles DELETE and the next GET.
3. **Did the observed "old plan" come from seed data or a user-created plan?** — Atlas screenshot of the student doc (`activeIntervention`, `baselineRiskScore`) after reset.
4. **What exactly is in `attendanceHistory` in Atlas after two weekly uploads?** — Atlas Data Explorer document screenshot showing `isUploaded` absent and week count.
5. **Was `isUploaded` ever persisted?** — not answerable from code; check an existing Atlas document (it cannot contain the field under this schema).
6. **Does `POST /api/students` actually receive the whole cohort?** — browser Network tab payload size/contents for the upload POST.
7. **Are `Referred`/`Notified` statuses actually failing in production?** — Mongo validation warning in Vercel logs when assigning financial aid / notifying a parent.
8. **Does any environment override Mongoose strict mode?** — no override found in code; confirm no external `mongoose.set('strict', false)` or raw driver writes.

*End of report. No source, config, test, or data files were modified; the only file created is this document.*
