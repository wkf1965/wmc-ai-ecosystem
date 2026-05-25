# WMC AI — Development Log

---

## Stage 4 — Stable Prototype (2026-05-20)

**Status:** Stabilization in progress

### Stabilization tasks completed
- Verified all 6 required API endpoints operational
- Added `GET /api/v1/dashboard/summary` — live aggregation (patients, alerts, tasks, escalations)
- Added `GET /api/v1/tasks/queue` — prioritised pending task queue (supervisor+)
- Added `GET /api/v1/supervisor/escalation-queue` — live escalation + refresh signal queue
- Added `GET /api/v1/supervisor/recent-activity` — latest audit log for shift monitoring
- Created `SYSTEM-STATUS.md` — full component/endpoint/module status reference
- Verified `http://localhost:3000/dashboard` loads live backend data
- Frontend offline banner and fallback data confirmed working
- All modules start cleanly with `pnpm run dev`

---

## Stage 3 — Central Backend Architecture (2026-05-20)

**Status:** ✅ Complete

### Authentication & RBAC
- JWT access token (15 min) + refresh token (7 days) with rotation
- Roles: admin, supervisor, nurse, therapist, doctor, frontdesk
- Middleware: `requireAuth`, `requireRole()`, convenience guards (nursingTeam, rehabTeam, crmTeam)
- Mock login: any `MOCK_USERS` email with any password in `AUTH_MODE=mock`
- Mock shortcut tokens: `mock-token-<role>` for direct API testing
- Files: `auth.routes.js`, `auth.controller.js`, `auth.service.js`, `auth.middleware.js`, `role.middleware.js`
- Prisma-ready `User` model + `UserRole` enum added to schema

### Audit Log & Medical Compliance
- `logAuditEvent(req, event)` helper — auto-extracts userId, role, IP from request
- 24 `AUDIT_ACTIONS` constants covering all clinical and operational events
- Append-only in-memory `AUDIT_STORE` seeded with 9 mock entries
- `GET /api/v1/audit/logs` with filters (module, action, userId, role, targetId, from/to)
- `GET /api/v1/audit/summary` — event counts by module, role, action
- Meta-audit: viewing audit logs is itself logged
- Instrumented: patients, nursing, alerts, tasks, auth controllers
- `MEDICAL-COMPLIANCE.md` — audit requirements, HIPAA considerations, production checklist
- Prisma-ready `AuditLog` model added to `core` schema

### Event Bus & Inter-Service Communication
- Node EventEmitter singleton — `emitEvent()` / `onEvent()` / `onceEvent()`
- 30 event types across 9 domains (`EVENT_TYPES` constants)
- 14 active listener registrations across auth, nursing, alerts, tasks, patients, rehab, CRM, notifications
- `NURSING_RECORD_CREATED` → audit + dashboard refresh + AI summary queue
- `DOCTOR_ESCALATION_TRIGGERED` → audit + Telegram mock alert + WhatsApp mock + escalation queue
- `VITAL_ALERT_TRIGGERED` → audit + Telegram mock notification + dashboard refresh
- `bootstrapEventListeners()` called at server startup
- In-memory `dashboard-state.js` (refresh signals, escalation queue)
- In-memory `ai-summary-queue.js` (job queue stub, BullMQ-ready)
- `EVENT-ARCHITECTURE.md` — design, listener map, Redis/RabbitMQ migration plan

### Database Architecture
- Prisma v6.x (pinned), `prisma/schema.prisma` — 12 models across 5 PostgreSQL schemas
- Models: `User`, `AuditLog`, `Patient`, `Staff`, `NursingRecord`, `HandoverLog`, `Task`, `Alert`, `RehabProgress`, `CrmLead`, `CrmAppointment`, `Notification`
- 7 repositories: patient, nursing, rehab, crm, task, alert, handover
- Each repository: `getAll`, `getById`, `create`, `update`, `delete` with Prisma/mock switch
- `src/lib/prisma.js` singleton (hot-reload safe)
- `DATABASE-ARCHITECTURE.md`, `AUTH-ARCHITECTURE.md`, `ARCHITECTURE-LAYERS.md`

---

## Stage 2 — API Gateway & Service Layer (2026-05-20)

**Status:** ✅ Complete

- `GET /api/v1` — gateway info with 17-module manifest
- `GET /api/v1/health` — liveness check with uptime
- Registered modules: auth, users, audit, events, supervisor, patients, nursing, rehab, crm, tasks, alerts, notifications, telegram, whatsapp, dashboard, ai-summary, reports
- Global `errorHandler` and `notFound` middleware
- `src/routes/v1/index.js` — central route dispatcher

---

## Stage 1 — Foundation (2026-05-20)

**Status:** ✅ Complete

- Monorepo structure: `wmc-ai-frontdesk`, `wmc-ai-nursing`, `wmc-ai-central-backend`, `wmc-ai-crm`, `wmc-ai-rehabilitation`, `wmc-ai-marketing`
- Central backend Express bootstrap — port 5000, `npm run dev`
- Environment config: `config/env.js`, `.env.example`
- Tailwind v3 setup for all frontends
- Frontdesk dashboard: connected to central backend health + nursing backend `:4000`
- Dashboard AI insights widgets: predictive risk, night shift, daily report, auto-handover, family queue
- Mock notification API: Telegram, WhatsApp, dashboard channels
- Mock CRM: leads, appointments, in-memory store
- Prisma skeleton: schema, scripts, `.env.example` placeholders
- `CENTRAL-BACKEND-BLUEPRINT.md`, `DATABASE-SCHEMA-BLUEPRINT.md`, `NOTIFICATION-INTEGRATION-BLUEPRINT.md`

---

## Dashboard Frontend Connection (Stage 4 addition)

- `src/lib/api/central-backend.client.ts` — `getHealth()`, `getApiInfo()`, `getPatients()`, `getTasksQueue()`, `getAlerts()`, `getEscalationQueue()`
- All 6 calls run in parallel via `Promise.all` — single fetch round-trip
- Live/Fallback badge on dashboard header
- Offline banner when backend unreachable
- Auto-refresh every 30 s + manual "Refresh Data" button
- `src/lib/api/config.ts` — `v1Url()`, `DEV_SUPERVISOR_TOKEN`
- Types: `LiveBackendData`, `BackendApiInfo`, `BackendPatientsResponse`, etc.

---

*See `SYSTEM-STATUS.md` for current component status and start commands.*
