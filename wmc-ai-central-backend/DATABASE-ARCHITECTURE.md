# WMC AI Central Backend — Database Architecture

**Location:** `D:\WMC-AI\wmc-ai-central-backend`  
**Engine:** PostgreSQL 15+  
**ORM:** Prisma 6.x  
**Schema file:** `prisma/schema.prisma`  
**Version:** 2.0 · 2026-05-20 (extended with RehabProgress, HandoverLog)  
**Status:** Schema valid ✅ · Client generated ✅ · Migration pending DB

**Related:**

- [DATABASE-SCHEMA-BLUEPRINT.md](./DATABASE-SCHEMA-BLUEPRINT.md) — original 24-table design
- [DATABASE-IMPLEMENTATION-PLAN.md](./DATABASE-IMPLEMENTATION-PLAN.md) — ORM decision log
- [POSTGRESQL-SETUP-GUIDE.md](./POSTGRESQL-SETUP-GUIDE.md) — local install + migration commands

---

## Overview

WMC AI Central Backend uses a **single PostgreSQL cluster** divided into **five logical schemas** (PostgreSQL namespaces / bounded contexts). All tables within each schema share a clear domain boundary. Cross-schema relationships are handled through explicit foreign keys at the application layer (Prisma relations).

```
PostgreSQL cluster: wmc_ai_db
├── core     — master identity (patients, staff)
├── nursing  — clinical records, tasks, alerts, handovers
├── rehab    — physiotherapy and rehabilitation progress
├── crm      — leads and appointment pipeline
└── notify   — outbound notification log
```

---

## Schema structure

### `core` — master identity

| Model | Table | Purpose |
|-------|-------|---------|
| `Patient` | `core.patients` | Single source of truth for every person receiving care |
| `Staff` | `core.staff` | Operational identity for nurses, doctors, therapists |

Every clinical or operational row in any other schema traces back to `core.patients` via `patient_id` and `core.staff` via `staff_id`.

**Patient key fields:**

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | `uuid_generate_v4()` |
| `mrn` | TEXT UNIQUE | Medical record number |
| `fullName` | TEXT | |
| `age` | INT | Denormalised; recalculate on update |
| `diagnosis` | TEXT | Primary clinical diagnosis |
| `roomNumber` | TEXT | Current ward/room |
| `mobilityStatus` | ENUM | `independent` · `assisted` · `wheelchair` · `bedbound` |
| `fallRiskLevel` | ENUM | `low` · `moderate` · `high` |
| `status` | ENUM | `active` · `discharged` · `deceased` |
| `deletedAt` | TIMESTAMPTZ | Soft delete — never hard-delete a patient row |

---

### `nursing` — clinical records and operations

| Model | Table | Purpose |
|-------|-------|---------|
| `NursingRecord` | `nursing.nursing_records` | Shift assessments: vitals, observations, side turning |
| `HandoverLog` | `nursing.handover_logs` | End-of-shift handover summary passed to next nurse |
| `Task` | `nursing.tasks` | Cross-domain work queue (nursing, rehab, CRM callbacks) |
| `Alert` | `nursing.alerts` | Rule-based clinical and operational alerts |

**NursingRecord key fields:**

| Field | Type | Notes |
|-------|------|-------|
| `patientId` | UUID FK → `core.patients` | Required |
| `staffId` | UUID FK → `core.staff` | Nullable — supports bot/system inserts |
| `nurseName` | TEXT | Denormalised for Telegram /handover summaries |
| `shift` | ENUM | `morning` · `afternoon` · `night` |
| `bloodPressure` | TEXT | e.g. `158/92` |
| `pulse` | INT | bpm |
| `temperature` | FLOAT | °C |
| `oxygen` | TEXT | SpO2 % |
| `painScore` | INT | 0–10 |
| `sideTurning` | TEXT | Compliance status cue |

**HandoverLog key fields:**

| Field | Type | Notes |
|-------|------|-------|
| `patientId` | UUID FK | Optional — log may cover whole shift |
| `nurseInCharge` | TEXT | Denormalised nurse name |
| `shift` | ENUM | Which shift is handing over |
| `summary` | TEXT | Narrative shift summary |
| `keyEvents` | JSONB | Array: `[{ time, event, patientId, notes }]` |
| `pendingTasks` | JSONB | Array of tasks passed to next shift |

**Task key fields:**

| Field | Type | Notes |
|-------|------|-------|
| `assignedToStaffId` | UUID FK → `core.staff` | Required |
| `domain` | TEXT | `nursing` · `crm` · `rehab` |
| `completed` | BOOLEAN | Convenience flag — mirrors `status = done` |
| `priority` | ENUM | `low` · `medium` · `high` · `urgent` · `critical` |

**Alert key fields:**

| Field | Type | Notes |
|-------|------|-------|
| `alertType` | TEXT | `vitals` · `turning` · `medication` · `fall` · `wound` |
| `severity` | ENUM | `low` · `medium` · `high` · `critical` |
| `resolved` | BOOLEAN | Convenience flag — mirrors `status = resolved` |
| `vitalsSnapshot` | JSONB | BP, HR, temp, SpO2 at alert time |

---

### `rehab` — physiotherapy and rehabilitation

| Model | Table | Purpose |
|-------|-------|---------|
| `RehabProgress` | `rehab.rehab_progress` | Per-session physio records: ROM, gait, muscle power |

**RehabProgress key fields:**

| Field | Type | Notes |
|-------|------|-------|
| `patientId` | UUID FK → `core.patients` | Required |
| `therapistName` | TEXT | Denormalised; links to Staff in a future phase |
| `musclePower` | INT | Oxford scale 0–5 |
| `rom` | INT | Range of motion in degrees |
| `gaitStatus` | ENUM | `normal` · `impaired` · `non_ambulatory` |
| `painScore` | INT | 0–10 |
| `progressNotes` | TEXT | Free-text session notes |
| `goals` | JSONB | `[{ goal, achieved, targetDate }]` |
| `outcome` | TEXT | `improved` · `stable` · `declined` |

---

### `crm` — leads and appointment pipeline

| Model | Table | Purpose |
|-------|-------|---------|
| `CrmLead` | `crm.crm_leads` | Prospective admission pipeline |
| `CrmAppointment` | `crm.crm_appointments` | Consultation and visit bookings |

**CrmLead key fields:**

| Field | Type | Notes |
|-------|------|-------|
| `fullName` | TEXT | Contact or family member |
| `phoneNumber` | TEXT | E.164 format preferred |
| `inquiryType` | TEXT | `nursing_home` · `rehab` · `day_care` · `palliative` · `other` |
| `leadStatus` | TEXT | `New` · `Contacted` · `Qualified` · `Converted` · `Lost` |
| `followUpDate` | TIMESTAMPTZ | Next scheduled follow-up |
| `convertedPatientId` | UUID FK → `core.patients` | Set when lead becomes an admitted patient |

---

### `notify` — outbound notifications

| Model | Table | Purpose |
|-------|-------|---------|
| `Notification` | `notify.notifications` | Unified log for all outbound sends (Telegram, WhatsApp, dashboard) |

**Notification key fields:**

| Field | Type | Notes |
|-------|------|-------|
| `channel` | ENUM | `telegram` · `whatsapp` · `dashboard` |
| `status` | ENUM | `queued` · `sent` · `failed` · `mock_sent` |
| `payload` | JSONB | Template variables and message body |
| `idempotencyKey` | TEXT UNIQUE | Deduplication across retries |
| `mock` | BOOLEAN | `true` during Phase 1–7 mock mode |

---

## Relationships

```
core.patients ──┬──< nursing.nursing_records
                ├──< nursing.handover_logs
                ├──< nursing.tasks
                ├──< nursing.alerts
                ├──< rehab.rehab_progress
                ├──< crm.crm_appointments
                ├──< notify.notifications
                └──< crm.crm_leads (as converted_patient_id)

core.staff    ──┬──< nursing.nursing_records
                ├──< nursing.handover_logs
                ├──< nursing.tasks (assigned_to / created_by)
                ├──< nursing.alerts (reported_by / acknowledged_by)
                ├──< crm.crm_leads (assigned_to)
                ├──< crm.crm_appointments (assigned_to)
                └──< notify.notifications

crm.crm_leads ──< crm.crm_appointments
crm.crm_leads ──< nursing.tasks (follow-up tasks)

nursing.nursing_records ──< nursing.alerts
```

### Key design rules

1. **`core.patients` is the root entity.** Every clinical table holds `patient_id`. Never store patient identity outside the `core` schema.
2. **`core.staff` is the actor.** All write operations link to the staff member who performed the action.
3. **Foreign keys enforce referential integrity** at the database level via Prisma relations.
4. **Soft delete on patients only.** Set `deleted_at` instead of hard-deleting. All other models use `status` flags.
5. **Denormalised name fields** (`nurseName`, `therapistName`, `nurseInCharge`) exist for performance on Telegram bot summaries and dashboard widgets — they mirror the FK target's `fullName` at write time.
6. **JSONB columns** (`keyEvents`, `pendingTasks`, `vitalsSnapshot`, `goals`, `payload`) allow structured but flexible storage without premature normalisation.

---

## Enums

| Enum | Schema | Values |
|------|--------|--------|
| `PatientStatus` | core | `active` · `discharged` · `deceased` |
| `StaffStatus` | core | `active` · `on_leave` · `inactive` |
| `FallRiskLevel` | core | `low` · `moderate` · `high` |
| `MobilityStatus` | core | `independent` · `assisted` · `wheelchair` · `bedbound` |
| `PriorityLevel` | core | `low` · `medium` · `high` · `urgent` · `critical` |
| `RecordStatus` | nursing | `draft` · `active` · `archived` · `cancelled` |
| `TaskStatus` | nursing | `pending` · `in_progress` · `done` · `cancelled` |
| `AlertSeverity` | nursing | `low` · `medium` · `high` · `critical` |
| `AlertStatus` | nursing | `open` · `acknowledged` · `resolved` |
| `ShiftType` | nursing | `morning` · `afternoon` · `night` |
| `GaitStatus` | rehab | `normal` · `impaired` · `non_ambulatory` |
| `NotificationStatus` | notify | `queued` · `sent` · `failed` · `mock_sent` |
| `NotificationChannel` | notify | `telegram` · `whatsapp` · `dashboard` |

---

## Migration flow

### Development (current phase)

```
1. Edit prisma/schema.prisma
         ↓
2. npx prisma validate          ← lint schema; fails fast
         ↓
3. npx prisma migrate dev --name <description>
         ↓
4. Prisma generates SQL in prisma/migrations/
         ↓
5. SQL applied to local wmc_ai_db
         ↓
6. npx prisma generate          ← regenerate JS client
         ↓
7. Services switch: source "mock" → source "database"
```

### Production (future)

```
CI pipeline (on merge to main)
         ↓
npx prisma migrate deploy       ← applies pending migrations only; never resets
         ↓
App deploy starts AFTER successful migration
```

**Rule:** `migrate dev` = development only. `migrate deploy` = staging/production only.

### First migration command (run when DB is ready)

```powershell
cd D:\WMC-AI\wmc-ai-central-backend

# Ensure .env has real DATABASE_URL and DATABASE_ENABLED=true
npx prisma migrate dev --name init
```

This creates `prisma/migrations/0001_init/migration.sql` which:
- Creates all five schemas
- Enables `uuid-ossp` extension
- Creates all enums
- Creates all tables with indexes and foreign keys

---

## Mock fallback architecture

```
DATABASE_ENABLED=false  →  withDatabaseOrMock() returns mock fixtures
DATABASE_ENABLED=true   →  withDatabaseOrMock() calls prisma.*.findMany()
Connection fails         →  automatic fallback to mock (logged as warning)
```

Every API response includes `"source": "mock" | "database"` — no code changes required to switch modes.

**Mock fallback remains active** until:
1. A real PostgreSQL database is provisioned
2. `DATABASE_ENABLED=true` is set in `.env`
3. `npx prisma migrate dev --name init` succeeds

---

## Indexes

Performance indexes are defined on all:
- Foreign key columns used in JOINs (`patient_id`, `staff_id`, `lead_id`)
- Status/enum columns used in queue queries (`status`, `severity`, `shift`)
- Date columns used in range queries (`shift_date`, `session_date`, `appointment_date`)
- Boolean convenience flags (`resolved`, `completed`, `fall_risk_level`)

---

## Future scalability

| Phase | Addition | Rationale |
|-------|----------|-----------|
| **Auth** | `core.users` table | Login, RBAC, JWT sessions |
| **Multi-facility** | `facility_id` on patients/staff | Row-level security per site |
| **AI jobs** | `ai.jobs`, `ai.results` tables | Async summary engine queue |
| **Audit log** | `core.audit_log` (append-only) | Healthcare compliance trail |
| **Read replica** | Second connection string | Dashboard/reporting queries offloaded |
| **Archival** | Partition `nursing_records` by year | Table size management |
| **Search** | `pg_trgm` trigram indexes on `full_name` | Fast patient name search |
| **Webhooks** | `notify.webhook_logs` | Third-party integration receipts |

### Multi-schema approach benefits

- **Bounded context isolation** — nursing engineers and CRM engineers can work on their schema independently
- **Permission scoping** — DB roles can be granted per-schema (`wmc_nursing_api` vs `wmc_crm_api`)
- **Future service extraction** — if nursing becomes a standalone service, its schema migrates with it cleanly

---

## File reference

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Authoritative schema — 9 models, 13 enums, 5 schemas |
| `src/config/prisma.js` | Prisma client singleton + mock fallback toggle |
| `src/shared/utils/data-source.js` | `withDatabaseOrMock()` helper used by all services |
| `src/shared/mocks/domain-mock-data.js` | Seeded mock fixtures (Ah Chong, Mary Lim, John Tan) |
| `databases/migrations/` | Future: applied SQL migration history |
| `databases/seeds/` | Future: dev seed SQL and demo JSON |

---

*Schema validated ✅ — `npx prisma migrate dev --name init` ready to run once PostgreSQL is provisioned.*
