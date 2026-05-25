# WMC AI Central Backend — Database Implementation Plan

**Location:** `D:\WMC-AI\wmc-ai-central-backend`  
**Status:** Planning only — **no database code or migrations yet**  
**Version:** 1.0 · 2026-05-20  
**Target engine:** PostgreSQL 15+

**Related:**

- [DATABASE-SCHEMA-BLUEPRINT.md](./DATABASE-SCHEMA-BLUEPRINT.md) — 24-table design
- [CENTRAL-BACKEND-BLUEPRINT.md](./CENTRAL-BACKEND-BLUEPRINT.md)
- Repo migrations home: `D:\WMC-AI\databases\migrations\`
- Reference SQL: `wmc-ai-nursing/.../wmc-ai-backend/docs/schema/postgresql.sql`

---

## Executive summary

| Decision | Recommendation |
|----------|----------------|
| **Primary approach** | **Drizzle ORM** + `drizzle-kit` migrations |
| **Driver** | `postgres` (postgres.js) or `pg` via Drizzle adapter |
| **Schema source of truth** | Drizzle schema files in repo → generated SQL migrations |
| **Reporting / heavy aggregates** | Optional **raw SQL** views + Drizzle `sql` tagged templates |
| **When to reconsider Prisma** | If entire central backend moves to TypeScript-first and team prefers schema-in-`.prisma` workflow |
| **When to use raw `pg` only** | Read-only analytics replica or one-off DBA scripts — not as primary app layer |

---

## ORM comparison

### 1. Prisma ORM

| Aspect | Assessment |
|--------|------------|
| **Strengths** | Excellent DX; auto-generated client; mature migrations; strong docs; good for CRUD-heavy APIs |
| **Weaknesses for WMC** | Multi-schema PostgreSQL (`core`, `nursing`, `crm`, …) is supported but less natural than Drizzle; heavier runtime; central backend is currently **plain JavaScript** — Prisma shines with TypeScript |
| **Migrations** | `prisma migrate` — proprietary migration history |
| **Dashboard / reports** | `$queryRaw` works but ORM model overhead for 24+ entities |
| **AI summaries** | Store JSON/text fine; relations via Prisma relations |
| **Fit score** | **7/10** — strong if you commit to TS + single-schema or accept multi-schema config complexity |

### 2. Drizzle ORM

| Aspect | Assessment |
|--------|------------|
| **Strengths** | SQL-like TypeScript schema; lightweight; explicit control; **multi-schema friendly**; `drizzle-kit push/generate`; works alongside existing SQL blueprint |
| **Weaknesses** | Smaller ecosystem than Prisma; more manual relation wiring; team must know SQL concepts |
| **Migrations** | SQL files generated to `databases/migrations/` — auditable, DBA-friendly |
| **Dashboard / reports** | Native `sql` helper + materialized views; no impedance mismatch |
| **AI summaries** | JSONB columns + typed inserts; easy job queue tables |
| **Fit score** | **9/10** — best balance for WMC multi-domain backend |

### 3. Raw SQL with `pg`

| Aspect | Assessment |
|--------|------------|
| **Strengths** | Full control; matches existing `postgresql.sql`; zero ORM lock-in; works with current **JS** Express app today |
| **Weaknesses** | 24 tables × repositories = high boilerplate; manual migration tracking; no compile-time types unless added separately |
| **Migrations** | `node-pg-migrate`, Flyway, or hand-written SQL in `databases/migrations/` |
| **Dashboard / reports** | Ideal for complex joins — but every query hand-written |
| **Fit score** | **6/10** as sole layer — good **companion** to Drizzle for reports, not replacement |

### Comparison matrix

| Criterion | Prisma | Drizzle | Raw `pg` |
|-----------|:------:|:-------:|:--------:|
| Multi-schema Postgres | ⚠️ | ✅ | ✅ |
| Type safety | ✅ | ✅ | ❌ |
| Migration auditability | ⚠️ | ✅ | ✅ |
| Express + JS today | ⚠️ | ⚠️ (prefer TS) | ✅ |
| Dashboard SQL / aggregates | ⚠️ | ✅ | ✅ |
| Learning curve (team) | Low | Medium | Medium–High |
| Long-term maintenance (24 tables) | ✅ | ✅ | ❌ |
| Aligns with `DATABASE-SCHEMA-BLUEPRINT.md` | ⚠️ | ✅ | ✅ |

---

## 1. Recommended ORM

**Use Drizzle ORM** as the primary data access layer for WMC AI Central Backend.

**Companion pattern:** Raw SQL for dashboard materialized views and cross-schema report queries, executed through Drizzle’s `db.execute(sql`...`)` or a thin `pg` pool dedicated to read replicas.

---

## 2. Why Drizzle fits the WMC AI system

1. **Multi-domain schema** — Blueprint uses `core`, `nursing`, `crm`, `rehab`, `notify` schemas; Drizzle models this explicitly without fighting the ORM.

2. **Clinical + operational complexity** — Nursing alerts, tasks, escalations, and CRM leads need precise indexes and partial indexes; Drizzle stays close to SQL.

3. **Dashboard reports** — Command center, daily facility report, and night-shift monitor need aggregations across tables; Drizzle allows hybrid ORM + raw SQL without two stacks.

4. **AI Summary Engine** — Job rows (`ai_jobs`, `ai_results`) with JSONB metadata map cleanly; async workers share the same schema types.

5. **Incremental migration path** — Today: in-memory mock APIs (`crm`, `notifications`, `telegram`, `whatsapp`). Tomorrow: swap service layer to Drizzle repositories **without** changing route contracts.

6. **Monorepo alignment** — Nursing backend and frontends already use TypeScript; adopting TS in `database/` package is a natural next step (see folder structure).

7. **SQL migrations in repo** — Generated files live under `D:\WMC-AI\databases\migrations\` for review in PRs (important for healthcare-adjacent audit trails).

8. **Not over-engineered** — Lighter than Prisma for an Express gateway that may later split workers (notification, AI).

---

## 3. Folder structure for database implementation

```
WMC-AI/
├── databases/                                    # Repo-level source of truth
│   ├── migrations/                             # Applied SQL (generated + manual views)
│   │   ├── 0001_core_users_staff_patients.sql
│   │   ├── 0002_nursing_clinical.sql
│   │   └── ...
│   ├── seeds/
│   │   ├── dev-seed.sql
│   │   └── demo-patients.json
│   └── README.md
│
└── wmc-ai-central-backend/
    ├── DATABASE-SCHEMA-BLUEPRINT.md
    ├── DATABASE-IMPLEMENTATION-PLAN.md           # this file
    ├── drizzle.config.ts                         # drizzle-kit config (phase 1)
    │
    └── src/
        ├── config/
        │   └── env.js                            # DATABASE_URL validation
        │
        ├── database/                           # NEW — data layer
        │   ├── index.js                          # export db client + repositories
        │   ├── client.js                         # pool / drizzle instance
        │   ├── schema/                           # Drizzle table definitions
        │   │   ├── core/
        │   │   │   ├── patients.ts
        │   │   │   ├── staff.ts
        │   │   │   └── users.ts
        │   │   ├── nursing/
        │   │   │   ├── nursing-records.ts
        │   │   │   ├── vital-alerts.ts
        │   │   │   └── ...
        │   │   ├── crm/
        │   │   ├── rehab/
        │   │   ├── notify/
        │   │   └── index.ts                      # merge schema export
        │   │
        │   ├── repositories/                     # Domain data access
        │   │   ├── patients.repository.js
        │   │   ├── nursing-records.repository.js
        │   │   ├── crm.repository.js
        │   │   ├── notifications.repository.js
        │   │   └── dashboard-read.repository.js  # raw SQL / views
        │   │
        │   └── views/                            # Optional SQL view definitions
        │       └── dashboard-command-center.sql
        │
        └── modules/                              # Services call repositories
            ├── crm/crm.service.js                # replace in-memory → db
            ├── notifications/notification.service.js
            └── ...
```

**Note:** Schema files in TypeScript (`.ts`); repositories can stay `.js` initially and import compiled types, or migrate central backend to TypeScript in the same phase.

---

## 4. Environment variables

### Required

| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://wmc:wmc@localhost:5432/wmc_central` | Primary connection string |
| `NODE_ENV` | `development` \| `production` \| `test` | Pool + SSL behavior |

### Connection pool

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_POOL_MAX` | `10` | Max connections per app instance |
| `DB_POOL_IDLE_MS` | `30000` | Idle timeout |
| `DB_CONNECT_TIMEOUT_MS` | `5000` | Fail fast on boot |

### Migrations (CI / deploy)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL_MIGRATE` | Optional superuser URL for migrations only |
| `DRIZZLE_MIGRATE_ON_START` | `false` in prod (run migrations in CI); `true` optional in dev |

### Development only

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL_TEST` | Isolated DB for integration tests |
| `DB_LOG_SQL` | `true` — log queries in dev |

### Production

| Variable | Purpose |
|----------|---------|
| `DATABASE_SSL` | `true` — require TLS |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` for managed Postgres |
| `DB_READ_REPLICA_URL` | Optional read replica for dashboard reports |

### Existing (unchanged)

Mock APIs continue to work when `DATABASE_ENABLED=false` until cutover:

| Variable | Purpose |
|----------|---------|
| `DATABASE_ENABLED` | `false` → in-memory; `true` → PostgreSQL |
| `NOTIFICATION_MODE` | `mock` until notify tables wired |

---

## 5. Migration strategy

### Principles

1. **Sequential numbered migrations** — `0001_`, `0002_`, never edit applied files.
2. **Generate from Drizzle** — `pnpm drizzle-kit generate` after schema change.
3. **Review SQL in PR** — especially FK, indexes, enum changes.
4. **One direction** — up migrations only in repo; down migrations optional for dev.
5. **Align with blueprint phases** — match [DATABASE-SCHEMA-BLUEPRINT.md](./DATABASE-SCHEMA-BLUEPRINT.md) migration phases.

### Workflow

```mermaid
flowchart LR
  A[Edit Drizzle schema] --> B[drizzle-kit generate]
  B --> C[SQL in databases/migrations/]
  C --> D[PR review]
  D --> E[CI apply to test DB]
  E --> F[Deploy apply to staging/prod]
```

### Cutover from in-memory mocks

| Module | Strategy |
|--------|----------|
| CRM | Feature flag `DATABASE_ENABLED`; dual-write not needed — import mock seed into Postgres once |
| Notifications / Telegram / WhatsApp logs | Insert to `notify.*` instead of arrays |
| Nursing | Nursing backend (:4000) writes to central DB via API or shared DB (decide in phase 4) |
| Dashboard | Read from views; keep mock fallback until views populated |

### Enum / breaking changes

- Add new enum values with `ALTER TYPE ... ADD VALUE` in dedicated migration.
- Avoid renaming columns without views/compatibility layer.

---

## 6. Development database plan

| Item | Plan |
|------|------|
| **Engine** | PostgreSQL 15+ in Docker |
| **Database name** | `wmc_central_dev` |
| **Compose** | Add to `deployments/docker/docker-compose.yml` or `wmc-ai-central-backend/docker-compose.yml` |
| **Init** | `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` + schemas `core`, `nursing`, `crm`, `rehab`, `notify` |
| **Seed** | `databases/seeds/dev-seed.sql` — admin user, 3 demo patients, Ah Chong high-risk scenario |
| **Local commands** (future) | `pnpm db:up`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:studio` (drizzle-kit studio) |
| **Developer workflow** | Central backend + optional nursing backend; both point to same `DATABASE_URL` when integrated |
| **Reset** | `pnpm db:reset` — drop/recreate schema (dev only) |

### Docker service sketch (not implemented yet)

```yaml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER: wmc
    POSTGRES_PASSWORD: wmc
    POSTGRES_DB: wmc_central_dev
  ports:
    - "5432:5432"
  volumes:
    - wmc_pg_data:/var/lib/postgresql/data
```

---

## 7. Production database plan

| Item | Plan |
|------|------|
| **Hosting** | Managed PostgreSQL (AWS RDS, Azure Database for PostgreSQL, Supabase, or Neon) |
| **Instance** | Start **db.t4g.small** equivalent; scale on connection count + report load |
| **HA** | Multi-AZ or provider HA; RPO/RTO per facility policy |
| **Connection** | App uses **PgBouncer** or provider pooler; `DB_POOL_MAX` ≤ pooler limit |
| **Schemas** | Same logical schemas as dev; no shared DB with unrelated projects |
| **Read scaling** | Read replica for dashboard/reporting after phase 6 |
| **Migrations** | Run in CI/CD **before** app deploy; never from app boot in prod |
| **Secrets** | `DATABASE_URL` in vault / platform secrets — not in git |
| **SSL** | Required; certificate validation on |

### Environment tiers

| Tier | Database | Notes |
|------|----------|-------|
| **local** | Docker Postgres | Seed data, mock-friendly |
| **staging** | Managed small instance | Anonymized or synthetic PHI only |
| **production** | Managed HA instance | Real data; audit logging enabled |

---

## 8. Backup strategy

| Type | Frequency | Retention | Tool |
|------|-----------|-----------|------|
| **Automated snapshots** | Daily (provider) | 30 days | RDS / Azure automated backup |
| **Point-in-time recovery** | Continuous WAL | 7–14 days | Enable PITR on managed Postgres |
| **Logical dump** | Weekly | 90 days | `pg_dump -Fc` to encrypted object storage |
| **Pre-migration backup** | Before each prod migration | Until migration verified | Manual snapshot + dump |
| **Restore test** | Quarterly | — | Restore to staging and smoke-test `/api/health` + CRM read |

### Backup storage

- Encrypt at rest (S3 SSE, Azure Storage encryption).
- Separate bucket from application assets; restrict IAM to DBA/deploy role.
- Document restore runbook in `databases/README.md` (future).

### What to exclude from dumps (optional)

- Ephemeral `telegram_logs` / high-volume mock logs older than 90 days (archival job later).

---

## 9. Security notes

| Area | Requirement |
|------|-------------|
| **Credentials** | Unique DB user per service; least privilege per schema |
| **App user** | `wmc_api` — CRUD on app schemas; no `SUPERUSER` |
| **Migration user** | `wmc_migrate` — DDL only in CI |
| **Worker users** | `wmc_notify`, `wmc_ai` — schema-scoped (phase 7+) |
| **PHI / PII** | Encrypt backups; audit access; minimize fields in logs |
| **SQL injection** | Drizzle parameterized queries only; raw SQL via tagged templates |
| **Network** | DB in private subnet; no public IP; app via VPC |
| **SSL/TLS** | Required for all connections in staging/prod |
| **Row-level security** | Optional phase 2+ for multi-facility tenancy |
| **Audit** | Append-only `core.audit_log` for sensitive writes (blueprint extension) |
| **Secrets rotation** | Rotate `DATABASE_URL` password quarterly; update pooler |

---

## 10. Implementation phases

| Phase | Name | Deliverables | Exit criteria |
|-------|------|--------------|---------------|
| **0** | Decision & scaffold | This plan; `drizzle.config.ts`; Docker Postgres; `DATABASE_URL` | Local Postgres boots; drizzle-kit connects |
| **1** | Core schema | `users`, `staff`, `patients` migrations + repositories | CRUD patients via API (new or test routes) |
| **2** | CRM + notify | `crm_leads`, `crm_appointments`, `notifications`, `telegram_logs`, `whatsapp_logs` | Replace in-memory CRM + notify modules |
| **3** | Nursing clinical | `nursing_records`, alerts, risks, wounds, meds, turning | Nursing API can read/write central DB (pilot) |
| **4** | Nursing ops | `tasks`, `handovers`, `incidents`, reminders, announcements, escalations, family_updates | Task queue persisted; dashboard reads DB |
| **5** | Rehab + AI | `rehab_progress`, `ai_jobs`, `ai_results` (extend blueprint) | AI worker persists summaries |
| **6** | Dashboard reports | Materialized views + `dashboard-read.repository` | Command center / daily report from SQL |
| **7** | Production hardening | HA, backups, pooler, split DB roles, SSL | Staging cutover complete |
| **8** | Decommission mocks | Remove in-memory stores; `DATABASE_ENABLED` always true in prod | Single source of truth |

### Phase 0 tasks (when coding starts)

1. Add `drizzle-orm`, `drizzle-kit`, `postgres` (or `pg`) to `wmc-ai-central-backend`.
2. Create `drizzle.config.ts` pointing at `src/database/schema` and `databases/migrations`.
3. Add Docker Compose Postgres for developers.
4. Document `pnpm db:*` scripts in README.

---

## Domain → table mapping (implementation priority)

| Domain need | Tables (from blueprint) |
|-------------|-------------------------|
| Patients | `core.patients` |
| Nursing records | `nursing.nursing_records`, `side_turning_records`, … |
| Rehab progress | `rehab.rehab_progress` |
| CRM leads / appointments | `crm.crm_leads`, `crm.crm_appointments` |
| Alerts | `vital_alerts`, `medication_alerts`, `doctor_escalations` |
| Tasks | `nursing.tasks`, `reminders` |
| Notifications | `notify.notifications`, `telegram_logs`, `whatsapp_logs` |
| Dashboard reports | SQL views over nursing + crm + notify aggregates |
| AI summaries | `ai_results` (+ jobs table — add in phase 5 migration) |

---

## Alternative path: Prisma (if chosen later)

Switch to Prisma if the team standardizes on:

- Single `schema.prisma` as documentation
- Prisma Studio for non-technical stakeholders
- Full TypeScript central backend rewrite

**Migration cost:** Regenerate models from [DATABASE-SCHEMA-BLUEPRINT.md](./DATABASE-SCHEMA-BLUEPRINT.md); rewrite repositories to Prisma Client. SQL migrations in `databases/migrations/` remain valid reference.

---

## Alternative path: Raw `pg` only

Acceptable for a **minimal** central backend if:

- Team rejects TypeScript migration
- DBA owns all SQL

**Cost:** Maintain 24+ repository files by hand; higher bug risk on FK relations. Not recommended as primary approach for WMC scale.

---

*End of plan — no code until Phase 0 is explicitly approved.*
