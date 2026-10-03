# Sentinel — Full Codebase & Logic Report

**Project:** Sentinel — Predictive Student Dropout Detection & Intervention System
**Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Recharts · Papaparse · Mongoose/MongoDB (optional) · Groq AI
**Report type:** Read-only structural + logic reference. No source files were modified.
**Date:** October 1, 2026

> This report documents every source, config, test and data file in the project: what it contains, the UI logic it renders, and the business logic it implements. A dedicated section at the end covers all MongoDB logic in depth.

---

## 1. Executive Summary

Sentinel is a full-stack web app that helps college mentors find and act on students at risk of dropping out.

The defining architectural decision is the **split between two layers that never mix**:

1. **A deterministic risk engine** (`lib/riskEngine.ts`) — pure TypeScript, no ML, no randomness, no network. It turns raw student data into a 0–100 risk score from five weighted factors and is fully auditable.
2. **A Groq AI layer** (`app/api/groq/explain/route.ts`) — used *only* to translate those numbers into human-readable prose. It never influences the score. If there is no API key or the API fails, a deterministic fallback text is generated so the UI never breaks.

Persistence follows the same philosophy: an **in-memory store is always authoritative and zero-config**, while **MongoDB is an optional mirror** that is used only when `MONGODB_URI` is set and reachable. Every API route tries Mongo first and silently falls back to memory.

There are **three user surfaces**:
- **Mentor dashboard** — cohort list, filters, CSV uploads, upload history with snapshot-based undo.
- **Student detail + intervention + outcome** — risk breakdown, AI narrative, intervention assignment, before/after comparison.
- **Student portal** — a supportive, score-free view of the student's own active support plan.

---

## 2. Directory Tree (source only)

```
sentinel/
├── app/                              # Next.js App Router (routes + API)
│   ├── layout.tsx                    # Root layout, providers, header, fetch patch
│   ├── page.tsx                      # Login route (redirects by role)
│   ├── providers.tsx                 # ★ Global client state + all mutation logic
│   ├── globals.css                   # Tailwind import + neo-brutalist utility classes
│   ├── error.tsx                     # Route-level error boundary
│   ├── global-error.tsx              # Root error boundary
│   ├── not-found.tsx                 # 404 page
│   ├── dashboard/
│   │   ├── page.tsx                  # Mentor dashboard route
│   │   └── student/[id]/
│   │       ├── page.tsx              # Student detail route
│   │       ├── action/page.tsx       # Intervention assignment route
│   │       └── outcome/page.tsx      # Outcome comparison route
│   ├── student/page.tsx              # Student self-view route
│   └── api/
│       ├── students/route.ts         # GET/POST/DELETE student collection
│       ├── students/[id]/route.ts    # GET/DELETE/PATCH one student
│       ├── history/route.ts          # GET/POST/DELETE upload logs (+revert)
│       ├── interventions/route.ts    # GET/POST/DELETE interventions
│       ├── interventions/[id]/route.ts # PATCH resolve/reopen
│       ├── outcomes/[id]/route.ts    # GET outcome comparison
│       └── groq/explain/route.ts     # ★ Groq AI proxy (explain + rationale)
├── components/                       # Presentational / reusable UI
│   ├── Header.tsx
│   ├── RiskBadge.tsx
│   ├── InterventionStatusBadge.tsx
│   ├── StudentCard.tsx
│   ├── StudentTableRow.tsx
│   ├── FactorBreakdownList.tsx
│   ├── TrendChart.tsx
│   └── AttendanceChart.tsx
├── views/                            # Major screens (composed into routes)
│   ├── LoginView.tsx
│   ├── DashboardView.tsx
│   ├── StudentDetailView.tsx
│   ├── MentorActionPanel.tsx
│   ├── OutcomeComparisonView.tsx
│   └── StudentFacingStatusView.tsx
├── lib/                              # Core logic, types, data, DB
│   ├── riskEngine.ts                 # ★ Deterministic scoring + fallback text
│   ├── types.ts                      # Shared TypeScript contracts
│   ├── db.ts                         # ★ In-memory store + lifecycle + revert
│   ├── dbConnect.ts                  # Mongo connection helper (fail-fast)
│   ├── models.ts                     # Mongoose schemas
│   ├── mockData.ts                   # 50 seeded students + seeded interventions
│   └── uploadRevert.ts               # Shared pure upload-revert planner
├── tests/                            # Node built-in test runner suite
│   ├── riskEngine.test.ts
│   ├── interventionLifecycle.test.ts
│   ├── dbRevert.test.ts
│   ├── resetAll.test.ts
│   ├── groq.test.ts
│   ├── ts-register.mjs
│   └── ts-resolve-hooks.mjs
├── data/                             # Raw demo CSV files
│   ├── CS_Week{1..4}_merged__1_.csv # Overall + per-subject attendance
│   ├── CS_UnitTest1.csv
│   ├── CS_UnitTest2_updated (1).csv
│   ├── CS_Backlogs.csv
│   ├── CS_FeeStatus.csv
│   ├── CS_EndSem.csv
│   └── CS_LastSemResult.csv
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
├── package.json
└── .env.example
```

---

## 3. Root Configuration Files

### `package.json`
Project name is **`sentinel`**, `"type": "module"` (ESM throughout).

- **Scripts**
  - `dev` → `next dev --turbo -p 3000 -H 0.0.0.0` (Turbopack, binds all interfaces).
  - `build` → `next build`.
  - `start` → `next start -p 3000 -H 0.0.0.0`.
  - `lint` → `next lint`.
  - `test` → `node --import ./tests/ts-register.mjs --test tests/*.test.ts` (native Node test runner, no Jest/Vitest).
- **Runtime deps:** `next` 15, `react`/`react-dom` 19, `mongoose` 8, `motion` (animation), `lucide-react` (icons), `papaparse` (CSV), `recharts` (charts).
- **Dev deps:** `typescript` ~5.8, `tailwindcss` v4 + `@tailwindcss/postcss`, `@types/*`.

### `tsconfig.json`
- `target` ES2022, `module` ESNext, `moduleResolution` bundler, `strict: true`.
- **Path alias:** `@/*` → `./*` (root-relative imports, e.g. `@/lib/riskEngine`).
- `noEmit`, `allowImportingTsExtensions`, `jsx: preserve`, `isolatedModules`.
- Includes `.next/types` and `.next/dev/types` for Next-generated route types.

### `next.config.ts`
- `reactStrictMode: true`, `output: 'standalone'` (self-contained server bundle).
- `eslint.ignoreDuringBuilds: true`.
- `turbopack.root` is pinned to `__dirname` to avoid false workspace-root detection caused by a stray lockfile in a parent directory.
- **Security note encoded in a comment:** the config deliberately does *not* put secrets in an `env` block, because that block is exposed to the client bundle. Server-only secrets (`GROQ_API_KEY`, `MONGODB_URI`) are read via `process.env` inside API routes only.

### `postcss.config.mjs`
Registers the single PostCSS plugin `@tailwindcss/postcss` (Tailwind v4 pipeline).

### `.env.example`
```env
GROQ_API_KEY=        # AI narratives (optional — falls back to deterministic text)
MONGODB_URI=         # Optional — enables persistent storage
NEXT_PUBLIC_APP_URL= # App URL
```
The real `.env` / `.env.local` are git-ignored and hold actual secrets (not documented here).

### `metadata.json`
App manifest: name **Sentinel**, description, and capability flag `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` (a leftover platform capability marker; the app actually uses Groq server-side).

---

## 4. `app/` — Routing Layer

### `app/layout.tsx` — Root Layout
Server component that wraps every page.

- Sets `metadata` (title/description).
- Imports global CSS.
- **Injects an inline `<script>` (`sentinel-fetch-fix`)** into `<head>`. This script defensively redefines `window.fetch` and `Window.prototype.fetch` with getter/setter descriptors. Its purpose is to prevent browser extensions (e.g. Bitdefender injecting `bis_skin_checked`) from breaking `fetch`. It's wrapped in `try/catch` and does nothing on the server.
- Loads the **Public Sans** font from Google Fonts via `<link>` preconnects.
- `<html>` and `<body>` both carry `suppressHydrationWarning` (suppresses mismatches from extension-injected attributes).
- Body is styled with the app's paper background `#F5F1E8` and near-black text `#0D0D0D`.
- Renders `<SentinelProvider>` → `<Header />` → `<main>{children}</main>`.

### `app/page.tsx` — Login route (`/`)
- Client component. Reads `authUser`, `students`, `login` from `useSentinel()`.
- **Logic:** if a user is already authenticated, `useEffect` redirects mentors to `/dashboard` and students to `/student`, and returns `null` meanwhile to avoid flashing the login screen.
- Otherwise renders `<LoginView>` with `students` mapped down to `{ studentId, name }`.

### `app/providers.tsx` — Global State (the heart of the client)
Client component exporting `SentinelProvider` and the `useSentinel()` hook. This is where **almost all mutation/business logic on the client lives**. It owns:

State: `authUser`, `role`, `students` (summaries), `uploadHistory`, `detailsMap` (full records by id), `dataVersion` (a cache-busting counter), `isResetting`, `isClient`.

**Helper functions**
- `getField(row, name)` — case/whitespace-insensitive CSV column lookup.
- `getWeekFromRow(row)` — reads the CSV `week` column, normalizes `"2"` → `"Week 2"`, returns `null` if absent (so the UI week box is only a fallback).
- `refreshFromServer()` — re-reads `/api/students` + `/api/history`.

**On mount**
- Restores `authUser` from `localStorage` (`ea_authUser`).
- Fetches `/api/history` and `/api/students` to hydrate state.

**Auth:** `login(user)` sets state + persists to localStorage; `logout()` clears both.

**`fetchStudentDetail(id, {force})`** — returns the cached detail unless `force`, otherwise fetches `/api/students/[id]`, caches into `detailsMap`, returns the record.

**`handleDataUpload(parsedData, weekLabel, uploadType, fileName, overwrite)`** — the upload pipeline:
1. Collects affected student ids from rows.
2. **Server confirmation step:** for every affected id it GETs `/api/students/[id]` to (a) avoid overwriting an unseen student with an empty stub and (b) distinguish a student the server has "never seen" (404 → treat as new) from one still in cache.
3. Builds `snapshots[sid]` via `buildSnapshot()` **before** mutating — if the student didn't exist, `snapshots[sid] = null` (a sentinel meaning "created by this upload").
4. Per **upload type** applies different merge logic:
   - **WeeklyAttendance:** parses `attendance`; reads subject columns (any key ending `_attendance`); merges subject breakdown into the matching week; **filters out mock history** unless it has `isUploaded: true`; upserts the week by label; also mirrors the latest subjects into top-level `subjectAttendance`. Recomputes risk.
   - **UnitTest1 / UnitTest2:** replaces the matching `termTests` entry by normalized name; recomputes risk.
   - **FeeStatus:** sets `feeOverdueDays` + `feeStatus`; recomputes risk.
   - **Backlogs:** parses count + split subjects on `,`/`;`; recomputes risk.
   - **LastSemResult:** stores `{ score, maxMarks }`.
   - **EndSemResult:** stores `{ status: 'Upcoming' }` or `{ score, maxMarks, status: 'Completed' }`.
5. Every risk recomputation builds a `RawStudentData` object and calls `computeRiskScore()` + `generateFallbackExplanation()`. A quirk worth noting: `submissionRate` falls back to `45` if the student already had a Low Engagement factor, else `70`.
6. Updates `detailsMap` and `students` (functional updates to dodge stale closures); sorts summaries by descending risk.
7. **Fire-and-forget** POSTs to `/api/students` (bulk upsert) and `/api/history` (log + snapshots), then bumps `dataVersion`.
8. Returns `{ success, updatedCount, skippedCount }`.

**`handleClearAllData()`** — "Reset All Data":
- Optimistically clears client state, then `await`s DELETE on `/api/students`, `/api/history`, `/api/interventions` in parallel.
- Re-reads from the server (so the UI reflects exactly what survived), bumps `dataVersion`, clears `isResetting`.

**`handleDeleteUpload(uploadedAt)`** — snapshot-based undo:
1. Finds the log; loads any affected student not already cached from the server.
2. Calls the **shared pure** `planUploadRevert(log, details)` to compute which records to restore and which to remove.
3. POSTs restored records to `/api/students`; DELETEs created students via `/api/students/[id]`.
4. DELETEs the log via `/api/history?uploadedAt=...`.
5. Clears the detail cache, re-fetches students, filters history locally, bumps `dataVersion`.

**`handleInterventionAssigned(payload)`**
- If `status === 'Notified'` (Parent/Guardian Notified) it is treated as a log-only event → PATCH student with `notificationLog` and returns.
- Otherwise POSTs `/api/interventions` passing `baselineRiskScore` = the **client's current visible score** (guards against server staleness after fire-and-forget uploads). The server's returned baseline is preferred.
- Updates `students` + `detailsMap` optimistically with a new `activeIntervention`, then PATCHes `/api/students/[id]` to persist `interventionStatus` + `activeIntervention`.

**`handleResolveIntervention` / `handleReopenIntervention`**
- Optimistically flip status in `students` and `detailsMap`.
- PATCH `/api/interventions/[id]` with `{status}` **and** PATCH `/api/students/[id]` to keep the record and its `activeIntervention` in sync. This dual-write is what makes the profile, outcome page and student portal all agree.

Finally, the provider renders nothing until `isClient` is true (avoids SSR/localStorage hydration issues), then supplies the context. `useSentinel()` throws if used outside the provider.

### `app/globals.css`
- `@import "tailwindcss"`.
- Base `body` font stack (Public Sans) + brand colors.
- **Neo-brutalist utility classes:** `.neo-card` (3px black border, 5px hard shadow, 0 radius), `.neo-card-sm`, `.neo-btn` (with hover/active press transform), `.neo-input` (white, 3px border, focus state). These define the entire visual language used across every view.

### `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`
- `error.tsx` — client error boundary; logs the error, shows a neo-card with the message and a "Try Again" button wired to `reset`.
- `global-error.tsx` — root boundary that renders its own `<html>/<body>` with inline styles (so it works even if the layout failed).
- `not-found.tsx` — static 404 page with a "Go Home" link.

### Route pages
- **`app/dashboard/page.tsx`** — guards: no user → `/`, non-mentor → `/student`. Maps `handleSelectStudent` to `/dashboard/student/{id}` and renders `<DashboardView>` with all upload handlers.
- **`app/student/page.tsx`** — guards student role (mentor → `/dashboard`); fetches the logged-in student's detail; builds a `StudentStatusData` from `detail.activeIntervention` and renders `<StudentFacingStatusView>`.
- **`app/dashboard/student/[id]/page.tsx`** — unwraps `params` with React's `use()`. Holds `fetchStudentDetail` in a **ref** because the function's identity changes every provider render (using it as an effect dep caused a fetch loop). Always `force`-reads the student on mount / whenever `dataVersion` changes; redirects to `/dashboard` if the student no longer exists (e.g. after reset). Computes `hasIntervention` and wires navigation callbacks to the action/outcome routes.
- **`app/dashboard/student/[id]/action/page.tsx`** — loads the student and renders `<MentorActionPanel>` with `handleInterventionAssigned` and navigation to outcome.
- **`app/dashboard/student/[id]/outcome/page.tsx`** — the most intricate page:
  - `buildOutcomeData(detail)` derives `baselineScore` (frozen `baselineRiskScore`), `currentScore`, `scoreDelta`, outcome classification (`Improving` if delta < −2, `Worsening` if > +2, else `No Change`) and a checkpoint date.
  - `load()` force-fetches the student, performs a **one-time baseline repair** (if `baselineRiskScore` is missing, freeze the current score and PATCH it) so a legacy record stops drifting.
  - A `useReducer` "forceLoad" trick + a status ref re-loads the record when the intervention status changes (so a resolve/reopen is reflected).
  - `handleResolve`/`handleReopen` await the mutation, wait ~350 ms for the optimistic UI, then force-fetch the truth.
  - Renders a skeleton while loading, and a "No active intervention" card when there's no outcome.

---

## 5. `app/api/` — Server Routes

All routes are thin: they try MongoDB (when connected), otherwise use the in-memory store from `lib/db.ts`. The store is shared across bundles via `globalThis`.

### `app/api/students/route.ts`
- **GET** — if DB connected, `Student.find({}, projection)` (only summary fields). **If it returns a non-empty array, use it; otherwise fall through to in-memory `getAllStudents()`.** This "Mongo non-empty wins" rule is important: an empty Mongo collection does not hide the seeded in-memory cohort.
- **POST** — expects an array. Always `bulkUpsertStudents(data)` into memory; if connected also builds `bulkWrite` `updateOne` upserts keyed by `studentId`. Returns `{success, count}`.
- **DELETE** — `clearAllStudents()` (which is `resetAllData()`), plus `Student.deleteMany({})` when connected.

### `app/api/students/[id]/route.ts`
- **GET** — Mongo `findOne({studentId:id})` first; else in-memory `getStudentDetail(id)`; 404 if absent. Returns `{ student }`.
- **DELETE** — removes from both stores (`deleteStudent`). Used by upload revert to delete created students.
- **PATCH** — applies `updateStudentRisk(id, updateData)` then `upsertStudent({...memoryStudent, ...updateData})` to fully sync memory; if connected, `findOneAndUpdate({studentId:id}, {$set: updateData}, {new:true, runValidators:true})` and returns the Mongo doc. This is used for intervention status, `activeIntervention`, `aiExplanation`, and `notificationLog`.

### `app/api/history/route.ts`
- **GET** — Mongo `UploadHistory.find({}).sort({createdAt:-1})` if non-empty, else in-memory history.
- **POST** — `addUploadHistory(data)` (generates `id` + `createdAt`) then, if connected, `UploadHistory.create(memoryRecord)` (so Mongo gets the generated id).
- **DELETE** — the server-side revert path:
  1. Finds the record in memory, or in Mongo if only there (e.g. after a restart).
  2. Calls `revertUpload(record)` (shared planner) → `{ revertedStudents, removedStudentIds }`.
  3. If connected, upserts each reverted student and `deleteMany` the removed ids.
  4. Deletes the log from memory and Mongo.
  5. Returns the reverted/removed ids.

### `app/api/interventions/route.ts`
- `export const dynamic = 'force-dynamic'`.
- **GET** — `getAllInterventions()`, returns `{interventions, count}`.
- **POST** — validates `studentId` + `type` (400 if missing); 404 if the student is unknown; computes `baselineRiskScore` = payload-supplied number if present, else the student's current `riskScore`; calls `createIntervention(payload, baseline)`; returns 201 `{success, intervention, baselineRiskScore}`.
- **DELETE** — dynamic-imports `clearAllStudents()` and (when connected) `Outcome.deleteMany({})`.

### `app/api/interventions/[id]/route.ts`
- **PATCH** — `id` is the `studentId`. Body `{status?: 'Resolved'|'Active'}`, default `Resolved`. Calls `reopenIntervention(id)` or `resolveIntervention(id)`, then returns `{success, status, outcome: getOutcome(id)}`.

### `app/api/outcomes/[id]/route.ts`
- **GET** — `getOutcome(id)`; 404 with an error message if there is no intervention (never fabricates a comparison).

### `app/api/groq/explain/route.ts` — the AI proxy (detailed)
- **Endpoint:** `https://api.groq.com/openai/v1/chat/completions`.
- **Models:** primary `qwen/qwen3.8-27b`; fallback `openai/gpt-oss-20b`.
- **Modes:** `explain` (risk narrative, `max_tokens: 220`) and `rationale` (intervention rationale, `max_tokens: 80`); `temperature: 0.4`.
- **Rate-limit strategy:** on HTTP 429 it reads `retry-after` or `x-ratelimit-reset-tokens`, waits (bounded to 2.5 s per wait, ~6 s total budget, max 2 retries) and retries rather than failing. A `primaryCooldownUntil` timestamp (60 s) makes subsequent calls skip the primary model entirely once it's exhausted.
- **Reasoning-model handling:** `gpt-oss` models may spend the whole token budget "thinking" and return empty content. The route detects empty content, retries once with `reasoning_effort: 'low'`, and strips any ` thinking... response` tags before returning.
- **Prompting:** builds a specific advisor prompt for high-risk vs healthy students; the `rationale` prompt asks for one sentence, max 30 words.
- **Response shape:** `{ text, model, powered }` on success; `{ text, fallback: true, error }` on fallback. `powered: true` means a genuine live narrative (the UI uses this to show a "GROQ · model" badge vs a "STRUCTURED FALLBACK" badge).
- **Deterministic fallback:** `buildDeterministicFallback()` composes a template sentence from name/year/department/score/factors. It is used when the key is missing, the API errors, or the response is empty — so the endpoint **never 500s and always returns 200 with usable text**.
- **Persistence:** on a successful `explain`, if `studentId` was sent, it writes `aiExplanation` back to Mongo (or the in-memory store) so the narrative survives reloads without another API call.

---

## 6. `components/` — Reusable UI

### `Header.tsx`
Global top bar. Shows the Sentinel brand + "Predictive Engine" tag, and, when logged in, the user chip (mentor icon vs graduation-cap icon, name / "Name (ID)") and a Log Out button calling `logout()`. Sticky, dark, neo-brutalist.

### `RiskBadge.tsx`
Pill showing risk level + optional `score/100`. Color mapping: High → red `#D62828`, Medium → amber `#F4C430`, Low → green `#2D9D5F`, default neutral. Three sizes. Renders an `id` (`risk-badge-{level}`) for testing.

### `InterventionStatusBadge.tsx`
Status pill with four branches: `None` ("No Action", neutral), `Active` (blue with pulsing dot), `Resolved` (green with ✓), else a generic white pill. Test-friendly ids (`intervention-badge-none/active/resolved`).

### `StudentCard.tsx`
Mobile-only card for one student: id, name, dept/year, big `riskScore/100`, risk + intervention badges, and a "View" button. Whole card is clickable → `onSelect(studentId)`.

### `StudentTableRow.tsx`
Desktop table row: id, name (+ year chip), department, numeric score + a colored mini progress bar, risk badge, intervention badge, and an "Inspect" button. Row + button both call `onSelect`.

### `FactorBreakdownList.tsx`
Table of `contributingFactors`: factor name with a color-coded square (red ≥20 pts, amber >5 and <20, neutral otherwise), a `+N pts` chip, and the diagnostic reason. Iterates `factors.map`.

### `TrendChart.tsx`
Generic Recharts `ComposedChart` used for attendance and term-test trends.
- **Sorting:** `weekSortKey()` sorts labels numerically ("Initial"→0, "Week 3"→3, unknown→999).
- **Week padding:** for weekly attendance it pads to exactly `Week 1..4`, inserting `null` for missing weeks so all labels stay visible while the line stops at the last real point.
- **Single-point handling:** with one real reading it hides the Area, draws a `ReferenceLine` at that value, and shows an explanatory caption instead of an invisible line.
- **Domain:** auto-computed min/max padded by 15% (or an explicit `yDomain`), clamped to 0–100.
- **Extras:** optional threshold reference lines (green target, red fail), gradient area fill, custom neo-brutalist tooltip, empty-state "No data uploaded yet".

### `AttendanceChart.tsx`
Subject-aware attendance chart.
- Collects all unique subjects across weeks, flattens them into top-level keys, and draws a **thick red "Overall" line** plus **thin dashed per-subject lines** with a fixed color map (`DBMS`, `Computer Network`, `Python Programming`, `Data Structures`, `Computational Math`) and a legend.
- Includes a "Min Required (75%)" reference line, custom tooltip listing every series, and an empty state. (Note: the mentor profile currently uses `TrendChart` for overall attendance; this component remains available for per-subject views.)

---

## 7. `views/` — Screen Compositions

### `LoginView.tsx`
Tabbed login (Mentor / Student).
- Exports the `AuthUser` union type used across the app.
- **Mentor:** username `mentor` (case-insensitive, trimmed) + password `sentinel123` (hard-coded `MENTOR_PASSWORD`). Wrong → error message.
- **Student:** looks up the entered ID (uppercased, trimmed) against the loaded `students` list; unknown → a helpful error (distinct message when no students are registered yet).
- UI: brand block, tab switcher, icon-prefixed inputs, password show/hide toggle, inline error box, footer.

### `DashboardView.tsx` (largest view)
The mentor cohort console.
- **Metric cards:** Monitored, High Risk, Active Plans, Avg Cohort Risk (computed with `useMemo`/reduce).
- **Upload section** (collapsible):
  - Upload-type selector grouped as Weekly / Tests / Semester / Other (`WeeklyAttendance`, `UnitTest1/2`, `LastSemResult`, `EndSemResult`, `Backlogs`, `FeeStatus`).
  - Week-label input (only for weekly attendance).
  - File picker; on Upload, **`Papa.parse`** with `header: true` parses client-side, then validates required columns per type (studentId, attendance, feeStatus+overdueDays, backlogCount) and rejects empty/invalid files.
  - Awaits `onDataUpload(...)`, shows success/error, clears the file, and auto-suggests the next week label.
  - "Reset All Data" button (disabled while resetting).
- **Upload history** grouped by week via `useMemo`; sorted descending with `Initial` last. Each row shows week/type/file/time/count/status, a "View Data" modal (raw CSV table), and a "Delete" button wired to `onDeleteUpload` (the snapshot undo).
- **Cohort table:** search across name/id/department, Dept/Year/Risk dropdowns, sort toggle. Sorting forces High-risk first when descending. Desktop table (`StudentTableRow`) vs mobile cards (`StudentCard`). Empty-state card with "Clear Filters".
- Active-filter chips with a Reset All.

### `StudentDetailView.tsx`
Full mentor view of one student.
- Header: id/dept/year chips, last-sem/this-sem result chips, name, big risk score, large `RiskBadge`.
- **Action banner** with three states: (1) has intervention → "Active/Resolved Intervention Plan" with a monitoring/resolved badge; (2) no risk factors → informational "No Action Needed" (never offers an empty intervention); (3) otherwise → the engine's `suggestedAction` with an "Assign This Action" button.
- **AI narrative box:** shows the stored `aiExplanation`; auto-fetches from `/api/groq/explain` only when there is no stored explanation (guarded by a `lastFetchedId` ref). Distinguishes "GROQ · model" vs "STRUCTURED FALLBACK" and persists only genuine Groq narratives.
- **Factor breakdown** (`FactorBreakdownList`), **attendance trajectory** and **term-test** charts (both `TrendChart`; attendance is remapped to `displayWeek`).
- Footer with a refresh date and CTA buttons.

### `MentorActionPanel.tsx`
Intervention assignment form.
- Uses `getActionTypeForSuggestion(suggestedAction)` to pre-select the action type — the engine owns the wording→type mapping so the form can't drift.
- Computes `availableSubjects` (subject attendance + backlog subjects + defaults) and a `recommendedSubject` with a reason label (`Engine Pick` / `Low Grade` / `Low Attendance`).
- **Conditional fields per action type:** Extra Class (subject/schedule/instructor), Counseling (type/schedule/counselor), Financial Aid Referral (department/fee notes → status `Referred`), Academic Support (support type/subjects), Parent/Guardian Notified (contact method → status `Notified`), Other.
- On submit: builds a `MentorActionPayload`, calls `onSubmitSuccess`, then fetches a Groq `rationale` and shows it (labeled Groq vs Structured Fallback). Success card offers "View Outcome Comparison".

### `OutcomeComparisonView.tsx`
Before/after comparison card.
- Local `optimisticResolved` override, resolved against `data.status`.
- `handleMarkResolved` warns via `window.confirm` when improvement is < 10 pts; `handleReopenIntervention` reverses it.
- Renders student header, intervention summary (icon + type + start date + outcome/awaiting badge), two score cards (Baseline vs Current with delta coloring), **type-specific detail grids** (`InterventionDetailsGrid` per action type), and lifecycle buttons. Handles the `__awaiting__` checkpoint (no new data yet).

### `StudentFacingStatusView.tsx`
Supportive student portal.
- **`STUDENT_FRIENDLY_FACTOR_MAP`** remaps internal factor names ("Grade Decline"→"Coursework performance", "Backlogs"→"Pending subjects", etc.) so students never see raw risk-model jargon. Exposes `toStudentFriendlyFactor`.
- `formatSchedule()` safely handles ISO timestamps vs free-text slots ("Mon 3:00 PM") to avoid "Invalid Date".
- `showsActivePlan` is false for `Resolved`/`Notified` interventions, which instead fall through to a neutral "No Active Interventions / Account Status: Clear" state.
- Active plan shows type-specific announcement text, assigned date, session timing, "Academic Focus Areas" (friendly factors, no numeric score), and "what to bring" guidance.

---

## 8. `lib/` — Core Logic

### `lib/types.ts` — Shared Contracts
Pure type module. Defines:
- `RiskLevel` (`Low|Medium|High`), `InterventionStatus`, `ActionType`.
- `StudentSummary`, `StudentDetail` (the full record: attendance history with optional per-subject entries, term tests, end/last-sem results, backlogs, fee fields, `submissionRate`, `aiExplanation`, `activeIntervention`…).
- `AttendanceHistoryItem` (with `subjects?`, `isUploaded?`), legacy `SubjectAttendanceItem`, `TermTestItem`, `SemesterResult`.
- `MentorActionPayload`, `StudentActiveIntervention` (carries `baselineRiskScore`), `StudentStatusData`, `OutcomeComparisonData`.
- `UploadType` union and `UploadLog` (with `rawData` + `snapshots`).

### `lib/riskEngine.ts` — Deterministic Scoring Engine
Zero dependencies, server- and client-safe. Key pieces:

- **`RawStudentData`** input shape and **`RiskResult`** output shape.
- **Helpers:** `clamp`, `lerp`, `slope` (least-squares linear regression slope over the window).
- **`scoreAttendance` (0–30)** — last 4 weeks; invalid entries filtered. Bands with **linear interpolation** (no cliffs):
  - `<60%` → 30.
  - `60–74%` → `lerp(30,20,...)`; `+8` if drop ≥15 or slope < −2 (cap 30).
  - `75–84%` → `lerp(20,8,...)`; `+10` if drop ≥15 or slope < −3 (cap 30).
  - `≥85%` → 0, but `12` for a sharp drop (drop ≥15 or slope < −4), `5` for drop ≥8.
  - Result rounded to integer; builds a human reason string with trend label.
- **`scoreTermTests` (0–25)** — name-normalized (`trim().toLowerCase()`), unrecognized names `console.warn`. `baselineTierPoints`: `<40`→25, `<55`→18, `<65`→12, `<75`→5, else 0. When **both UT1 and UT2** exist it scores UT2 then applies the delta: +15 or more → −15 pts; +5..14 → −5; −6..−14 → +5; ≤−15 → +10. UT2-only scores against baseline tiers (with a "Baseline — no UT1" reason).
- **`scoreBacklogs` (0–20)** — 0→0, 1→6, 2→13, 3→17, ≥4→20.
- **`scoreFeeOverdue` (0–15)** — 0→0, 1–10→6, 11–30→12, >30→15.
- **`scoreEngagement` (0–10)** — `<40`→10, `<55`→7, `<65`→4, `<75`→2, else 0; invalid/incomplete → 0 with an explanatory reason.
- **`getSuggestedAction(dominantFactor, student)`** — maps the dominant factor to a recommendation. For Grade Decline it picks the **weakest subject** (lowest subject attendance) and appends it after a colon.
- **`getActionTypeForSuggestion(suggestion)`** — maps recommendation wording to a concrete `ActionType`; "Monitor" deliberately falls through to `'Other'` so no empty intervention is offered.
- **`computeRiskScore(student)`** — sums the five factor scores, rounds and clamps 0–100, derives `riskLevel` (≥61 High, ≥31 Medium, else Low), builds and sorts `contributingFactors` descending, sets `dominantFactor`, resolves `suggestedAction`.
- **`generateFallbackExplanation(student, result)`** — deterministic prose when AI is unavailable. `humanizeReason()` converts internal reason strings into clean phrases; handles the no-factor "healthy" case and 1/2/3+ factor cases.

### `lib/db.ts` — In-Memory Store + Lifecycle
The authoritative, zero-config store.
- **`globalThis.__sentinelDb`** holds `{ students, details, statuses, outcomes, interventions, history }`, initialized from `mockData`. Living on `globalThis` means all route bundles and hot reloads share the *same* objects, so a mutation through one endpoint is visible through the others.
- **Interventions:** `INITIAL_INTERVENTIONS` seeds three demo records (S006 Extra Class, S019 Counseling, S022 Academic Support) with baselines from `seededBaselineScores`.
- **CRUD:** `getAllStudents`, `getStudentDetail`, `updateStudentRisk`, `getIntervention`, `getAllInterventions`, `createIntervention`, `upsertStudent`, `bulkUpsertStudents`, `deleteStudent`.
- **`createIntervention(payload, baselineRiskScore)`** writes to four places: the intervention log, the student summary status, the student detail's `activeIntervention` (with frozen baseline), and the status/outcome stores. The outcome is initialized with `currentScore` as a placeholder that `getOutcome` overwrites at read time.
- **`ensureBaseline(studentId)`** returns the stored baseline, or freezes the current score into a legacy record **exactly once**. This is the anti-drift guarantee.
- **`resolveIntervention` / `reopenIntervention`** call `setInterventionStatus`, which flips the status on the summary, the detail (including `activeIntervention`), the student-facing store, and the cached outcome — so every surface closes/opens together.
- **`getOutcome(studentId)`** returns null when there is no intervention; otherwise uses the frozen baseline, recalculates `currentScore` live, computes `scoreDelta` and outcome classification, and derives a `checkpointDate` (`__awaiting__` when no new data has arrived). It can synthesize a record for legacy interventions that never had one.
- **`resetAllData()`** (aliased by `clearAllStudents()`) is a **total, in-place** wipe: strips seeded interventions from the shared templates first, then empties students, details, interventions, statuses, outcomes and history. Mutating in place (not reassigning) is deliberate so other bundles don't keep a stale reference.
- **History:** `getUploadHistory`, `addUploadHistory` (generates id + createdAt, unshifts), `getUploadRecord`, `deleteUploadHistory`.
- **Revert:** `revertUpload(record)` delegates to the shared `planUploadRevert(record, state.details)`, removes created students and writes back restored records (and their recalculated risk).

### `lib/uploadRevert.ts` — Shared Pure Revert Planner
Used by **both** the browser and `DELETE /api/history`, so both layers agree on the pre-upload state.
- **`buildSnapshot(detail)`** — the exact field set an upload snapshots before modifying a student.
- **`recomputeStudentRisk(existing)`** — rebuilds `RawStudentData` and re-runs the engine + fallback explanation.
- **`affectedStudentIds(record)`** — distinct ids from `rawData`.
- **`planUploadRevert(record, detailsById)`** — for each affected student:
  - snapshot is an object → restore every field (perfect revert);
  - snapshot is `null` → the upload created them → add to `removedIds`;
  - no snapshots at all (legacy) → strip only what that upload type introduced (remove the week, remove UT1/UT2, reset backlogs/fees/results);
  - then recompute risk and return `{ updated, removedIds }`.

### `lib/dbConnect.ts` — MongoDB Connection Helper
- `mongoose.set('bufferCommands', false)` and `serverSelectionTimeoutMS: 2500` so an unreachable cluster **fails fast instead of hanging**.
- Caches the connection on `globalThis` (`{ conn, promise }`) to avoid connection storms across hot reloads.
- **`isDbConnected()`** returns false when `MONGODB_URI` is unset; enforces a **60 s cooldown** (`COOLDOWN_MS`) after a failure so the app stops hammering an unreachable cluster; otherwise attempts `dbConnect()` and reports `readyState === 1`.
- If connection fails it logs "MongoDB not connected, using in-memory store" and returns `null` (never throws to callers).

### `lib/models.ts` — Mongoose Schemas (see §10 for detail)
Defines `Student`, `UploadHistory`, and `Outcome` models, each guarded with `mongoose.models.X || mongoose.model(...)` to survive hot reloads.

### `lib/mockData.ts` — Seed Data
- **50 students** (`S001`–`S050`) built from `masterRows`, each tagged with a `TrendProfile` (stable_high, stable_mid, stable_low, declining, was_good_then_bad, improving, good_att_bad_grades, spike_then_drop, recovering) and four weeks of `{att, score}`.
- Deterministic derivations: `backlogData` (count + subjects), `feeData` (overdue days), `engagementRate(profile)` (30–88%), per-week **subject breakdown** with a deterministic offset formula, and legacy `subjectAttendance`.
- **`buildStudentData()`** runs the real `computeRiskScore` + `generateFallbackExplanation` for every student so the demo data is exactly consistent with the engine, then sorts summaries by descending risk.
- **Seeded interventions:** `studentStatusMap` (S006/S019/S022) + `seededBaselineScores` (84/88/74). A loop attaches those interventions onto the student detail records with the frozen baseline (without this the dashboard/profile/outcome couldn't see them).
- **`outcomeComparisonsMap`** pre-seeds three outcome comparisons with a deliberate baseline-vs-current gap so the demo shows a real before/after.

---

## 9. `tests/` — Test Suite

Run with the native Node test runner (`npm test`). `ts-register.mjs` registers `ts-resolve-hooks.mjs`, a custom module resolver that (a) retries `./types`-style extensionless TS imports with `.ts` and (b) maps bare Next subpaths (`next/server` → `next/server.js`) so route handlers can be imported and unit-tested in plain Node.

- **`riskEngine.test.ts`** — ~30 assertions: healthy baseline = 0; each factor's tiers; attendance interpolation (60/74/75/84/85 continuity — proving no hard cliffs); grade delta (UT2 decline/recovery, UT2-only baseline scoring, name normalization); backlog/fee/engagement tiers; max-risk = exactly 100; boundary tests at 30/31/60/61; factor sort order and tie-breaking; empty/invalid inputs; suggested-action mapping and the "Monitor never becomes an assignable action" guarantee; fallback explanation shapes.
- **`interventionLifecycle.test.ts`** — baseline frozen at assignment while current moves; legacy record without a baseline is frozen once by `ensureBaseline`; resolve closes status everywhere and reopen restores it; resolving leaves no stale baseline; a student with no intervention has no outcome; seeded interventions ship frozen with a real gap.
- **`dbRevert.test.ts`** — exact pre-upload state restoration; created students removed; legacy log strips only its own entries; unaffected students untouched; risk recomputed after revert.
- **`resetAll.test.ts`** — full reset wipes everything; a student re-uploaded *after* a reset carries no stale intervention/outcome; reset clears freshly-uploaded students too.
- **`groq.test.ts`** — prompt construction (pure); live integration tests that **auto-skip** when the dev server or API key is unavailable; 429 wait-and-retry behavior with a mocked `fetch`; empty "thinking-model" reply retried with low reasoning effort; missing key → clearly-flagged fallback, never a 500.

---

## 10. MongoDB Logic (in depth)

MongoDB is **optional and secondary**. The design principle everywhere is: *try Mongo; on any failure, silently use memory*. This means the app runs with zero configuration for a demo, and gains persistence when `MONGODB_URI` is provided.

### 10.1 Connection management — `lib/dbConnect.ts`
- `MONGODB_URI` is read once from `process.env`.
- `bufferCommands: false` + `serverSelectionTimeoutMS: 2500` → **fail fast**.
- The connection is cached on `globalThis.mongoose = { conn, promise }` to survive hot reloads and avoid redundant connects.
- **Cooldown:** after a failed connect, `lastFailedAt` is set and `isDbConnected()` short-circuits for `COOLDOWN_MS = 60_000` ms — one retry per minute rather than a connect attempt per request.
- `isDbConnected()` returns a boolean and never throws; callers simply proceed with the in-memory path when it's false.
- A successful `readyState === 1` resets the cooldown.

### 10.2 Schemas — `lib/models.ts`

**`Student`** (`timestamps: true`), keyed uniquely by `studentId`:
- Identity/UI: `studentId` (required, unique), `name` (required), `department` (required), `year` (required).
- Scoring output: `riskScore` (default 0), `riskLevel` (enum Low/Medium/High, default Low), `interventionStatus` (enum None/Active/Resolved, default None).
- **Attendance:** `attendanceHistory: [{ week, percentage, subjects: [{ subject, percentage }] }]` (the unified overall+subject shape).
- Legacy `subjectAttendance: [{ subject, week, percentage }]`.
- `termTests: [{ testName, score, maxMarks, date }]`.
- `endSemResult: { score, maxMarks, status }`, `lastSemResult: { score, maxMarks }`.
- `backlogCount`, `backlogSubjects: [String]`, `feeStatus`, `feeOverdueDays`, `submissionRate`.
- `contributingFactors: [{ factor, points, reason }]`, `suggestedAction`, `aiExplanation`.
- `activeIntervention: { type, details: Mixed, status (enum Active/Resolved/Discontinued), assignedDate, baselineRiskScore }` — the frozen baseline lives here.

**`UploadHistory`** (`timestamps: true`): `id`, `week`, `type`, `uploadedAt`, `studentsUpdated`, `uploadedBy`, `rawData: Mixed`, `snapshots: Mixed`, `fileName`. `Mixed` is required because CSV rows and per-student snapshot objects are dynamic shapes.

**`Outcome`** (`timestamps: true`): `studentId`, `name`, `intervention: { type, details: Mixed, startDate }`, `baselineScore`, `currentScore`, `scoreDelta`, `outcome`, `checkpointDate`.

All three are registered with the hot-reload guard: `mongoose.models.Student || mongoose.model('Student', StudentSchema)`.

### 10.3 Read/write patterns per route
| Route | Mongo behavior |
|---|---|
| `GET /api/students` | `find({}, {projection})`. **Used only if non-empty**, else the seeded in-memory list. |
| `POST /api/students` | `bulkWrite` of `updateOne` upserts keyed by `studentId` (`$set`, `upsert: true`). Memory is always updated too. |
| `DELETE /api/students` | `Student.deleteMany({})`. |
| `GET /api/students/[id]` | `findOne({studentId})` → `{student}`. |
| `PATCH /api/students/[id]` | `findOneAndUpdate(..., {new:true, runValidators:true})`. |
| `DELETE /api/students/[id]` | `deleteOne({studentId})`. |
| `GET /api/history` | `UploadHistory.find({}).sort({createdAt:-1})` if non-empty. |
| `POST /api/history` | `UploadHistory.create(memoryRecord)` (uses the memory-generated `id`). |
| `DELETE /api/history` | looks the record up in Mongo if absent in memory, reverts students (`findOneAndUpdate` upserts + `deleteMany` removed ids), then deletes the log. |
| `POST /api/groq/explain` | persists the live `aiExplanation` onto the `Student` document (`findOneAndUpdate`). |
| `DELETE /api/interventions` | `Outcome.deleteMany({})` (plus in-memory reset). |

### 10.4 How Mongo and memory stay consistent
- **Every write updates memory first (or unconditionally), then Mongo.** Mongo failures are caught and logged as warnings; they never fail the request.
- **Reads prefer Mongo only when it returns data.** Because the seeded cohort lives in memory, an empty Mongo collection doesn't blank the dashboard — a deliberate demo-safety rule.
- **Interventions/outcomes** are primarily computed in memory from student records; Mongo stores the `Outcome` shape for persistence/analytics and the `aiExplanation` cache.
- **Risk scoring is never done in Mongo** — it is always computed by `lib/riskEngine.ts` and stored as plain fields.

---

## 11. Data Flow Summary

**Upload → score → view**
```
CSV (Papa.parse, client) → validate columns → handleDataUpload
  → snapshot each affected student (buildSnapshot) → apply per-type merge
  → computeRiskScore + generateFallbackExplanation
  → optimistic client state (students/detailsMap) → fire-and-forget
     POST /api/students (bulk upsert)  +  POST /api/history (log+snapshots)
  → dataVersion++ → pages re-read
```

**Delete upload → revert**
```
handleDeleteUpload → planUploadRevert(log, details) [shared pure fn]
  → POST restored students, DELETE created students, DELETE /api/history
  → server DELETE /api/history independently calls the SAME planner → Mongo writeback
```

**Intervention lifecycle**
```
Assign: POST /api/interventions (freezes baselineRiskScore) + PATCH student
Use:    currentScore moves with new data; baseline never moves
Resolve/Reopen: PATCH /api/interventions/[id] + PATCH student → all stores agree
Outcome: GET /api/outcomes/[id] → baseline vs live current → Improving/Worsening/No Change
```

**AI narrative**
```
StudentDetailView → POST /api/groq/explain {mode:'explain'}
  → Groq (primary → fallback, 429 wait+retry, empty-content retry)
  → persist aiExplanation → UI shows GROQ badge or STRUCTURED FALLBACK
```

---

## 12. Logic & Design Highlights (why it works)

- **Deterministic scoring** — auditable, offline-capable, no training data; every point traces to an input.
- **Interpolation instead of cliffs** — attendance risk changes smoothly across the 60/75/85 boundaries (verified by tests).
- **AI as a translation layer only** — it can never alter the score; both the app-level fallback and the route-level fallback guarantee the UI never breaks.
- **Frozen baselines** — the "before" score is written once and never re-derived, so outcomes measure real change.
- **Snapshot-based undo** — deleting an upload restores exact pre-upload state (or removes created students) using one pure planner shared by client and server.
- **Dual-layer storage** — memory is always present; Mongo is a graceful, fail-fast, cold-start-tolerant mirror.
- **Shared `globalThis` store** — route bundles and hot reloads share state, so a mutation through any endpoint is immediately visible everywhere.
- **Explicit provenance** — the UI always distinguishes a live Groq narrative from a structured fallback, and a resolved intervention from an active one on every surface.

---

## 13. Environment & Runtimes

| Variable | Required? | Effect when missing |
|---|---|---|
| `GROQ_API_KEY` | No | Route returns deterministic fallback text (200, `fallback: true`) |
| `MONGODB_URI` | No | In-memory store only; `isDbConnected()` returns false immediately |
| `NEXT_PUBLIC_APP_URL` | No | Cosmetic / link base only |

**Login:** mentor `mentor` / `sentinel123`; students `S001`–`S050` (no password).

---

*End of report. No source code was modified — this document only describes the existing implementation.*
