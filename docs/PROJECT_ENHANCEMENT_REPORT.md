# Sentinel — Enhancement & Roadmap Report

**Purpose:** A prioritized set of things to add, fix, or improve to take Sentinel from "convincing hackathon demo" to "reliable product". Every recommendation is grounded in what the current code actually does (cited) and is chosen to unlock the next capability rather than to add surface area.
**Companion docs:** `INTERVENTION_LOGIC_REPORT.md` (decision logic), `SENTINEL_PROJECT_REPORT_SOP.md` (audit + SOP).
**Read-only:** no source files were modified to produce this report.

---

## How to read this

Each item has: **What**, **Why it matters**, **Evidence in current code**, and **Effort** (S/M/L). The roadmap at the end sequences them. Recommended fixes are descriptions only — no code was changed.

---

## Tier 0 — Do these first (correctness blockers)

These are prerequisites for almost everything else. Until they are done, features built on top will keep "randomly" breaking on Vercel.

### T0.1 Make persistence actually work on serverless
- **What:** Move the source of truth out of `globalThis` into MongoDB (or a KV store). Seed only once, when the DB is genuinely empty.
- **Why:** Currently `state` is per-instance (`lib/db.ts:95-104`), so writes on one Vercel instance are invisible to another, and a cold start re-seeds the 50 students plus the S006/S019/S022 interventions (`lib/mockData.ts:412,421-432`).
- **Evidence:** `globalStore.__sentinelDb ?? (globalStore.__sentinelDb = { students: [...initialStudents], ... })`.
- **Effort:** L.

### T0.2 Stop empty-Mongo from falling back to seed data
- **What:** Distinguish "connected and empty" (return empty) from "not connected" (degrade explicitly).
- **Why:** `GET /api/students` returns the seeded cohort whenever Mongo is empty (`students/route.ts:8-28`), which is why a reset appears to "not stick".
- **Evidence:** `if (dbStudents && dbStudents.length > 0) return ...; return NextResponse.json(getAllStudents());`.
- **Effort:** S (once T0.1 is planned).

### T0.3 Persist `isUploaded` (or derive week identity from data)
- **What:** Add `isUploaded` to the attendance subdocument schema, or — better — stop relying on a client-only flag and merge weeks by real week label.
- **Why:** Mongo strict mode drops `isUploaded` (`lib/models.ts:15-22`), so after any reload the upload filter (`providers.tsx:232-235`) treats all history as mock and replaces it, collapsing the graph to one week.
- **Effort:** S.

### T0.4 Persist interventions and outcomes in MongoDB
- **What:** Add an `Intervention` model and actually write `Outcome` documents.
- **Why:** Interventions are memory-only (`interventions/route.ts:9,34`) and the `Outcome` model is delete-only (`interventions/route.ts:58`) — so plans and outcomes vanish/desync across instances and restarts.
- **Effort:** M.

### T0.5 Fix the status schema/validation mismatch
- **What:** Extend the enums (or use free strings) for `interventionStatus` and `activeIntervention.status` to include `Referred` and `Notified`.
- **Why:** `providers.tsx` sends `'Referred'` for financial aid, but `lib/models.ts:11,58` reject it under `runValidators:true`.
- **Effort:** S.

### T0.6 Authenticate the API and the app
- **What:** Add real auth (NextAuth/Clerk/custom JWT), protect every route, and move the mentor password server-side.
- **Why:** Every `app/api/**/route.ts` is unauthenticated (a `DELETE` can wipe all data), and the mentor password is hard-coded in the client bundle (`LoginView.tsx:24`).
- **Effort:** M–L.

---

## Tier 1 — Reliability & data integrity

### T1.1 Await writes before bumping `dataVersion`; POST only affected students
- **What:** Make `handleDataUpload` `await` the `/api/students` and `/api/history` writes before `setDataVersion`, and send only the affected records.
- **Why:** The current fire-and-forget writes (`providers.tsx:369,387`) race the re-fetch triggered by `dataVersion++` (`:386`), and `Object.values(newDetails)` (`:368`) posts the entire client cache.
- **Effort:** S.

### T1.2 Add an optimistic-write queue / retry for Mongo
- **What:** When `isDbConnected()` is in its 60 s cooldown (`dbConnect.ts:35-37`), queue writes and replay them.
- **Why:** Today those writes are memory-only with no retry, so the DB silently misses them forever.
- **Effort:** M.

### T1.3 Make upload revert single-source-of-truth
- **What:** Let only the server (or only the client) own the revert; remove the double execution.
- **Why:** The client reverts (`providers.tsx:456-474`) and then `DELETE /api/history` reverts again via the same planner (`history/route.ts:69-89`).
- **Effort:** S.

### T1.4 Require a body for destructive deletes
- **What:** `DELETE /api/history` with no `id`/`uploadedAt` wipes all history silently (`history/route.ts` `else { state.history.length = 0; }`). Require an explicit `?all=true`.
- **Effort:** S.

### T1.5 Fix the outcome "awaiting data" state
- **What:** Base `hasNewData` on data newer than the intervention start, not "any attendance exists".
- **Why:** `lib/db.ts:324-327` makes `__awaiting__` unreachable.
- **Effort:** S.

### T1.6 De-duplicate outcome classification and fallback text
- **What:** Extract the "delta → Improving/Worsening/No Change" rule and the deterministic narrative into one shared module used by client, route and engine.
- **Why:** The rule is copied in `lib/db.ts:314-317` and `outcome/page.tsx buildOutcomeData`; the fallback text is copied in `routengine.ts` and `buildDeterministicFallback` in the Groq route.
- **Effort:** S–M.

### T1.7 Validate CSV on the server
- **What:** Re-validate parsed rows server-side (types, ranges, allowed student IDs) instead of trusting the client.
- **Why:** Validation lives only in `DashboardView.tsx:161-186`; the API accepts arbitrary bodies.
- **Effort:** M.

### T1.8 Fix the attendance discontinuity at 85%
- **What:** Interpolate across the 85% boundary so the score doesn't jump from ~8 to 0 (and 12 for sharp drops).
- **Evidence:** `lib/riskEngine.ts:89-97`.
- **Effort:** S (with a new boundary test at 84.x/85).

---

## Tier 2 — Product features that make it genuinely useful

These are the ideas that turn a scoring dashboard into a retention workflow.

### T2.1 A real intervention catalog + playbooks
- **What:** Move beyond the 6 fixed action types to a data-driven catalog (title, category, cost, duration, who delivers it, expected impact, required fields).
- **Why:** The engine only recommends 5 plan shapes (`riskEngine.ts:219-241`); new programs require code edits today.
- **Payoff:** Mentors see a ranked menu with expected effort/impact instead of one suggestion.

### T2.2 Multi-intervention plans per student
- **What:** Support several concurrent plans and a history of past plans, not a single `activeIntervention`.
- **Why:** Current model is one `activeIntervention` per student (`lib/types.ts`), so a student with attendance *and* fee issues can only have one plan tracked.
- **Effort:** M.

### T2.3 Snooze / re-check scheduling
- **What:** "Check again in 2 weeks" reminders, plus a task queue for mentors with due dates.
- **Why:** There is no time-based follow-up; outcomes only change when new CSVs are uploaded.
- **Effort:** M.

### T2.4 Student self-service check-ins
- **What:** Let students log their own attendance/engagement or confirm they attended a session.
- **Why:** The student portal is currently read-only (`StudentFacingStatusView.tsx`).
- **Payoff:** More timely signal than weekly CSV uploads.

### T2.5 Explainability UI ("why this score")
- **What:** A per-factor "show the math" expander showing the exact inputs and points contributed.
- **Why:** The engine already returns `contributingFactors` with reasons (`riskResult.contributingFactors`); the UI shows them (`FactorBreakdownList`) but not the underlying arithmetic.
- **Effort:** S–M.

### T2.6 Intervention effectiveness analytics
- **What:** Aggregate dashboards: which plan types actually lower risk, average delta per plan, time-to-improvement, cohorts.
- **Why:** Outcomes are computed per student (`getOutcome`) but never aggregated. This is the highest-value "next milestone" for a retention team.
- **Effort:** M.

### T2.7 Bulk actions and prioritization
- **What:** Assign the same plan to a filtered cohort; sort by "risk × how long unactioned"; saved filter presets.
- **Why:** The dashboard filters (`DashboardView.tsx`) but actions are one-student-at-a-time.
- **Effort:** M.

### T2.8 Notifications & integrations
- **What:** Email/Slack the mentor when a student crosses High risk; export a cohort report; calendar invites for sessions.
- **Why:** Parent-notification today only writes a `notificationLog` (`providers.tsx:498-502`) — nothing actually notifies anyone.
- **Effort:** M–L.

### T2.9 Import adapters and data quality
- **What:** Google Sheets / SIS connectors; a column-mapping UI; a validation report listing rejected rows and why.
- **Why:** Uploads are manual CSV (`DashboardView.tsx`), with no preview/diff before commit.
- **Effort:** L.

### T2.10 Upload preview + diff
- **What:** Show "this upload will change these N students, here's the before/after" before committing.
- **Why:** The snapshot data (`buildSnapshot`) already exists and could power a diff, but it is only used for undo.
- **Effort:** M.

---

## Tier 3 — Scaling, quality, and engineering hygiene

### T3.1 Real test coverage for the persistence layer
- **What:** Tests with an in-memory Mongo (mongodb-memory-server) covering the routes, replays of "upload → reload → upload", and multi-instance simulation.
- **Why:** `npm test` never sets `MONGODB_URI`; the exact bugs users hit (weeks collapsing, reset undo) are untested. Current suite: 42 pass / 7 skip.
- **Effort:** M.

### T3.2 Observability
- **What:** Structured logging/metrics for DB connect state, upload outcomes, Groq fallback rate, and per-request instance id.
- **Why:** Debugging today relies on `console.warn` strings. The audit's open questions all need runtime evidence.
- **Effort:** M.

### T3.3 Feature flags & a config surface
- **What:** Turn thresholds (risk bands, outcome ±2, "significant improvement" −10, cooldowns) into config.
- **Why:** Magic numbers are scattered (`riskEngine.ts`, `OutcomeComparisonView.tsx`, `dbConnect.ts`).
- **Effort:** S–M.

### T3.4 Accessibility and responsiveness
- **What:** Keyboard/focus handling for modals and the tab switcher, ARIA on charts, color-blind-safe risk palette, mobile review.
- **Why:** The neo-brutalist UI uses color heavily (red/amber/green) to convey risk; charts are Recharts SVGs without descriptions.
- **Effort:** M.

### T3.5 i18n and localization
- **What:** Externalize all copy; add locale support.
- **Why:** Student-facing copy and dates are hard-coded (e.g. `toLocaleDateString('en-IN')` in `StudentDetailView`).
- **Effort:** M.

### T3.6 Remove dead code and unused deps
- **What:** Delete the unused `AttendanceChart.tsx`, the unreachable `overwrite` branch (`providers.tsx:203-207`), and the unused `motion` dependency; remove unused default `dbConnect` imports.
- **Effort:** S.

### T3.7 Documentation truth pass
- **What:** Update the README (fallback model, test count, data file names, fee boundary) and document the storage model.
- **Why:** README says `llama-3.3-70b-versatile` fallback vs code's `openai/gpt-oss-20b`; "41 tests" vs 49; non-existent CSV names.
- **Effort:** S.

### T3.8 Security hardening
- **What:** Rate-limit the API, validate/coerce `studentId` to prevent Mongo operator injection in `POST /api/students` (`filter: { studentId: student.studentId }`), add CSRF considerations for mutations.
- **Effort:** M.

---

## Feature concepts worth a prototype (bold bets)

- **Counterfactual "what would help most":** simulate each candidate intervention's effect on the score (e.g. raising attendance to 80%) and rank actions by projected risk reduction. The deterministic engine makes this cheap — it is a pure function.
- **Early-warning lead time:** measure how many weeks before a student would have crossed High risk, to show the value of catching them earlier.
- **Peer/cohort comparison:** show a student's trajectory against their year/department percentile (privacy-preserving aggregates).
- **Explainable LLM with citations:** have the narrative cite the exact factor rows it references, and constrain it to engine output so it can never invent a cause.
- **Offline/first-class demo mode:** a seeded, DB-free mode explicitly labelled "Demo" so judges/users understand the difference from production.

---

## Suggested roadmap

| Phase | Focus | Items | Exit criteria |
|---|---|---|---|
| **P0 — Stabilize** | Correctness blockers | T0.1–T0.5, T1.1, T1.8 | Upload → reload → upload keeps all weeks; reset stays reset; plans survive restart; tsc + tests green |
| **P1 — Secure & observe** | Auth + reliability | T0.6, T1.2–T1.7, T3.1, T3.2, T3.8 | No unauthenticated mutation; failures visible in logs; regression tests for the fixed bugs |
| **P2 — Useful workflow** | Product depth | T2.1–T2.3, T2.6, T2.10 | Mentors can manage multiple plans, see what works, preview uploads |
| **P3 — Scale** | Reach + polish | T2.4, T2.5, T2.7–T2.9, T3.3–T3.7 | Student participation, notifications, analytics, accessibility |

**Dependencies:** T0.1 (DB source of truth) unblocks T0.2, T0.4, T1.2, T1.3; T0.3 unblocks reliable attendance charts; T0.4 unblocks T2.2 and T2.6; T0.6 should gate any public deployment.

---

## Impact vs effort snapshot

| Item | Impact | Effort | Do first? |
|---|---|---|---|
| T0.1 DB source of truth | Critical | L | Yes |
| T0.3 `isUploaded` / week identity | High | S | Yes |
| T0.6 Auth | Critical | M–L | Yes (gate release) |
| T1.1 Await writes + affected-only POST | High | S | Yes |
| T0.4 Persist interventions/outcomes | High | M | Yes |
| T2.6 Intervention analytics | High | M | Soon |
| T1.8 85% discontinuity | Medium | S | Soon |
| T3.1 Persistence tests | High | M | Soon |
| T2.1 Intervention catalog | High | M | Later |
| T3.6/T3.7 Cleanup + docs | Low | S | Anytime |

---

*End of enhancement report. Read-only; no source files were modified.*
