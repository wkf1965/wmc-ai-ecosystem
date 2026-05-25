# WMC AI Central Backend — Dev Log

---

## 2026-05-20 · Stage 4 — Stabilization

### Missing endpoints added
- `GET /api/v1/dashboard/summary` — live aggregation (patients, alerts, tasks, escalations)
- `GET /api/v1/tasks/queue` — prioritised pending task queue (supervisor+)
- `GET /api/v1/supervisor/escalation-queue` — live escalation + refresh signals
- `GET /api/v1/supervisor/recent-activity` — audit log slice for shift monitoring
- `src/modules/supervisor/supervisor.routes.js` created and registered

### Documentation
- Created `SYSTEM-STATUS.md` at workspace root
- Updated `DEV-LOG.md` at workspace root with Stage 1–4 history

---

## 2026-05-20 · Stage 3 — Auth, Audit, Event Bus

### Authentication & RBAC
- `jsonwebtoken` + `bcryptjs` installed
- `src/modules/auth/` — `auth.service.js`, `auth.controller.js`, `auth.routes.js`
- `src/modules/users/` — `user.service.js`, `user.controller.js`, `user.routes.js`
- `src/shared/middleware/auth.middleware.js` — `requireAuth` (JWT + mock-token shortcuts)
- `src/shared/middleware/role.middleware.js` — `requireRole()`, convenience guards
- `src/shared/mocks/user-mock-data.js` — 6 mock users (one per role)
- `AUTH-ARCHITECTURE.md` — JWT flow, refresh token, RBAC map, production checklist
- `prisma/schema.prisma` — `User` model + `UserRole` enum added

### Audit Log & Compliance
- `src/shared/utils/audit-logger.js` — `logAuditEvent()`, 24 `AUDIT_ACTIONS`, `AUDIT_STORE`
- `src/shared/mocks/audit-mock-data.js` — 9 seed entries
- `src/modules/audit/` — `audit.service.js`, `audit.controller.js`, `audit.routes.js`
- Instrumented: patients, nursing, alerts, tasks, auth controllers
- `MEDICAL-COMPLIANCE.md` — audit requirements, HIPAA, production hardening
- `prisma/schema.prisma` — `AuditLog` model added

### Event Bus
- `src/core/events/event-bus.js` — singleton EventEmitter, `emitEvent`, `onEvent`, ring buffer log
- `src/core/events/event-types.js` — 30 constants across 9 domains
- `src/core/events/event-listeners.js` — 14 listener registrations
- `src/shared/state/dashboard-state.js` — refresh signals + escalation queue
- `src/shared/state/ai-summary-queue.js` — AI job queue stub
- `src/modules/events/events.routes.js` — `/recent`, `/types`, `/dashboard-state`, `/ai-queue`
- `EVENT-ARCHITECTURE.md`

---

## 2026-05-20 · Stage 2 — API Gateway & Repository Layer

### API Gateway (`src/routes/v1/index.js`)
- `GET /api/v1` — module manifest (17 modules)
- `GET /api/v1/health` — liveness + uptime
- Global `errorHandler` + `notFound` middleware
- All module routes registered under `/api/v1`

### Repository Layer (`src/repositories/`)
- `patient.repository.js`, `nursing.repository.js`, `rehab.repository.js`
- `crm.repository.js`, `task.repository.js`, `alert.repository.js`, `handover.repository.js`
- Each: `getAll`, `getById`, `create`, `update`, `delete`
- Prisma/mock switch via `isDatabaseConnected()`
- `src/lib/prisma.js` — singleton PrismaClient (hot-reload safe)
- `ARCHITECTURE-LAYERS.md`

### Database
- Prisma v6.x installed (`@prisma/client`, `prisma`)
- `prisma/schema.prisma` — 12 models, 5 schemas (core, nursing, rehab, crm, notify)
- `DATABASE-ARCHITECTURE.md`, `POSTGRESQL-SETUP-GUIDE.md`

---

## 2026-05-20 · Stage 1 — Foundation

### Express bootstrap
- `src/app.js`, `src/server.js`, `src/config/env.js`
- Health check: `GET /api/health` (legacy) — port **5000**
- Scripts: `npm run dev`, `npm start`

### Mock APIs
- `POST/GET /api/v1/notifications/{send,logs}` — Telegram / WhatsApp / dashboard
- `POST/GET /api/v1/telegram/{mock-message,logs}` — nursing bridge
- `POST/GET /api/v1/whatsapp/{mock-send,logs}` — family, supervisor, CRM
- `POST/GET /api/v1/crm/{leads,appointments,logs}` — in-memory store

### Blueprints
- `CENTRAL-BACKEND-BLUEPRINT.md`
- `DATABASE-SCHEMA-BLUEPRINT.md`
- `NOTIFICATION-INTEGRATION-BLUEPRINT.md`
- `DATABASE-IMPLEMENTATION-PLAN.md`
