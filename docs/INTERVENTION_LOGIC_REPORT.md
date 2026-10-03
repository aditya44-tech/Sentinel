# Sentinel — Intervention & Decision Logic Report

**Scope:** Every piece of logic that decides *what a mentor is told to do* for a student, *what plan gets filed*, *how that plan is displayed back*, and *how its outcome is judged*.
**Method:** Read-only. Every rule below is quoted from the current source with `file:line`.
**Related docs:** `FULL_CODEBASE_REPORT.md` (structure), `SENTINEL_PROJECT_REPORT_SOP.md` (audit + SOP).

---

## Table of Contents

1. [The decision pipeline at a glance](#1-the-decision-pipeline-at-a-glance)
2. [Step 1 — Which factor dominates](#2-step-1--which-factor-dominates)
3. [Step 2 — Factor → suggested action (`getSuggestedAction`)](#3-step-2--factor--suggested-action-getsuggestedaction)
4. [Step 3 — Suggested action → fillable intervention type (`getActionTypeForSuggestion`)](#4-step-3--suggested-action--fillable-intervention-type-getactiontypeforsuggestion)
5. [Step 4 — The mentor action panel: pre-filling the form](#5-step-4--the-mentor-action-panel-pre-filling-the-form)
6. [Step 5 — Action type → payload fields → status](#6-step-5--action-type--payload-fields--status)
7. [Step 6 — AI rationale for the chosen plan](#7-step-6--ai-rationale-for-the-chosen-plan)
8. [Step 7 — Baseline freezing and outcome scoring](#8-step-7--baseline-freezing-and-outcome-scoring)
9. [Step 8 — Resolve / reopen lifecycle](#9-step-8--resolve--reopen-lifecycle)
10. [The deterministic fallback narrative logic](#10-the-deterministic-fallback-narrative-logic)
11. [What the student is shown (friendly translation layer)](#11-what-the-student-is-shown-friendly-translation-layer)
12. [Worked examples (seeded demo students)](#12-worked-examples-seeded-demo-students)
13. [Logic problems found in this area](#13-logic-problems-found-in-this-area)

---

## 1. The decision pipeline at a glance

```
RawStudentData
   │  computeRiskScore()                       lib/riskEngine.ts:256
   ▼
scoreAttendance / scoreTermTests / scoreBacklogs / scoreFeeOverdue / scoreEngagement
   │  factors.push(...); factors.sort(desc by points)   riskEngine.ts:285-289
   ▼
dominantFactor = factors[0].factor  (or 'None')          riskEngine.ts:291
   │
   ▼
getSuggestedAction(dominantFactor, student)              riskEngine.ts:219   ← the mentor's recommendation text
   │
   ▼
StudentDetail.suggestedAction  ──► shown on profile banner        StudentDetailView.tsx
   │
   ▼
getActionTypeForSuggestion(suggestedAction)              riskEngine.ts:243   ← pre-selects the form's action type
   │
   ▼
MentorActionPanel: subject/reason/fee-notes pre-fill     MentorActionPanel.tsx:40-60
   │
   ▼
handleSubmit → MentorActionPayload {type, details, status}  MentorActionPanel.tsx:88-131
   │
   ▼
onSubmitSuccess → handleInterventionAssigned             providers.tsx:489
   │  POST /api/interventions (baseline frozen)             interventions/route.ts:34 → db.ts:140
   ▼
activeIntervention stored (memory) + PATCH student (Mongo) providers.tsx:538-556
   │
   ▼
Outcome comparison: baseline vs live current score       lib/db.ts:270  (Improving / No Change / Worsening)
```

**Design principle:** the risk engine owns the *recommendation wording*, and the recommendation→action-type mapping lives in the same file (`riskEngine.ts:243`) so the dashboard banner and the assignment form cannot drift apart.

---

## 2. Step 1 — Which factor dominates

The score is the sum of five capped factors; they are sorted descending and the top one becomes the "dominant factor".

```ts
// lib/riskEngine.ts:285-291
  if (attResult.points > 0) factors.push({ factor: 'Attendance Decline', points: attResult.points, reason: attResult.reason });
  if (gradeResult.points > 0) factors.push({ factor: 'Grade Decline', points: gradeResult.points, reason: gradeResult.reason });
  if (backlogResult.points > 0) factors.push({ factor: 'Backlogs', points: backlogResult.points, reason: backlogResult.reason });
  if (feeResult.points > 0) factors.push({ factor: 'Fee Overdue', points: feeResult.points, reason: feeResult.reason });
  if (engResult.points > 0) factors.push({ factor: 'Low Engagement', points: engResult.points, reason: engResult.reason });

  factors.sort((a, b) => b.points - a.points);

  const dominantFactor = factors.length > 0 ? factors[0].factor : 'None';
```

Rules:
- A factor is **only present if it scored > 0**. A student with no risk has an empty factor list → `dominantFactor = 'None'`.
- Ties break by **insertion order** (attendance → grade → backlog → fee → engagement), because `Array.prototype.sort` is stable. The test `dominant factor ties keep the earlier-inserted factor (grade before fee)` locks this in (`tests/riskEngine.test.ts`).
- Max weights: Attendance 30, Grade 25, Backlogs 20, Fee 15, Engagement 10.

---

## 3. Step 2 — Factor → suggested action (`getSuggestedAction`)

```ts
// lib/riskEngine.ts:219-241
export function getSuggestedAction(dominantFactor: string, student: RawStudentData): string {
  switch (dominantFactor) {
    case 'Grade Decline':
      if (student.subjectAttendance && student.subjectAttendance.length > 0) {
        const lowest = student.subjectAttendance.reduce((min, curr) => curr.percentage < min.percentage ? curr : min, student.subjectAttendance[0]);
        return `Extra Class / Tutoring: ${lowest.subject}`;
      }
      return 'Extra Class / Tutoring';
    case 'Attendance Decline': return 'Counseling / Check-in';
    case 'Fee Overdue': return 'Financial Aid Referral';
    case 'Backlogs': return 'Academic Support';
    case 'Low Engagement': return 'Counseling / Check-in';
    default: return 'Monitor';
  }
}
```

| Dominant factor | Recommendation text returned | Subject appended? |
|---|---|---|
| `Grade Decline` | `Extra Class / Tutoring: {weakest subject}` | **Yes** — lowest `subjectAttendance.percentage` |
| `Grade Decline` (no subject data) | `Extra Class / Tutoring` | no |
| `Attendance Decline` | `Counseling / Check-in` | no |
| `Fee Overdue` | `Financial Aid Referral` | no |
| `Backlogs` | `Academic Support` | no |
| `Low Engagement` | `Counseling / Check-in` | no |
| `None` / anything else | `Monitor` | no |

Notes:
- Grade recovery uses a **linear scan (reduce)** for the minimum, seeded with `subjectAttendance[0]`.
- The weakest-subject pick reads `student.subjectAttendance` (the flat legacy list). If that list is empty (e.g. only weekly history exists), it silently falls back to generic text.
- Two factors can produce the **same plan**: `Attendance Decline` and `Low Engagement` both map to `Counseling / Check-in`.

**Boundary trace (correctness):**
- `[50]` → 50. `[100,60]` → 60. `[100,60,100]` → 60 (max of middle). `[64,70,70]` → 64 = 60×1.4 = 84 → floor 70? (engine rounds `84` to `84`, clamp 0–20) — the score is monotonic but capped at 20.
- `subjectAttendance` empty array → the `if` is false → returns `'Extra Class / Tutoring'` (no colon). `getActionTypeForSuggestion` still matches via `includes('tutoring')`.

---

## 4. Step 3 — Suggested action → fillable intervention type (`getActionTypeForSuggestion`)

```ts
// lib/riskEngine.ts:243-254
export function getActionTypeForSuggestion(suggestion: string): ActionType {
  const s = (suggestion || '').toLowerCase();
  if (s.includes('extra class') || s.includes('tutoring')) return 'Extra Class';
  if (s.includes('counseling')) return 'Counseling';
  if (s.includes('financial')) return 'Financial Aid Referral';
  if (s.includes('academic')) return 'Academic Support';
  if (s.includes('parent')) return 'Parent/Guardian Notified';
  return 'Other';
}
```

| Recommendation text | Action type pre-selected in the form |
|---|---|
| `Extra Class / Tutoring: DBMS` | `Extra Class` |
| `Counseling / Check-in` | `Counseling` |
| `Financial Aid Referral` | `Financial Aid Referral` |
| `Academic Support` | `Academic Support` |
| anything containing "parent" | `Parent/Guardian Notified` |
| `Monitor` (and empty string) | `Other` |

**Deliberate rule:** `Monitor` is *not* an assignable case. It means "no factors, keep watching". Because the banner is only shown when there is at least one factor, the "Other" fallback is never offered for a healthy student. A unit test asserts this and also asserts every factor-driven recommendation maps to a real form (`tests/riskEngine.test.ts`).

**Important consumer-side nuance:** `StudentDetailView` decides whether to offer an action at all using the *factor list*, not the action type:

```tsx
// views/StudentDetailView.tsx (logic excerpt)
const noRiskFactors = (student.contributingFactors?.length ?? 0) === 0;
...
{hasIntervention ? ( ...active/resolved banner... )
 : noRiskFactors ? ( ...informational "No Action Needed" banner... )
 : ( ...suggestedAction + "Assign This Action"... )}
```

---

## 5. Step 4 — The mentor action panel: pre-filling the form

The form is built to make the engine's recommendation the default, while still letting the mentor override anything.

### 5.1 Subject options and the recommended subject

```tsx
// views/MentorActionPanel.tsx:40-60
const availableSubjects = Array.from(new Set([
  ...(student.subjectAttendance?.map(s => s.subject) || []),
  ...(student.backlogSubjects?.flatMap(s => s.split(/[,;]/).map(str => str.trim()).filter(Boolean)) || []),
  'Data Structures', 'DBMS', 'Computational Math', 'Computer Network', 'Python Programming'
]));

const suggestedSubject = suggestedAction.includes(':')
  ? suggestedAction.slice(suggestedAction.indexOf(':') + 1).trim()
  : '';
const parsedBacklogSubjects = (student.backlogSubjects || [])
  .flatMap(s => s.split(/[,;]/).map(str => str.trim()).filter(Boolean));

let recommendedSubject = availableSubjects[0];
let recommendationReason = '';

if (suggestedSubject && availableSubjects.includes(suggestedSubject)) {
  recommendedSubject = suggestedSubject;
  recommendationReason = 'Engine Pick';
} else if (parsedBacklogSubjects.length > 0) {
  recommendedSubject = parsedBacklogSubjects[0];
  recommendationReason = 'Low Grade';
} else if (student.subjectAttendance && student.subjectAttendance.length > 0) {
  recommendedSubject = student.subjectAttendance.reduce((min, curr) => curr.percentage < min.percentage ? curr : min, student.subjectAttendance[0]).subject;
  recommendationReason = 'Low Attendance';
}
```

**Three-tier subject recommendation:**

| Priority | Condition | `recommendedSubject` | `recommendationReason` |
|---|---|---|---|
| 1 | `suggestedAction` contains `: X` and `X` is in the option list | `X` (the engine's weakest subject) | `Engine Pick` |
| 2 | else there is at least one backlog subject | first backlog subject | `Low Grade` |
| 3 | else subject attendance exists | lowest-attendance subject | `Low Attendance` |
| fallback | none of the above | first of `availableSubjects` (defaults to `Data Structures`) | `''` |

The option labels render the reason inline: `(Recommended - Engine Pick)` etc. (`MentorActionPanel.tsx` option render).

### 5.2 Other pre-filled defaults

```tsx
// views/MentorActionPanel.tsx:60-80 (state initialisers)
const defaultFeeNotes = student.feeOverdueDays ? `Overdue by ${student.feeOverdueDays} days. Status: ${student.feeStatus}` : '';
const [actionType, setActionType] = useState<ActionType>(getInitialActionType(suggestedAction));
const [subject, setSubject] = useState(recommendedSubject);
const [counselingType, setCounselingType] = useState('Academic');
const [referredDepartment, setReferredDepartment] = useState('Accounts Office');
const [feeNotes, setFeeNotes] = useState(defaultFeeNotes);
const [supportType, setSupportType] = useState('Tutoring');
const [supportSubjects, setSupportSubjects] = useState(recommendedSubject);
const [contactMethod, setContactMethod] = useState('Email');
const [assignedBy] = useState('Mentor');
const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
```

### 5.3 The "Automated Suggestion Context" banner
The form shows why the action is being suggested:

```tsx
// views/MentorActionPanel.tsx
<span className="font-black text-sm text-[#0D0D0D]">{suggestedAction}</span>
{student.contributingFactors?.length > 0 && (
  <span className="font-bold text-[#D62828] block mt-0.5">
    Suggested due to: {student.contributingFactors[0].reason}
  </span>
)}
```

---

## 6. Step 5 — Action type → payload fields → status

```tsx
// views/MentorActionPanel.tsx:88-118
let details: any = {};
let status = 'Active';

switch (actionType) {
  case 'Extra Class':
    details = { subject: subject.trim(), schedule: schedule.trim(), instructor: instructor.trim() };
    break;
  case 'Counseling':
    details = { counselingType, schedule: schedule.trim() || startDate, counselorName: counselorName.trim() || assignedBy };
    break;
  case 'Financial Aid Referral':
    details = { referredDepartment: referredDepartment.trim(), feeNotes: feeNotes.trim() };
    status = 'Referred';
    break;
  case 'Academic Support':
    details = { supportType, supportSubjects: supportSubjects.split(',').map(s => s.trim()) };
    break;
  case 'Parent/Guardian Notified':
    details = { contactMethod };
    status = 'Notified';
    break;
  case 'Other':
  default:
    break;
}
```

| Action type | `details` keys | `status` | Required form fields |
|---|---|---|---|
| `Extra Class` | `subject`, `schedule`, `instructor` | `Active` | Subject, Schedule |
| `Counseling` | `counselingType`, `schedule` (defaults to start date), `counselorName` (defaults to assigner) | `Active` | Counseling type |
| `Financial Aid Referral` | `referredDepartment`, `feeNotes` | **`Referred`** | Referred department |
| `Academic Support` | `supportType`, `supportSubjects[]` | `Active` | Support type |
| `Parent/Guardian Notified` | `contactMethod` | **`Notified`** | Contact method |
| `Other` | `{}` (empty) | `Active` | none |

### 6.1 What happens to the payload downstream

```tsx
// app/providers.tsx:489-556 (condensed)
const status = payload.status || 'Active';
if (status === 'Notified') {
  // Parent/Guardian Notified is a timestamped log only.
  await fetch(`/api/students/${payload.studentId}`, { method: 'PATCH', body: JSON.stringify({ notificationLog: payload }) });
  return;                       // ← notification never creates an intervention record
}
const clientSideScore = detailsMap[payload.studentId]?.riskScore;   // baseline source
let baselineRiskScore = clientSideScore;
const res = await fetch('/api/interventions', { method: 'POST', body: JSON.stringify({ ...payload, baselineRiskScore: clientSideScore }) });
...
await fetch(`/api/students/${payload.studentId}`, { method: 'PATCH', body: JSON.stringify({ interventionStatus: status, activeIntervention }) });
```

- **`Notified`** → no intervention record; it only PATCHes a `notificationLog` onto the student and returns early.
- **`Referred`** → proceeds like the others: creates a record and PATCHes `interventionStatus: 'Referred'`.
- The **baseline** sent to the server is the score *currently visible on the client* (`detailsMap[id].riskScore`), with the server's returned value preferred if present. This guards against the server's memory being stale after a fire-and-forget upload.

### 6.2 Server side: record creation

```ts
// lib/db.ts:140-198 (condensed)
export function createIntervention(payload, baselineRiskScore) {
  const record = { id: `INT-${payload.studentId}-${Date.now()}`, studentId: payload.studentId, type: payload.type,
                   details: payload.details, notes: payload.notes, assignedBy: payload.assignedBy,
                   startDate: payload.startDate, baselineRiskScore, status: 'Active', createdAt: ... };
  state.interventions.push(record);
  state.students[idx].interventionStatus = 'Active';            // summary
  detail.activeIntervention = { type, details, status: 'Active', assignedDate: payload.startDate, baselineRiskScore };
  detail.interventionStatus = 'Active';
  state.statuses[id] = { studentId, name, activeIntervention };
  state.outcomes[id] = { ..., baselineScore: baselineRiskScore, currentScore: baselineRiskScore, status: 'Active' };
}
```

Note the record's own status is **hard-coded `'Active'`** regardless of the payload status (`db.ts:151`), while the student's stored `activeIntervention.status` is set from the client (`providers.tsx`). See the issues in §13.

---

## 7. Step 6 — AI rationale for the chosen plan

After a successful submit, the panel asks the Groq proxy for one sentence explaining *why this plan*:

```tsx
// views/MentorActionPanel.tsx:133-152
const res = await fetch('/api/groq/explain', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'rationale', studentName, riskScore, actionType, dominantFactor
  })
});
if (!res.ok) throw new Error('API Error');
const data = await res.json();
setGroqRationale(data.text);
setRationaleSource(Boolean(data.powered) && !data.fallback ? 'groq' : 'fallback');
// on failure:
setGroqRationale(`"${actionType}" is the recommended intervention based on ${studentName}'s primary risk factor.`);
setRationaleSource('fallback');
```

The server prompt (`app/api/groq/explain/route.ts`):

```
You are an academic advisor AI. A mentor is about to assign an intervention for a student.
Student: {studentName}
Current Risk Score: {riskScore}/100
Primary Risk Factor: {dominantFactor}
Recommended Intervention: {actionType}
Write a single, concise sentence (max 30 words) explaining WHY this specific intervention
was recommended for this student. Be direct and practical.
```

- `max_tokens: 80`, `temperature: 0.4`.
- The UI labels the result **"AI Rationale (Groq)"** or **"Intervention Rationale" + "Structured Fallback"** so a live model answer is never confused with a template.
- **Timing detail:** the rationale is requested *after* `onSubmitSuccess(payload)` fires, i.e. the plan is already filed while the explanation loads (the success card shows a pulse skeleton).

The server's rationale fallback text:

```ts
// app/api/groq/explain/route.ts  (getFallbackText, rationale branch)
return `"${actionType || 'Intervention'}" directly addresses ${studentName || 'the student'}'s primary risk signal (${dominantFactor || 'academic need'}) to stabilize progress.`;
```

---

## 8. Step 7 — Baseline freezing and outcome scoring

### Freezing the baseline

```ts
// lib/db.ts:207-228
export function ensureBaseline(studentId: string): number | null {
  const detail = state.details[studentId];
  const statusEntry = state.statuses[studentId];
  const intervention = detail?.activeIntervention ?? statusEntry?.activeIntervention ?? null;
  if (!intervention) return null;
  if (typeof intervention.baselineRiskScore === 'number') return intervention.baselineRiskScore;
  const baseline = detail?.riskScore ?? 0;
  intervention.baselineRiskScore = baseline;
  ...
  return baseline;
}
```

Rule: the baseline is written **once** at assignment. A legacy record with no baseline has the current score frozen into it exactly once. This is what stops "before" from silently tracking "after".

### Judging the outcome

```ts
// lib/db.ts:304-317
const status = studentDetail?.activeIntervention?.status ?? statusEntry?.activeIntervention?.status ?? stored.status ?? 'Active';
const currentScore = studentDetail?.riskScore ?? baselineScore;
const scoreDelta = currentScore - baselineScore;

let outcome: 'Improving' | 'No Change' | 'Worsening';
if (scoreDelta < -2) outcome = 'Improving';
else if (scoreDelta > 2) outcome = 'Worsening';
else outcome = 'No Change';
```

| `scoreDelta` | Outcome |
|---|---|
| < −2 (risk fell) | **Improving** |
| −2 … +2 | **No Change** |
| > +2 (risk rose) | **Worsening** |

The same thresholds are duplicated in the outcome page's `buildOutcomeData` (`app/dashboard/student/[id]/outcome/page.tsx`), which is what the page renders; `getOutcome` powers the API route. **Two copies of the same rule** exist.

A `checkpointDate` is derived as `__awaiting__` when no new data exists, else a date from the latest test/attendance.

---

## 9. Step 8 — Resolve / reopen lifecycle

```ts
// lib/db.ts:230-268 (condensed)
export function resolveIntervention(studentId) {
  setInterventionStatus(studentId, 'Resolved');
  const log = state.interventions.find(i => i.studentId === studentId && i.status === 'Active');
  if (log) log.status = 'Resolved';
}
export function reopenIntervention(studentId) {
  setInterventionStatus(studentId, 'Active');
  const log = [...state.interventions].reverse().find(i => i.studentId === studentId);
  if (log) log.status = 'Active';
}
function setInterventionStatus(studentId, status) {
  // flips: student summary, student detail (+ activeIntervention), statuses store, cached outcome
}
```

Client side (`providers.tsx`), resolve/reopen also optimistically update state and PATCH both `/api/interventions/[id]` and `/api/students/[id]`, then the outcome page waits ~350 ms and force-refetches.

Outcome page resolution guard (`OutcomeComparisonView.tsx`):

```tsx
const handleMarkResolved = () => {
  if (!hasImprovedSignificantly) {
    const confirmed = window.confirm(
      `Risk score hasn't improved significantly (only ${Math.abs(data.scoreDelta)} pts so far). Are you sure you want to mark this resolved?`
    );
    if (!confirmed) return;
  }
  ...
};
```

where `hasImprovedSignificantly = data.scoreDelta <= -10` (a reduction of at least 10 points).

---

## 10. The deterministic fallback narrative logic

When Groq is unavailable, `generateFallbackExplanation` builds prose from the top factors, and `humanizeReason` converts internal reason strings into readable phrases.

```ts
// lib/riskEngine.ts:334-356
export function generateFallbackExplanation(student, result) {
  if (result.contributingFactors.length === 0) {
    return `${student.name} is currently showing no significant risk signals. ... Continue monitoring their progress as usual.`;
  }
  const top = result.contributingFactors[0];
  const others = result.contributingFactors.slice(1, 3);
  const riskWord = result.riskLevel === 'High' ? 'high' : result.riskLevel === 'Medium' ? 'moderate' : 'low';

  let explanation = `${student.name} (Year ${student.year}, ${student.department}) is at ${riskWord} dropout risk with a score of ${result.riskScore}/100. `;
  explanation += `The primary concern is that ${humanizeReason(top.factor, top.reason)}. `;
  if (others.length === 1) explanation += `This is compounded by the fact that the student ${humanizeReason(others[0].factor, others[0].reason)}.`;
  else if (others.length >= 2) explanation += `Additional risk signals include: ${humanizeReason(...)}, and ${humanizeReason(...)}.`;
  return explanation;
}
```

`humanizeReason` (`riskEngine.ts:312-332`) is a **regex-based rewriter** — it parses the numeric value back out of the engine's structured reason string and re-phrases it:

| Factor | Regex used | Example output |
|---|---|---|
| Attendance | `/latest attendance:\s*(\d+)%/i`, `/dropped\s*(\d+)%/i` | "attendance has dropped to 52% (a fall of 26% in recent weeks) and is on a declining trend" |
| Grade | `/unit test \d+ score:\s*(\d+)%/i` + keyword checks | "grades dropped sharply in Unit Test 2 (48%)" |
| Backlogs | `/^(\d+) active backlog/i`, `/:\\s*(.+)$/` | "has 3 active backlogs in DS, Computational Math, DBMS" |
| Fee | `/(\d+) days/` | "fee payment is overdue by 12 days" |
| Engagement | `/(\d+)%/` | "LMS submission rate is low at 35%" |

At most **three** factors are mentioned (top + two others).

---

## 11. What the student is shown (friendly translation layer)

The student portal never shows raw factor names or numeric risk; it maps them to supportive phrasing:

```tsx
// views/StudentFacingStatusView.tsx
const STUDENT_FRIENDLY_FACTOR_MAP: Record<string, string> = {
  'Grade Decline': 'Coursework performance',
  'Low Engagement': 'Class participation',
  'Attendance Decline': 'Attendance',
  'Backlogs': 'Pending subjects',
  'Fee Overdue': 'Administrative & fees',
};
export function toStudentFriendlyFactor(factor: string): string {
  return STUDENT_FRIENDLY_FACTOR_MAP[factor] || factor;
}
```

A plan whose status is `Resolved` or `Notified` is **not presented as active**:

```tsx
const showsActivePlan = Boolean(intervention) && intervention!.status !== 'Resolved' && intervention!.status !== 'Notified';
```

Type-specific student announcements (schedule/exam prep text) branch on `intervention.type` for Extra Class / Counseling / Financial Aid / Academic Support.

---

## 12. Worked examples (seeded demo students)

The seeds in `lib/mockData.ts` are chosen so each recommendation path is visible.

**S006 — Kabir Kale (declining attendance + 3 backlogs).** Attendance dominates → `Counseling / Check-in` is the engine suggestion, but a mentor plan was seeded as `Extra Class` with a frozen baseline of **84** (`seededBaselineScores.S006`) while current risk is lower, so the outcome shows **Improving**.

**S019 — Radhika Reddy (rapid attendance drop + fee overdue).** Attendance dominates → `Counseling / Check-in`; seeded plan is `Counseling`, baseline **88**.

**S022 — Ruchi Reddy (stable low + 3 backlogs).** Grade/backlog weighted; seeded `Academic Support`, baseline **74**, outcome seeded `No Change`.

**Subject recommendation example:** for a Grade-Decline student whose `subjectAttendance` lists DBMS 61, Computer Network 79, Python 66, the engine returns `Extra Class / Tutoring: DBMS`, and the action panel pre-selects subject **DBMS** with reason **Engine Pick**.

---

## 13. Logic problems found in this area

These are documented (not fixed) for the record; full audit IDs are in `SENTINEL_PROJECT_REPORT_SOP.md`.

1. **`Referred` / `Notified` violate the Mongoose enums (CONFIRMED).** `interventionStatus` enum is `['None','Active','Resolved']` and `activeIntervention.status` enum is `['Active','Resolved','Discontinued']` (`lib/models.ts:11,58`). The client sends `interventionStatus: 'Referred'` for financial aid (`providers.tsx:551` with `status='Referred'`), and `runValidators:true` rejects the MongoDB write. Financial-aid plans can therefore save in memory but not to Mongo.
2. **The intervention log's own status is hard-coded `'Active'` (`lib/db.ts:151`)** even for a `Referred` plan, while the student record stores `'Referred'` — the two stores disagree about the same plan.
3. **Duplicate fallback logic (CONFIRMED).** The route `buildDeterministicFallback` and the client `generateFallbackExplanation` are two independent implementations of the same idea, so their wording can diverge.
4. **Outcome classification is duplicated** in `lib/db.ts:314-317` and `outcome/page.tsx` `buildOutcomeData`, creating a risk of drift if one is changed.
5. **`__awaiting__` is essentially unreachable (CONFIRMED).** `hasNewData` becomes true whenever `attendanceHistory.length > 0` (`lib/db.ts:324-327`), which is true for every seeded or uploaded student, so the "Awaiting New Data" state rarely/never renders.
6. **Subject recommendation reads legacy `subjectAttendance`.** The weakest-subject pick uses the flat `subjectAttendance` list; if a student only has weekly `attendanceHistory[].subjects`, the engine returns generic `Extra Class / Tutoring` (no subject), reducing recommendation quality. (SUSPECTED depends on data shape; CONFIRMED by code path.)
7. **`Other` action type files an empty `details` object.** If a mentor manually picks `Other`, the payload has no description field, and the outcome page's `Other` branch looks for `details.description` which is never set.
8. **`Parent/Guardian Notified` returns early**, so it never appears in the intervention list/outcome. This is intentional, but it means the plan is invisible on the outcome page even though a log was written.

---

*End of intervention & decision logic report. Read-only; no source files were modified.*
