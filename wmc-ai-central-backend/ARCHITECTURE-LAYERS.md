# WMC AI Central Backend — Architecture Layers

**Location:** `D:\WMC-AI\wmc-ai-central-backend`  
**Pattern:** Layered architecture — Routes → Controllers → Services → Repositories → Prisma → PostgreSQL  
**Version:** 1.0 · 2026-05-20  
**Style:** Healthcare-enterprise, separation of concerns, mock-safe

---

## Layer diagram

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────────┐
│         Express App (src/app.js)        │
│  CORS · JSON body parser · Error handler│
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│      API Gateway (src/routes/v1/)       │
│  Route registration · Module grouping  │
│  GET /api/v1 · GET /api/v1/health      │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│   Module Routes (src/modules/*/routes)  │
│  /patients · /nursing · /tasks · etc.  │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  Controllers (src/modules/*/controller) │
│  Parse request · Validate input        │
│  Call service · Shape HTTP response    │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│   Services (src/modules/*/service)      │
│  Business logic · Orchestration        │
│  Priority rules · Auto tasks · Alerts  │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│   Repositories (src/repositories/)      │
│  Data access only · getAll / getById   │
│  create / update / delete              │
│  Mock fallback OR Prisma query         │
└─────────────────────────────────────────┘
     │
     ├─── DATABASE_ENABLED=false ──────────▶  In-memory mock store
     │                                        (seeded from domain-mock-data.js)
     │
     └─── DATABASE_ENABLED=true ───────────▶
          │
          ▼
     ┌─────────────────────────────────────┐
     │   Prisma Client (src/lib/prisma.js) │
     │  Singleton · Hot-reload safe        │
     │  Lazy connect · SQL logging flag    │
     └─────────────────────────────────────┘
          │
          ▼
     ┌─────────────────────────────────────┐
     │   PostgreSQL 15+  (wmc_ai_db)       │
     │  5 schemas: core · nursing · rehab  │
     │             crm · notify            │
     └─────────────────────────────────────┘
```

---

## Layer responsibilities

### 1. Express App — `src/app.js`

**Responsibility:** Bootstrap Express, apply global middleware, mount the API router.

| Middleware | Purpose |
|-----------|---------|
| `cors()` | Allow cross-origin requests from frontends |
| `express.json()` | Parse JSON request bodies |
| `notFound` | 404 handler for unregistered paths |
| `errorHandler` | Global 500 handler — logs and shapes error responses |

No business logic lives here. This file only assembles the pipeline.

---

### 2. API Gateway — `src/routes/v1/index.js`

**Responsibility:** Versioned route registry. The single source of truth for which module is mounted at which path.

```
GET /api/v1              → module manifest (name, path, status)
GET /api/v1/health       → liveness check (uptime, timestamp)
/api/v1/patients         → patients module
/api/v1/nursing          → nursing module
/api/v1/rehab            → rehab module (stub → full in phase 3)
/api/v1/crm              → CRM module
/api/v1/tasks            → tasks module
/api/v1/alerts           → alerts module
/api/v1/notifications    → notifications module
/api/v1/telegram         → telegram bot bridge
/api/v1/whatsapp         → whatsapp mock sender
/api/v1/dashboard        → dashboard (stub → phase 5)
/api/v1/ai-summary       → AI engine (stub → phase 4)
/api/v1/reports          → reports (stub → phase 6)
```

To add a new module: register one line here. No other file changes required.

---

### 3. Module Routes — `src/modules/*/routes.js`

**Responsibility:** Define HTTP verbs and paths for a single domain module. Delegate immediately to controllers.

```javascript
// Example: patient.routes.js
router.get('/',    (req, res) => patientController.list(req, res))
router.get('/:id', (req, res) => patientController.getById(req, res))
```

**Rules:**
- No logic in route files — only wiring
- One controller per route file
- Never import repositories or services directly in routes

---

### 4. Controllers — `src/modules/*/controller.js`

**Responsibility:** HTTP boundary. Parse input, call exactly one service function, return HTTP response.

```javascript
// Example: patient.controller.js
async list(req, res) {
  const result = await patientService.listPatients({
    status: req.query.status,
    search: req.query.search,
    limit:  req.query.limit ? Number(req.query.limit) : undefined,
  })
  res.json(result)
}
```

**Rules:**
- Controllers know about HTTP (req, res, status codes)
- Controllers do NOT know about Prisma, repositories, or mock data
- All validation errors return `400`; service exceptions propagate to `errorHandler`

---

### 5. Services — `src/modules/*/service.js`

**Responsibility:** Business logic and domain orchestration. The only layer that knows about domain rules.

| Service | Business rules it owns |
|---------|----------------------|
| `patient.service` | Status filtering, search logic |
| `nursing.service` | Shift/date filtering |
| `task.service` | Priority ordering, domain filtering |
| `alert.service` | Severity/status filtering |
| `crm.service` | Priority classification, auto follow-up task creation, lead → contacted on appointment |
| `notification.service` | Mock delay simulation, fail rate, idempotency |

**Rules:**
- Services call repositories — never Prisma directly
- Services do NOT know about HTTP (no req/res)
- Services shape the response envelope (`{ total, count, data, source, mock }`)

---

### 6. Repositories — `src/repositories/`

**Responsibility:** Data access only. Every repository exposes the same five methods regardless of mode.

| Method | Behaviour (mock) | Behaviour (database) |
|--------|-----------------|---------------------|
| `getAll(filters)` | Filter in-memory array | `prisma.*.findMany({ where, take })` |
| `getById(id)` | `Array.find()` | `prisma.*.findUnique({ where: { id } })` |
| `create(data)` | Push to array with UUID | `prisma.*.create({ data })` |
| `update(id, data)` | Merge into array entry | `prisma.*.update({ where: { id }, data })` |
| `delete(id)` | Splice or soft-flag | `prisma.*.update/delete({ where: { id } })` |

All methods return `{ data, source: 'mock' | 'database' }` — callers are always told which mode was used.

#### Repositories index

| File | Prisma model | Domain |
|------|-------------|--------|
| `patient.repository.js` | `patient` | `core` schema |
| `nursing.repository.js` | `nursingRecord` | `nursing` schema |
| `rehab.repository.js` | `rehabProgress` | `rehab` schema |
| `crm.repository.js` | `crmLead` | `crm` schema |
| `task.repository.js` | `task` | `nursing` schema |
| `alert.repository.js` | `alert` | `nursing` schema |
| `handover.repository.js` | `handoverLog` | `nursing` schema |

---

### 7. Prisma Client — `src/lib/prisma.js`

**Responsibility:** Provide the singleton `PrismaClient` instance to all repositories. Prevent duplicate instances.

```javascript
// Hot-reload singleton guard
const prismaClient = global.__wmc_prisma ?? new PrismaClient({ ... })
if (process.env.NODE_ENV !== 'production') {
  global.__wmc_prisma = prismaClient
}
```

**Rules:**
- All repositories import from `src/lib/prisma.js` — never directly from `@prisma/client`
- One instance per Node process
- `src/config/prisma.js` manages connect/disconnect lifecycle; `src/lib/prisma.js` manages the singleton object

---

### 8. Database — PostgreSQL 15+

**Responsibility:** Persistent storage with referential integrity, indexes, and schema-level isolation.

| Schema | Tables |
|--------|--------|
| `core` | `patients`, `staff` |
| `nursing` | `nursing_records`, `handover_logs`, `tasks`, `alerts` |
| `rehab` | `rehab_progress` |
| `crm` | `crm_leads`, `crm_appointments` |
| `notify` | `notifications` |

All schemas, tables, indexes, enums, and foreign keys are defined in `prisma/schema.prisma` and applied via `npx prisma migrate dev`.

---

## Data flow example — `GET /api/v1/alerts?severity=critical`

```
1. Request → Express router → /api/v1/alerts
2. API Gateway (v1/index.js) → alertRoutes
3. alertRoutes → alertController.list(req, res)
4. alertController → alertService.listAlerts({ severity: 'critical' })
5. alertService → alertRepository.getAll({ severity: 'critical' })
6. alertRepository:
     DATABASE_ENABLED=false → filter MOCK_ALERTS array
     DATABASE_ENABLED=true  → prisma.alert.findMany({ where: { severity: 'critical' } })
7. returns { data: [...], source: 'mock' | 'database' }
8. alertService shapes: { total, count, alerts, source, mock }
9. alertController → res.json(result)
```

---

## Mock fallback design

```
DATABASE_ENABLED=false  ──▶  repositories use in-memory stores
                              seeded from shared/mocks/domain-mock-data.js
                              supports create/update/delete in RAM
                              source: "mock" in every response

DATABASE_ENABLED=true   ──▶  repositories call Prisma
                              connection failure → automatic fallback to mock
                              source: "database" in every response
```

**Why this matters:** Every new developer can clone the repo and hit every API endpoint immediately — no database install needed. The mock stores persist across requests (in-memory), so create/update/delete operations work during development.

---

## Shared utilities

| File | Purpose |
|------|---------|
| `src/shared/mocks/domain-mock-data.js` | Seed fixtures: patients, nursing records, tasks, alerts, rehab, handovers, CRM leads, notifications |
| `src/shared/utils/data-source.js` | `withDatabaseOrMock()` — legacy helper (repositories handle this internally now) |
| `src/shared/middleware/error-handler.js` | Express global error handler |
| `src/shared/middleware/not-found.js` | 404 catch-all |
| `src/config/env.js` | `PORT`, `API_PREFIX`, `NODE_ENV` |
| `src/config/prisma.js` | `connectPrisma()`, `isDatabaseConnected()`, `isDatabaseEnabled()` |
| `src/lib/prisma.js` | Singleton `PrismaClient` for repository consumption |

---

## Startup sequence

```
node src/server.js
      │
      ├── isDatabaseEnabled()
      ├── connectPrisma()      ← attempts $connect() if DATABASE_ENABLED=true
      │
      ├── [Repository Layer] Active
      ├── [Database Mode] MOCK | PRISMA
      │
      ├── createApp()          ← builds Express instance
      └── app.listen(5000)
           │
           └── [WMC AI Central Backend] listening on http://localhost:5000/api
               [API Gateway] http://localhost:5000/api/v1
```

---

## Adding a new domain module (checklist)

```
[ ] 1. Add model to prisma/schema.prisma
[ ] 2. Run: npx prisma generate
[ ] 3. Add mock fixtures to src/shared/mocks/domain-mock-data.js
[ ] 4. Create src/repositories/<domain>.repository.js
[ ] 5. Create src/modules/<domain>/<domain>.service.js
[ ] 6. Create src/modules/<domain>/<domain>.controller.js
[ ] 7. Create src/modules/<domain>/<domain>.routes.js
[ ] 8. Register in src/routes/v1/index.js (one line)
[ ] 9. When DB is ready: npx prisma migrate dev --name add_<domain>
```

No other files need changing.

---

*Healthcare enterprise architecture — all domain logic isolated, all data access abstracted, mock-safe at every layer.*
