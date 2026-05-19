# wmc-ai-backend

Modular **Node.js + Express + TypeScript** API for **Wong Medical Centre (WMC) AI** operations: CRM, nursing coordinator, rehabilitation tracking, and AI assistant stubs.

## Features

| Module | Routes (prefix `/api/v1`) | Notes |
|--------|---------------------------|--------|
| **Auth** | `POST /auth/login`, `GET /auth/me` | JWT; roles: `admin`, `doctor`, `nurse`, `receptionist`, `therapist` |
| **Patients** | `GET/POST /patients`, `GET/PATCH /patients/:id` | Basic demographics + `medicalSummary` |
| **CRM** | `GET/POST /crm/leads`, `GET/PATCH /crm/leads/:id` | Lead source, status, pipeline, follow-up |
| **Nursing** | `/nursing/daily-reports`, `/vitals`, **`/records`** (friendly vitals + `patientName`), `/medications`, `/alerts`, `/doctor-review-queue` | Alerts include photo URL placeholder |
| **Medication** | **`POST /medication/check-alert`** | Rule-based medication timing / allergy / BP / notes alerts |
| **Turning** | **`GET/POST /turning/records`** | In-memory side-turning log + **nextTurningTime** (+2h) + optional photo alert |
| **Nurse shift** | **`POST /nurse-shift/calculate-ot`**, **`GET /nurse-shift/records`** | Scheduled vs actual clock times → regular hours, OT after roster end, late / early clock-in |
| **Vitals** | **`POST /vitals/analyze`** | Rule-based abnormal vitals + tiered **`alertLevel`** (`Low` / `Medium` / `High`) |
| **Wound** | **`POST /wound/assessment`**, **`GET /wound/assessments`** | In-memory wound assessments + rule-based **`infectionRisk`** (`Low` / `Medium` / `High`), **`alerts[]`**, **`recommendations[]`** |
| **Family** | **`POST /family/update`**, **`GET /family/communication-queue`** | **`familyUpdate`** text vs prioritized **family touchpoint queue** (`reason`, `recommendedMessage`) |
| **Escalation** | **`POST /escalation/check`** | Doctor-review triage: **`escalationRequired`**, **`priority`** (`Low`–`Urgent`), **`reasons[]`**, **`recommendedActions[]`** |
| **Emergency** | **`POST /emergency/respond`** | Acute composite: **`detectedEmergencies[]`**, **`emergencyLevel`**, **`immediateActions[]`**, **`aiSummary`**, **`responseTimePriority`** (rule-based) |
| **Command center** | **`GET /command-center/status`** | Facility-wide rollup: **`facilityStatus`**, **`summary`**, **`criticalPatients[]`**, **`operationalAlerts[]`**, **`recommendedActions[]`**; mock when coordinators are cold |
| **Reports** | **`GET /reports/daily-facility`** | Management daily rollup: **`keyMetrics`**, narratives (**`executiveSummary`**, **`riskHighlights[]`**, **`staffHighlights[]`**, **`familyCommunicationSummary[]`**, **`managementRecommendations[]`**), **`shiftHandoverStatus`**; mock when same cold-start rule as command center |
| **Dashboard** | **`GET /dashboard/summary`** | Supervisor rollup + **`shiftStatus`**; **mock snapshot** until nursing `/records`, `/turning/records`, or `/wound/assessment` data exists |
| **Tasks** | **`GET /tasks/queue`** | Auto-generated nursing task queue (priorities + **`summary`**); demo queue when those stores are cold |
| **Reminders** | **`POST /reminders/create`**, **`GET /reminders/list`** | In-memory nurse reminders + optional **`repeatEveryHours`** → **`nextReminderTime`**; **`alert`** for **`High` / `Urgent`** priority |
| **Announcements** | **`POST /announcements/create`**, **`GET /announcements/list`**, **`POST /announcements/acknowledge`** | Supervisor shift notices; priorities + target shift; **`acknowledgements[]`** tracking |
| **Acknowledgements** | **`POST /acknowledgements/confirm`**, **`GET /acknowledgements/list`** | Nurse confirmation log (**`Confirmed`** / **`Pending`**) + client **`acknowledgedAt`**; **`itemType`** for announcements / urgent alerts / handover tasks |
| **Supervisor** | **`GET /supervisor/escalation-queue`** | Centralised **`queue`** (**Urgent→Low**) from coordinator engines + incidents + pending announcement acks; demo data when buffers are cold |
| **Night shift** | **`GET /night-shift/monitor`** | Night-focused **`highRiskPatients`**, **`criticalAlerts`**, **`pendingTasks`**, **`recommendations`**, bulletin ack counts |
| **Incidents** | **`POST /incidents/report`**, **`GET /incidents/reports`** | In-memory incident log + **`aiSummary`** template + **`recommendedActions[]`** by severity |
| **Handover** | **`POST /handover/generate`**, **`GET /handover/auto-generate`** | Manual snapshot handover vs **facility auto-rollup** (`overallShiftStatus`, structured `highRiskPatients[]`, `criticalAlerts`) |
| **Risk** | **`POST /risk/fall-score`**, **`POST /risk/pressure-ulcer`**, **`POST /risk/wandering`**, **`POST /risk/bed-exit`** | Rule-based composites: fall risk, pressure-ulcer risk, **wandering / elopement** risk + **`aiSummary`**; **bed-exit** nurse alert (**`Low` \| `Medium` \| `High` \| `Urgent`**) |
| **Rehabilitation** | `GET/POST /rehabilitation/sessions`, **`POST /rehab/progress`** (alias paths), `PATCH .../ai-summary` | Pain score, mobility/therapist notes; `/progress` accepts `patientName` |
| **AI** | `POST /ai/patient-summary`, **`/summary`** (structured vitals → rule-based **`summary` / `riskLevel` / `nextAction`**, or legacy `patientName` + `notes` stub → `ai_results`), `/classify-lead`, `/follow-up-message`, `/nursing-alert-summary`, `/rehab-progress-report` | Structured summary in-memory only; stubs persist |

## Persistence (temporary)

- **Default (`SHEETS_MODE=file`):** JSON file `DATA_DIR/wmc-ai-store.json` with **tabs** matching PostgreSQL tables / Google worksheets (`users`, `patients`, `crm_leads`, …).
- **Google Sheets (`SHEETS_MODE=google`):** Enable **Sheets API** in Google Cloud, create a service account, download JSON keys, create a spreadsheet and **share it with the service account email (Editor)**. Set `GOOGLE_SHEETS_SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` (or `GOOGLE_APPLICATION_CREDENTIALS`). Each worksheet name matches a tab in `src/db/sheet-tabs.ts`; **column A** holds one JSON object per row (same shape as seed objects).
- **PostgreSQL (later):** Map the same entities to `docs/schema/postgresql.sql` via a repository layer (see `docs/MIGRATION.md`).

- **Dev API testing (no Bearer):** With `NODE_ENV=development` (`npm run dev`), these routes use a synthetic admin: `GET/POST /patients`, `POST /crm/leads`, **`GET/POST /nursing/records`**, `POST /nursing/quick-record`, `POST /rehab/progress` (+ `POST /rehabilitation/progress`), `POST /ai/summary`, **`POST /handover/generate`**, **`GET /handover/auto-generate`**, **`POST /risk/fall-score`**, **`POST /risk/pressure-ulcer`**, **`POST /risk/wandering`**, **`POST /risk/bed-exit`**, **`POST /medication/check-alert`**, **`GET/POST /turning/records`**, **`POST /nurse-shift/calculate-ot`**, **`GET /nurse-shift/records`**, **`POST /vitals/analyze`**, **`POST /wound/assessment`**, **`GET /wound/assessments`**, **`POST /family/update`**, **`GET /family/communication-queue`**, **`POST /escalation/check`**, **`POST /emergency/respond`**, **`GET /command-center/status`**, **`GET /reports/daily-facility`**, **`GET /dashboard/summary`**, **`GET /tasks/queue`**, **`POST /reminders/create`**, **`GET /reminders/list`**, **`POST /announcements/create`**, **`GET /announcements/list`**, **`POST /announcements/acknowledge`**, **`POST /acknowledgements/confirm`**, **`GET /acknowledgements/list`**, **`GET /supervisor/escalation-queue`**, **`GET /night-shift/monitor`**, **`POST /incidents/report`**, **`GET /incidents/reports`**.

### Google Cloud quick checklist

1. Create project → APIs & Services → enable **Google Sheets API**.  
2. IAM → Service Accounts → create keys (JSON).  
3. Google Sheets → new spreadsheet → **Share** → add the service account client email with **Editor**.  
4. Copy the spreadsheet ID from the URL into `GOOGLE_SHEETS_SPREADSHEET_ID`.

## Setup

```bash
cd wmc-ai-backend
cp .env.example .env
npm install
npm run seed        # creates demo users + patients (password: password123)
npm run dev         # http://localhost:4000
```

- API base: `http://localhost:4000/api/v1` — **`GET /api/v1`** returns module/route discovery JSON  
- Health: `GET http://localhost:4000/health`

### Restart after code or `.env` changes

Stop the dev server (**Ctrl+C** in the terminal), then start it again:

```bash
npm run dev
```

### Demo admin login (`POST /api/v1/auth/login`)

Use this JSON body **exactly** (password is case-sensitive; email is trimmed and lowercased):

```json
{ "email": "admin@wmc.local", "password": "password123" }
```

Requires a seeded store (`npm run seed`) so the `admin` user exists.

## Demo accounts (after seed)

All passwords: **`password123`**

- `admin@wmc.local`, `doctor@wmc.local`, `nurse@wmc.local`, `receptionist@wmc.local`, `therapist@wmc.local`

## Sample requests

- `GET /api/v1` — JSON catalog of modules (no auth; for smoke tests / tooling)  
- `data/samples/sample-api-bodies.json` — JSON payloads  
- `data/samples/sample-store-snapshot.json` — shape of the file-backed store (tabs ↔ worksheets)  
- `data/samples/api-examples.http` — REST Client examples  
- **`docs/API.md`** — route table

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` | `tsc` → `dist/` |
| `npm run start` | `node dist/server.js` |
| `npm run seed` | Write demo data to file store |
| `npm run test` | Smoke tests (`tests/smoke.test.ts`) |

## Project layout

```
wmc-ai-backend/
├── src/
│   ├── app.ts                 # Express app + route mounting
│   ├── server.ts              # HTTP listen
│   ├── config/env.ts
│   ├── db/
│   │   ├── index.ts             # sheetDb factory (file | google)
│   │   ├── sheet-tabs.ts        # Worksheet / table names
│   │   ├── sheet-db.interface.ts
│   │   ├── file-sheet-db.ts
│   │   └── google-sheet-db.ts
│   ├── middleware/
│   │   ├── auth.ts              # JWT + requireRoles (+ demo Bearer)
│   │   ├── apiAuth.middleware.ts # api.use — auth all /api/v1 except catalog + login
│   │   ├── asyncHandler.ts
│   │   └── errorHandler.ts
│   ├── types/domain.ts
│   └── modules/
│       ├── meta/                # GET /api/v1 catalog
│       ├── auth/
│       ├── patients/
│       ├── crm/
│       ├── nursing/
│       ├── rehabilitation/
│       └── ai/
├── data/
│   ├── store/                   # gitignored JSON (after seed); .gitkeep keeps folder
│   └── samples/
│       ├── sample-api-bodies.json
│       ├── sample-store-snapshot.json  # Example file-store shape (after seed)
│       └── api-examples.http
├── docs/
│   ├── API.md                   # HTTP reference
│   ├── ARCHITECTURE.md          # Module diagram + persistence
│   ├── schema/postgresql.sql    # Target relational schema
│   └── MIGRATION.md
├── tests/
│   └── smoke.test.ts
├── scripts/seed-local-db.ts
├── package.json
└── README.md
```

## Security notes

- Change **`JWT_SECRET`** in `.env` for any shared environment.
- Passwords are **bcrypt**-hashed in seed data.
- Add rate limiting, HTTPS termination, and audit logging before production.

## License

Private / internal — Wong Medical Centre AI.
