# EarlyAlert — Predictive Student Dropout Detection & Intervention System

**Problem Statement:** ED-05 — Build a platform that helps institutions identify and reduce student dropout rates through predictive analytics.

**Hackathon:** Hack2Ignite
**Theme:** EduTech

---

## 1. Problem Statement

Institutions usually discover a student is at risk of dropping out only after the decision is effectively already made — by the time low attendance, mounting backlogs, and disengagement are noticed, it's often too late for meaningful intervention. There is no continuous, explainable system that flags at-risk students early enough for mentors to actually act.

## 2. Solution Overview

EarlyAlert is a predictive dashboard that continuously scores every student's dropout risk using weighted academic and behavioral signals, explains *why* a student is flagged, recommends an appropriate intervention, and tracks whether that intervention actually works — closing the loop from detection to measurable outcome.

The system is explicitly **not a black box**: every risk score comes with a transparent breakdown of contributing factors, and every recommendation is confirmed by a human mentor before action is taken.

---

## 3. Full Workflow (Step by Step)

### Phase 1 — Data Setup
1. Each student has a profile tracking: attendance % (weekly snapshots), grade/test scores (per test, trend-trackable), active backlog count, fee payment status (with days overdue), and engagement rate (assignment/LMS submission %).
2. For the prototype, this is mock/seeded data — 30–50 students with varied, realistic risk profiles.

### Phase 2 — Risk Scoring
3. A weighted scoring function combines five factors into a single risk score (0–100):

| Factor | Weight | Trigger condition |
|---|---|---|
| Attendance decline | 30% | Drop of 15%+ over recent weeks |
| Grade decline | 25% | Consistent downward trend in scores |
| Backlogs | 20% | 2+ active backlogs |
| Fee overdue | 15% | Overdue beyond threshold (e.g. 10 days) |
| Low engagement | 10% | Low assignment/LMS submission rate |

4. Score is classified: **Low (0–30) / Medium (31–60) / High (61–100)**.
5. Every score is stored with an explainability breakdown — which factors contributed, and by how much.

### Phase 3 — Dashboard & Detection
6. Mentors/staff view a dashboard table of all students, sorted by risk score, color-coded (green/yellow/red), filterable by department/year.
7. Clicking a student opens a drill-down view: full risk breakdown plus attendance/grade trend charts.

### Phase 4 — Alert & Recommendation
8. When a student crosses into High risk, their row is flagged (red badge) and an alert is generated for their assigned mentor.
9. The system suggests a likely intervention based on the dominant risk factor:
   - Grade decline dominant → "Extra Class / Tutoring"
   - Attendance dominant → "Counseling / Check-in"
   - Fee overdue dominant → "Financial Aid Referral"
   - Backlogs dominant → "Academic Support"

### Phase 5 — Mentor Action
10. The mentor reviews the suggestion and either confirms it or picks a different action.
11. For "Extra Class," the mentor enters: subject, schedule (day/time), optional instructor name.
12. An `InterventionRecord` is created, capturing a **baseline risk score snapshot** at the moment of assignment.
13. Simpler actions (Contacted, Counseling Scheduled, Parent Notified) can also be logged directly with a free-text notes field.

### Phase 6 — Student Visibility
14. The student, via their own login, sees a status card reflecting the assigned action — e.g., "Extra Class assigned: Data Structures, Tue/Thu 4pm" or "Meeting scheduled: [date] with [mentor]."
15. No real email/SMS integration in the prototype — this is a UI state visible on login.

### Phase 7 — Monitoring the Intervention
16. During the intervention period (e.g., 2–4 weeks), the scoring engine keeps recalculating as normal off ongoing data.
17. The student's dashboard badge changes to reflect "High risk → Intervention active" (e.g., blue badge), distinguishing flagged-and-handled from flagged-and-untouched.

### Phase 8 — Outcome Comparison
18. At a checkpoint, the system compares the **baseline risk score** (captured at intervention start) to the **current risk score**.
19. Outcome is classified: **Improving** (score dropped) / **No Change** / **Worsening**.
20. The mentor sees a clear before/after summary, e.g.: *"Extra Class (Data Structures) — started 3 weeks ago. Risk score: 68 → 41. Improving."*

### Phase 9 — Closing the Loop
21. Once a student's score stabilizes at Low/Medium, the mentor marks the intervention "Resolved."
22. Full history is retained — this outcome data is what would train a real ML model in a future version, turning the rule-based system into a learned one over time.

### Workflow Summary
```
Data → Risk Score → Dashboard Flag → Alert →
System Suggests Action → Mentor Assigns Intervention →
Student Sees It → Time Passes, Data Updates →
Score Re-calculates → Before/After Comparison →
Outcome Shown → Mentor Resolves or Adjusts
```

---

## 4. Roles

### Mentor / Institution Staff
- Views dashboard of all students sorted/filtered by risk
- Drills into individual student risk breakdowns and trend charts
- Reviews system-suggested interventions and confirms or overrides them
- Assigns interventions (Extra Class, Counseling, Financial Aid Referral, etc.) with relevant details
- Logs status/notes on actions taken
- Reviews before/after outcome comparisons and resolves or adjusts interventions

### Student
- Views their own risk status (optional, can be scoped out if time-limited)
- Sees assigned interventions (extra class schedule, scheduled meetings) via their own dashboard/login
- No editing capability — read-only visibility into actions taken on their behalf

*(No separate "instructor/TA" role — kept out of scope for the prototype to avoid unnecessary complexity. The mentor owns assignment and tracking end-to-end.)*

---

## 5. Features

- **Multi-factor weighted risk scoring** — combines attendance, academics, backlogs, fees, and engagement into one unified score
- **Explainable AI** — every risk flag includes a clear breakdown of contributing factors, not just a number
- **Real-time dashboard** — sortable, filterable, color-coded risk view across the institution
- **Student drill-down view** — individual attendance/grade trend charts
- **Automated early-warning alerts** — high-risk students flagged automatically for their mentor
- **AI-generated recommendation text** — system suggests likely intervention type based on dominant risk factor, phrased via Groq for a natural, readable explanation
- **Mentor action & assignment panel** — confirm/override suggested action, assign Extra Class/Counseling/etc. with details
- **Intervention tracking** — records baseline risk score at assignment time
- **Continuous re-scoring** — risk score naturally updates as new data comes in, reflecting real progress or lack thereof
- **Before/after outcome comparison** — quantifies whether an intervention worked
- **Student-facing status view** — students see assigned actions (extra class schedule, meetings) without needing real notification infrastructure
- **What-if simulator** *(stretch feature)* — adjust one factor (e.g., attendance %) and see risk score recalculate live

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), Tailwind CSS |
| Charts | Recharts |
| Backend | Next.js API routes |
| Database | MongoDB (Mongoose or native driver) |
| Core scoring logic | Custom deterministic rule-based engine (JS/TS) — no ML/LLM involved in the actual score calculation |
| AI enhancement layer | Groq API (`https://api.groq.com/openai/v1/chat/completions`), model: `llama-3.1-8b-instant` — used only to generate natural-language explanations/recommendations from the structured risk breakdown, never to calculate the score itself |
| Auth | NextAuth.js or minimal role-based login (Mentor / Student) |

**Design principle:** the risk score and classification are always computed by deterministic code, verifiable by hand. Groq is layered on top purely for readability/phrasing of the explanation and recommendation text, with a fallback to raw structured data if the API call is slow or fails — this ensures the live demo never breaks due to an external API issue.

---

## 7. Data Schemas

```
Student {
  studentId, name, department, year,
  currentAttendance: Number,
  attendanceHistory: [{ week, percentage }],
  gradeHistory: [{ test, score }],
  backlogs: Number,
  feeStatus: { overdueDays: Number },
  engagement: { submissionRate: Number },
  assignedMentor: mentorId
}

RiskScore {
  studentId,
  riskScore: Number (0–100),
  riskLevel: "Low" | "Medium" | "High",
  contributingFactors: [{ factor, points, reason }],
  lastUpdated: Date
}

InterventionRecord {
  studentId,
  type: "Extra Class" | "Counseling" | "Financial Aid Referral" | "Academic Support" | etc.,
  details: { subject, schedule, instructor } (optional, type-dependent),
  assignedBy: mentorId,
  startDate: Date,
  baselineRiskScore: Number,
  status: "Active" | "Resolved" | "Discontinued",
  notes: String
}

Outcome {
  interventionId,
  baselineScore: Number,
  currentScore: Number,
  scoreDelta: Number,
  outcome: "Improving" | "No Change" | "Worsening",
  checkpointDate: Date
}
```

---

## 8. Build Order (for iterative/vibecoded development)

1. Schema + mock data generation (40 realistic student profiles with varied risk levels)
2. Risk scoring function (deterministic, hand-verified against 5–6 sample students)
3. Dashboard UI — table, sorting, color-coding, filters
4. Student detail view — breakdown + trend charts
5. Alert system — high-risk flagging + system-suggested action
6. Mentor action panel — assign intervention, log status/notes
7. Groq integration — natural-language explanation generation (with fallback)
8. Student-facing status view
9. Intervention tracking + before/after outcome comparison
10. *(Stretch)* What-if simulator

Commit to GitHub after each numbered step to show clear incremental progress.

---

## 9. Demo Script (3–4 minutes)

1. "Here's our dashboard — every student scored by dropout risk in real time." *(show table)*
2. "Let's look at this High-risk student." *(click in)* "Here's exactly why — attendance dropped 22% in 3 weeks, 2 backlogs, fee overdue." *(show breakdown)*
3. "The system suggests an intervention — in this case, extra tutoring — and the mentor confirms and assigns it." *(show assignment flow)*
4. "The student sees it on their own dashboard." *(show student view)*
5. "Three weeks later, here's the outcome — risk score dropped from 68 to 41. The intervention is working." *(show before/after)*
6. Close: "This isn't a black box — every flag is explainable, every recommendation is human-confirmed, and every intervention is measured against real outcomes."

---

## 10. Impact Statement

EarlyAlert shifts institutions from reactive to proactive dropout management — flagging risk weeks before a decision is effectively made, giving mentors an explainable basis for intervention rather than guesswork, and closing the loop by measuring whether interventions actually reduce risk. The architecture is designed to evolve: the rule-based scoring model is an interpretable MVP, and the outcome data it collects (which interventions worked for which risk profiles) is exactly what would train a genuine ML model in a future iteration.

---

## 11. Roadmap (Future Scope)

- Real email/SMS/push notifications via institution's existing LMS or portal
- ML-trained risk model using historical outcome data collected by this system
- Instructor/TA role for direct extra-class attendance tracking
- Integration with institutional ERP/LMS systems for live data instead of manual/mock input
