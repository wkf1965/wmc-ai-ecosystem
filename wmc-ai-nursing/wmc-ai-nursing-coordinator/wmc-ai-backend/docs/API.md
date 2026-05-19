# HTTP API reference

Base URL: `{origin}{API_PREFIX}` (default `API_PREFIX=/api/v1`).

Authentication: **`Authorization: Bearer <token>`** (JWT or configured demo token for admin) on all routes except `POST /auth/login` and **`GET /api/v1`** (service catalog).

**Demo admin** (after `npm run seed`): `POST /auth/login` body **exactly**  
`{ "email": "admin@wmc.local", "password": "password123" }`  
(email trimmed + lowercased; password must match character-for-character).

---

## Auth

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/auth/login` | — | Body: `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | any | Current user (from JWT) |

---

## Patients

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/patients` | any authenticated | List patients |
| POST | `/patients` | admin, receptionist, doctor, nurse | Create |
| GET | `/patients/:id` | any authenticated | Detail |
| PATCH | `/patients/:id` | admin, doctor, nurse, receptionist | Update (incl. `medicalSummary`) |

---

## CRM (leads)

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/crm/leads` | any authenticated | List |
| POST | `/crm/leads` | admin, receptionist, doctor | Create (source e.g. `whatsapp`, `google_form`) |
| GET | `/crm/leads/:id` | any authenticated | Detail |
| PATCH | `/crm/leads/:id` | admin, receptionist, doctor | Update status, pipeline, `followUpAt`, etc. |

---

## Nursing

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET/POST | `/nursing/daily-reports` | admin, doctor, nurse | Shift narratives |
| GET/POST | `/nursing/vitals` | admin, doctor, nurse | Vital signs rows |
| GET | `/nursing/records` | admin, doctor, nurse | Structured in-memory assessments (sorted newest first) |
| POST | `/nursing/records` | admin, doctor, nurse | Structured in-memory assessment: `patientId` (free string e.g. `P001`), `patientName`, `nurseName`, vitals, ADL/text fields; optional `createdAt` ISO |
| POST | `/nursing/quick-record` | admin, doctor, nurse | Legacy friendly vitals → `vital_signs` (`patientName`, etc.) |
| GET/POST | `/nursing/medications` | admin, doctor, nurse | Medication admin / list |
| GET/POST | `/nursing/alerts` | admin, doctor, nurse | Abnormal alerts; `photoUrlPlaceholder` for images |
| GET | `/nursing/doctor-review-queue` | admin, doctor | Queue |
| POST | `/nursing/doctor-review-queue` | admin, nurse | Enqueue |
| PATCH | `/nursing/doctor-review-queue/:id` | admin, doctor | `{ status }` |

---

## Medication (MAR alerts)

Roles: **admin, doctor, nurse**. Rule-based MAR screening (**no persistence**).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/medication/check-alert` | Body: **`patientName`**, **`medicationName`**, **`scheduledTime`**, **`givenTime`** (`HH:mm`), **`doseGiven`**, **`missedDose`**, **`allergy`**, **`bloodPressure`**, optional **`notes`** → **`alertLevel`**, **`alerts[]`**, **`recommendations[]`** |

---

## Side turning tracking

Roles: **admin, doctor, nurse**. In-memory repositioning log (**no persistence**).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/turning/records` | List records (newest `createdAt` first) |
| POST | `/turning/records` | Create record → **`message`**, **`record`** (includes **`nextTurningTime`** = `turningTime` + 2h), optional **`alert`** when **`photoRequired`** & !**`photoUploaded`**, **`nextTurningTime`** echo |

---

## Nurse shift (OT calculation)

Roles: **admin, doctor, nurse**. In-memory roster OT snapshots (**no persistence**). Same-day **`HH:mm`** times only.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/nurse-shift/calculate-ot` | Body: **`nurseName`**, **`shiftDate`**, **`shiftStart`**, **`shiftEnd`**, **`actualClockIn`**, **`actualClockOut`**, **`breakMinutes`**, optional **`notes`** → **`regularHours`** (scheduled span − break), **`overtimeHours`** (minutes after **`shiftEnd`** ÷ 60), **`lateMinutes`**, **`earlyClockInMinutes`**, **`message`**, **`record`** |
| GET | `/nurse-shift/records` | List saved calculations (newest first) |

---

## Vitals (analyze)

Roles: **admin, doctor, nurse**. Rule-based bedside vital screening (**no persistence**). Distinct from **`/nursing/vitals`** persistence routes.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/vitals/analyze` | Body: **`patientName`**, **`bloodPressure`** (`Sys/Dia`), **`pulse`**, **`temperature`**, **`oxygen`** (%), **`painScore`** (0–10), optional **`notes`** → **`alertLevel`** (`Low` \| `Medium` \| `High`), **`abnormalSigns[]`**, **`recommendations[]`** |

---

## Wound monitoring

Roles: **admin, doctor, nurse**. Rule-based wound screening + **in-memory** assessments (sorted newest first).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/wound/assessment` | Body: **`patientId`**, **`patientName`**, **`nurseName`**, **`woundLocation`**, booleans **`redness`**, **`swelling`**, **`discharge`**, **`odor`**, **`painScore`** (0–10), **`woundSize`**, **`dressingChanged`**, **`photoUploaded`**, optional **`notes`** → **`message`**, **`assessment`** (persisted row incl. **`infectionRisk`**, **`alerts[]`**, **`recommendations[]`**), echoed **`infectionRisk`**, **`alerts[]`**, **`recommendations[]`** |
| GET | `/wound/assessments` | **`assessments[]`** — full saved rows |

---

## Family updates

Roles: **admin, doctor, nurse**. **`POST`** rule-based summaries for relatives (**no persistence**). **`GET`** builds a prioritized **communication queue** from coordinators (**cold-start mock** when buffers are empty).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/family/update` | Body: **`patientName`**, **`condition`**, **`mood`**, **`appetite`**, **`mobility`**, **`vitalStatus`**, **`rehabCompleted`**, **`sideTurningCompleted`**, optional **`notes`** → **`familyUpdate`** (readable paragraph), **`status`** (`Stable` \| `Attention` \| `Critical`), **`recommendedFamilyAction`** |
| GET | `/family/communication-queue` | **No body.** Per-patient **`queue[]`** (**`priority`**: `Urgent` \| `High` \| `Medium` \| `Low`, **`reason`**, **`recommendedMessage`**), rollup **`summary`**, **`recommendedActions[]`**. Signals: doctor escalation, emergencies, incidents, vital alerts, wound status, falls / PU, agitation, rehab progress (**Sheets-backed** **`rehab_sessions`**), family reminders. |

---

## Doctor escalation

Roles: **admin, doctor, nurse**. Rule-based review triage (**no persistence**).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/escalation/check` | Body: **`patientName`**, **`bloodPressure`** (`Sys/Dia`), **`pulse`**, **`temperature`**, **`oxygen`** (%), **`painScore`** (0–10), **`mood`**, **`mobility`**, **`woundCondition`**, optional **`notes`** → **`escalationRequired`**, **`priority`** (`Low` \| `Medium` \| `High` \| `Urgent`), **`reasons[]`**, **`recommendedActions[]`** |

---

## Emergency response

Roles: **admin, doctor, nurse**. Rule-based acute composite triage (**no persistence**): hypoxia, shock / hypotension pattern, hypertension crisis, fever, respiratory distress, consciousness loss.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/emergency/respond` | Body: **`patientName`**, **`eventType`**, **`bloodPressure`** (`Sys/Dia`), **`pulse`** (40–220), **`temperature`**, **`oxygen`** (% SpO₂), **`consciousness`**, **`breathingDifficulty`**, optional **`notes`** → **`emergencyLevel`** (`Low` \| `Medium` \| `High` \| `Critical`), **`detectedEmergencies[]`**, **`immediateActions[]`**, **`aiSummary`**, **`responseTimePriority`** (`Routine` \| `Standard` \| `Urgent` \| `Immediate`) |

---

## Central command center

Roles: **admin, doctor, nurse**. Rolls up **dashboard**, **supervisor queue**, **nurse tasks**, **night-shift monitor**, **incidents**, and **bulletin acknowledgements** into one facility snapshot. Uses the same cold-start rule as dashboards: **full mock** when nursing / turning / wound buffers plus incidents and announcements stores are empty.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/command-center/status` | **`facilityStatus`** (`Stable` \| `Attention Required` \| `High Alert` \| `Critical`), **`summary`** (facility-wide counters), **`criticalPatients[]`**, **`operationalAlerts[]`**, **`recommendedActions[]`**, **`systemHealth`** (static **Online / Running**) |

---

## Reports (facility daily)

Roles: **admin, doctor, nurse**. Builds a management-oriented **daily facility report** by aggregating **command center**, **family communication queue**, **handover auto-generate**, **night-shift monitor**, **OT records**, wound counts, and nursing **side-turning** signals. Uses the **same cold-start mock rule** as the command center (empty nursing clinical records, turning log, wounds, incidents, announcements).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/reports/daily-facility` | **`reportDate`** (`YYYY-MM-DD`), **`facilityStatus`**, **`executiveSummary`**, **`shiftHandoverStatus`**, **`keyMetrics`** (**`totalPatients`**, **`highRiskPatients`**, **`emergencyCases`**, **`doctorEscalations`**, **`incidentReports`**, **`pendingTasks`**, **`medicationAlerts`**, **`woundCases`**, **`totalOTHours`**), **`riskHighlights[]`**, **`staffHighlights[]`**, **`familyCommunicationSummary[]`**, **`managementRecommendations[]`** |

---

## Dashboard

Roles: **admin, doctor, nurse**. Supervisor overview aggregated from **sheet-backed patients** plus **in-memory** nursing records, turning logs, and wound assessments. When **all** three in-memory coordinators are empty, returns a stable **mock** snapshot.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/summary` | **`totalPatients`**, **`highRiskPatients[]`**, **`pendingTasks[]`**, **`alerts`** (`fallRisk`, `pressureUlcerRisk`, `vitalAlerts`, `woundAlerts`, `medicationAlerts`, `doctorEscalations`), **`shiftStatus`** (`Stable` \| `Attention Required`) |

---

## Tasks (nurse queue)

Roles: **admin, doctor, nurse**. Live task list derived from in-memory **`/nursing/records`**, **`/turning/records`**, **`/wound/assessment`** rows plus the existing **risk / vitals / escalation** rule engines. When **all** three coordinators are empty, returns a canned **demo queue**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks/queue` | **`tasks[]`** (`priority`: `Urgent` \| `High` \| `Medium` \| `Low`, **`patientName`**, **`task`**, **`dueTime`**, **`source`**) sorted Urgent-first; **`summary`** (`urgentTasks`, `highPriorityTasks`, `mediumPriorityTasks`, `totalTasks`) |

---

## Reminders (nurse scheduler)

Roles: **admin, doctor, nurse**. In-memory scheduled reminders (**no persistence across restarts**). **`repeatEveryHours`** yields **`nextReminderTime`** (`HH:mm`, same calendar day wrap).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/reminders/create` | Body: **`patientName`**, **`reminderType`** (`Side Turning` \| `Medication` \| `Wound Check` \| `Vitals Recheck` \| `Doctor Follow-up` \| `Family Update`), **`task`**, **`dueTime`** (`HH:mm`), **`assignedTo`**, **`priority`** (`Low` \| `Medium` \| `High` \| `Urgent`), optional **`repeatEveryHours`**, optional **`notes`** → **`message`**, stored **`reminder`**, optional **`nextReminderTime`**, optional **`alert`** when priority is **`High`** or **`Urgent`** (**`201`**) |
| GET | `/reminders/list` | **`reminders[]`** — newest `createdAt` first |

---

## Announcements (shift / supervisor notices)

Roles: **admin, doctor, nurse**. In-memory announcements (**no persistence across restarts**). Each record includes **`acknowledgements[]`** (initially empty). Use **`POST /announcements/acknowledge`** to append `{ announcementId (UUID), acknowledgedBy }` when **`requiresAcknowledgement`** is true.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/announcements/create` | Body: **`title`**, **`message`**, **`createdBy`**, **`priority`** (`Low` \| `Medium` \| `High` \| `Urgent`), **`targetShift`** (`Morning Shift` \| `Evening Shift` \| `Night Shift` \| `All Shifts`), **`requiresAcknowledgement`** → **`message`**, **`announcement`** (includes **`acknowledgements[]`**), **`alert`** summary (**`201`**) |
| GET | `/announcements/list` | **`announcements[]`** — newest `createdAt` first |
| POST | `/announcements/acknowledge` | Body: **`announcementId`** (UUID), **`acknowledgedBy`** → **`announcement`** with updated **`acknowledgements[]`** (**`200`**) |

---

## Nurse acknowledgements (cross-cutting tracking)

Roles: **admin, doctor, nurse**. In-memory log of acknowledgement events for **announcements**, **urgent alerts**, and **handover tasks** (select via optional **`itemType`**, defaults to **`Announcement`**). **`acknowledged`** drives echo **`status`**: **`Confirmed`** or **`Pending`**.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/acknowledgements/confirm` | Body: **`nurseName`**, **`announcementId`** (any string id such as `ANN-001`), **`announcementTitle`**, **`acknowledged`**, **`acknowledgedAt`**, optional **`itemType`** (`Announcement` \| `Urgent Alert` \| `Handover Task`), optional **`notes`** → **`message`**, persisted **`record`**, echoed **`status`** (**`201`**) |
| GET | `/acknowledgements/list` | **`acknowledgements[]`** — newest server `createdAt` first |

---

## Supervisor (escalation queue)

Roles: **admin, doctor, nurse**. Aggregated supervisor view (**read-only**) built from **`/tasks/queue`** engines when nursing / turning / wound stores have data (doctor escalation, vitals, fall, pressure injury, MAR cues, wounds, turning), plus **wandering**, **bed exit**, **incident reports**, and **announcements pending acknowledgement**. When coordinator buffers plus incidents/announcements are **all empty**, returns a stable **demo** queue.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/supervisor/escalation-queue` | **`queue[]`** (`priority`, **`patientName`**, **`issue`**, **`source`**, **`recommendedAction`**) sorted **Urgent → Low**; **`summary`** (**`urgentCases`**, **`highRiskCases`**, **`mediumRiskCases`**, **`totalQueueItems`**); **`systemStatus`** (`Stable` \| `Attention Required` \| `Critical`) |

---

## Night shift (monitor)

Roles: **admin, doctor, nurse**. Night-shift-oriented rollup: **bed-exit alerts**, **wandering risk**, **low oxygen**, **fever**, **pending side turning** (nursing cues + PU high + turning photos), **unacknowledged High/Urgent bulletins**, **fall risk**, **doctor escalations** (from latest in-memory **`/nursing/records`**). When coordinator buffers + incidents + announcements are **all empty**, returns a stable **demo** summary.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/night-shift/monitor` | **`nightShiftSummary`** (**`highRiskPatients[]`**, **`pendingTasks[]`**, **`criticalAlerts[]`**, **`unacknowledgedAlerts`**, **`doctorEscalations`**), **`recommendations[]`**, **`systemStatus`** (`Stable` \| `Attention Required` \| `Critical`) |

---

## Incidents

Roles: **admin, doctor, nurse**. In-memory incident log with rule-based **`incidentSeverity`** (`Low` \| `Medium` \| `High` \| `Critical`), template **`aiSummary`**, **`recommendedActions[]`** (surface pending family outreach when unchecked).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/incidents/report` | Body: **`patientName`**, **`incidentType`**, **`incidentTime`**, **`location`**, **`reportedBy`**, **`injuryDetected`**, optional **`injuryDetails`**, **`vitalStatus`**, **`doctorInformed`**, **`familyInformed`**, optional **`notes`** → **`message`**, echoed **`incidentSeverity`**, **`aiSummary`**, **`recommendedActions[]`**, persisted **`report`** |
| GET | `/incidents/reports` | **`reports[]`** — newest `createdAt` first |

---

## Shift handover

Roles: **admin, doctor, nurse**. **`POST`** uses explicit snapshots (**no persistence**). **`GET /auto-generate`** pulls from **in-memory coordinators / engines**, or returns a stable **cold-start demo** matching onboarding.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/handover/generate` | Body: **`shift`**, **`nurseInCharge`**, **`records`** (array of patient snapshots: vitals, mood, mobility, `sideTurning`, `woundCondition`, optional `notes`) → **`handoverSummary`**, **`highRiskPatients`**, **`pendingTasks`**, **`shiftStatus`** (`Stable` \| `Attention Required`) |
| GET | `/handover/auto-generate` | **No body.** Aggregates coordinators + deterministic engines (**nursing `/records`**, vitals/alerts, fall / PU risk, meds cues, wounds, incidents, supervisor queue, nurse tasks, night rollup, emergencies) → **`shift`**, **`generatedAt`** (server local `YYYY-MM-DD HH:mm`), **`overallShiftStatus`** (`Stable` \| `Attention Required` \| `Critical`), **`highRiskPatients[]`** (**`patientName`**, **`issues[]`**), **`pendingTasks[]`**, **`criticalAlerts[]`**, **`recommendations[]`**, **`preparedByAI`**: **`true`** (rule engine placeholder). Uses **cold-start mock** when nursing / turning / wound buffers plus incidents / announcements stores are empty. |

---

## Risk (clinical scoring)

Roles: **admin, doctor, nurse, therapist, receptionist**. Deterministic weighted scores (**no persistence**).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/risk/fall-score` | Body: `patientName`, `mobility`, `mood`, `painScore` (0–10), `oxygen` (%), booleans **`historyOfFalls`**, **`walkingAssist`**, **`confusion`**, **`age`** → **`fallRiskScore`**, **`riskLevel`** (`Low` \| `Moderate` \| `High`), **`riskFactors[]`**, **`recommendations[]` |
| POST | `/risk/pressure-ulcer` | Body: **`patientName`**, **`bedbound`**, **`sideTurningCompleted`**, **`nutritionStatus`**, **`skinCondition`**, **`moisture`**, **`mobility`**, **`age`**, **`incontinence`** → **`pressureUlcerRiskScore`**, **`riskLevel`**, **`riskFactors[]`**, **`recommendations[]` |
| POST | `/risk/wandering` | Body: **`patientName`**, **`age`**, **`diagnosis`**, booleans **`confusion`**, **`agitation`**, **`nightRestlessness`**, **`historyOfWandering`**, **`mobility`**, **`sleepPattern`**, optional **`notes`** → **`wanderingRiskScore`**, **`riskLevel`** (`Low` \| `Medium` \| `High`), **`riskFactors[]`**, **`recommendations[]`**, **`aiSummary`** (rule-based narrative) |
| POST | `/risk/bed-exit` | Body: **`patientName`**, **`age`**, **`mobility`**, **`confusion`**, **`fallRiskLevel`**, **`wanderingRiskLevel`** (`Low` \| `Medium` \| `High` each), **`bedExitAttempt`**, optional **`timeOfAttempt`** (`HH:mm`), **`nightShift`**, optional **`notes`** → **`bedExitAlertLevel`** (`Low` \| `Medium` \| `High` \| `Urgent`), **`alertReasons[]`**, **`recommendedActions[]`**, **`aiSummary`** |

---

## Rehabilitation

Prefix **`/rehabilitation`** or alias **`/rehab`**. Roles: **admin, doctor, therapist**.

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/rehabilitation/sessions` | List / create session |
| GET | `/rehabilitation/sessions/:id` | Detail |
| PATCH | `/rehabilitation/sessions/:id/ai-summary` | Attach stub AI summary |
| POST | `/rehabilitation/progress` | Friendly create (`patientName`, etc.) |

---

## AI (stubs)

All authenticated roles. Placeholder pipelines until LLM wiring: **structured** `/ai/summary` returns JSON only (not stored); legacy note-only `/ai/summary` and other AI routes persist to `ai_results`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai/patient-summary` | `{ patientId }` |
| POST | `/ai/summary` | Structured nursing observation → **`{ summary, riskLevel, nextAction }`** (rule-based, not persisted); **or** legacy note-only `{ patientId }` **or** `{ patientName, notes }` stub persisted to `ai_results` |
| POST | `/ai/classify-lead` | `{ notes }` |
| POST | `/ai/follow-up-message` | `{ context }` |
| POST | `/ai/nursing-alert-summary` | `{ description }` |
| POST | `/ai/rehab-progress-report` | `{ sessionIds }` |

---

## Meta

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1` | JSON service catalog (no auth) |
| GET | `/health` | Liveness |

---

For request bodies, see `data/samples/sample-api-bodies.json` and `data/samples/api-examples.http`.
