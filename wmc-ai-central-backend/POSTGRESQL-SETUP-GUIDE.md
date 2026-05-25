# WMC AI Central Backend — PostgreSQL Setup Guide

**Location:** `D:\WMC-AI\wmc-ai-central-backend`  
**Status:** Guide only — no production connection active  
**Version:** 1.0 · 2026-05-20  
**Prerequisites:** Prisma schema at `prisma/schema.prisma` (valid ✅)

**Related:**

- [DATABASE-SCHEMA-BLUEPRINT.md](./DATABASE-SCHEMA-BLUEPRINT.md) — 24-table design
- [DATABASE-IMPLEMENTATION-PLAN.md](./DATABASE-IMPLEMENTATION-PLAN.md) — ORM decisions
- `src/config/prisma.js` — Prisma client with mock fallback logic

---

## Current mode

The backend has two modes, controlled by `.env`:

| Variable | Value | Effect |
|----------|-------|--------|
| `DATABASE_ENABLED` | `false` | **Mock fallback active.** All services return seeded mock data. No database required. |
| `DATABASE_ENABLED` | `true` | **Real database active.** All services query PostgreSQL via Prisma. Requires valid `DATABASE_URL`. |

> **Default:** `DATABASE_ENABLED=false` — safe to run without any database installed.

---

## 1. Install PostgreSQL locally

### Windows (recommended: PostgreSQL 15 or 16)

1. Download the installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
2. Run the installer — default port `5432`, note the `postgres` superuser password you set
3. Ensure `psql` is available in PATH (installer option, or add `C:\Program Files\PostgreSQL\16\bin` manually)
4. Verify installation:

```powershell
psql --version
# Expected: psql (PostgreSQL) 16.x
```

### Alternative: Docker (no local install)

```powershell
docker run -d `
  --name wmc-postgres `
  -e POSTGRES_USER=wmc_user `
  -e POSTGRES_PASSWORD=wmc_password `
  -e POSTGRES_DB=wmc_ai_db `
  -p 5432:5432 `
  postgres:16-alpine
```

Skip steps 2–3 below if using Docker — the database and user already exist.

---

## 2. Create database and user

Open `psql` as the superuser:

```powershell
psql -U postgres
```

Run these SQL commands inside the `psql` prompt:

```sql
-- Create application user
CREATE USER wmc_user WITH PASSWORD 'wmc_password';

-- Create database owned by application user
CREATE DATABASE wmc_ai_db OWNER wmc_user;

-- Enable UUID extension (required by Prisma schema)
\c wmc_ai_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE wmc_ai_db TO wmc_user;

-- Verify
\l wmc_ai_db
\du wmc_user
\q
```

> **Security note:** Change `wmc_password` to a strong password before any staging/production use. Never commit passwords to git.

---

## 3. Set DATABASE_URL in .env

Copy the template and fill in credentials:

```powershell
cd D:\WMC-AI\wmc-ai-central-backend
copy .env.example .env
```

Edit `.env` — change these two lines:

```env
DATABASE_ENABLED=true
DATABASE_URL="postgresql://wmc_user:wmc_password@localhost:5432/wmc_ai_db"
```

### Full recommended `.env` for local development

```env
NODE_ENV=development
PORT=5000
API_PREFIX=/api

# PostgreSQL — real database
DATABASE_ENABLED=true
DATABASE_URL="postgresql://wmc_user:wmc_password@localhost:5432/wmc_ai_db"
DB_LOG_SQL=true

# Auth (Phase 3)
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=7d

# Mock notifications (keep mock until Telegram/WhatsApp wired)
NOTIFICATION_MODE=mock
NOTIFICATION_MOCK_DELAY_MS=400

# Nursing backend bridge
NURSING_API_URL=http://localhost:4000
NURSING_API_PREFIX=/api/v1
NURSING_API_TOKEN=demo-token
```

> `.env` is listed in `.gitignore` and will never be committed to the repository.

---

## 4. Prisma commands

Run all Prisma commands from inside the backend directory:

```powershell
cd D:\WMC-AI\wmc-ai-central-backend
```

### Validate schema (no database needed)

Checks `prisma/schema.prisma` for syntax and relationship errors without connecting.

```powershell
npx prisma validate
# or
npm run prisma:generate -- --dry-run
```

Expected output: `The schema at prisma/schema.prisma is valid 🚀`

---

### Generate Prisma Client

Regenerates the TypeScript/JavaScript client in `node_modules/@prisma/client` after any schema change.

```powershell
npm run prisma:generate
# equivalent to: npx prisma generate
```

Run this after every edit to `prisma/schema.prisma`.

---

### Run first migration (development)

Creates the database tables from the Prisma schema. The name `init` becomes the migration folder name.

```powershell
npm run prisma:migrate
# equivalent to: npx prisma migrate dev --name init
```

What this does:
1. Connects to `DATABASE_URL`
2. Creates schemas: `core`, `nursing`, `crm`, `notify`
3. Runs all SQL in `prisma/migrations/`
4. Regenerates the Prisma client automatically

Subsequent migrations (after schema changes):

```powershell
npx prisma migrate dev --name add_rehab_progress
npx prisma migrate dev --name add_ai_jobs
```

---

### Open Prisma Studio (visual DB browser)

Browse and edit database rows in a web UI at `http://localhost:5555`.

```powershell
npm run prisma:studio
# equivalent to: npx prisma studio
```

> Prisma Studio is for **development only** — do not expose port 5555 in production.

---

### Other useful commands

| Command | Purpose |
|---------|---------|
| `npx prisma db pull` | Introspect existing DB → update schema |
| `npx prisma migrate reset` | Drop and recreate DB (**dev only — destroys all data**) |
| `npx prisma migrate status` | Show which migrations are applied |
| `npx prisma db seed` | Run seed script (configure in `package.json`) |

---

## 5. Migration safety

### Development workflow

```
Edit prisma/schema.prisma
        ↓
npx prisma migrate dev --name <descriptive-name>
        ↓
Review generated SQL in prisma/migrations/
        ↓
Commit schema + migration files together in one PR
```

Rules:
- **Never edit an already-applied migration file.** Create a new one instead.
- **Use descriptive names:** `add_patient_consent_fields`, not `update1`.
- Keep migrations small and focused — one concern per migration.
- Always run `prisma validate` in CI before merging schema changes.

---

### Staging / production workflow

```
CI passes on feature branch
        ↓
Merge to main
        ↓
CI runs: npx prisma migrate deploy   ← applies pending migrations only (no reset)
        ↓
App deploy starts AFTER migration succeeds
```

Use `migrate deploy` (not `migrate dev`) in production — it never resets, never prompts.

---

### Before any production migration

1. **Take a full database backup** (see Section 7).
2. Run the migration against staging first.
3. Verify staging with smoke tests.
4. Apply to production in a maintenance window if schema is breaking.
5. Keep rollback plan: migration down script or snapshot restore.

---

### Never do these in production

| Action | Why |
|--------|-----|
| `prisma migrate reset` | Drops all tables and data |
| `prisma migrate dev` | Designed for development; can prompt or reset |
| Manual `DROP TABLE` without backup | Unrecoverable data loss |
| Edit an applied migration file | Breaks migration history checksum |
| Commit `.env` with real credentials | Exposes database password |

---

## 6. Mock fallback vs real database

### How it works (`src/config/prisma.js`)

```
Server starts
    ↓
connectPrisma() called
    ↓
DATABASE_ENABLED=false?  →  log "mock fallback active"  →  done
    ↓
DATABASE_URL set? Connect PrismaClient
    ↓
$connect() succeeds?  →  connected=true  →  real queries
    ↓
$connect() fails?    →  log warning  →  mock fallback active
```

### Service layer (`withDatabaseOrMock`)

Every service function calls `withDatabaseOrMock(queryFn, fallbackFn)`:

```javascript
// Example: patient.service.js
const { data, source } = await withDatabaseOrMock(
  () => prisma.patient.findMany({ where, take: limit }),  // real
  () => MOCK_PATIENTS.filter(...)                         // fallback
)
```

All API responses include `"source": "mock"` or `"source": "database"` so you can verify which mode is active.

### Switching modes

| Goal | Change in `.env` |
|------|-----------------|
| Use mock data (no DB) | `DATABASE_ENABLED=false` |
| Use real PostgreSQL | `DATABASE_ENABLED=true` + valid `DATABASE_URL` |
| Debug SQL queries | `DB_LOG_SQL=true` |

No code changes are required to switch modes — only `.env`.

---

## 7. Backup strategy (development)

### Manual dump

```powershell
# Dump to file
pg_dump -U wmc_user -d wmc_ai_db -F c -f wmc_ai_db_backup.dump

# Restore from file
pg_restore -U wmc_user -d wmc_ai_db wmc_ai_db_backup.dump
```

### Before each migration (recommended habit)

```powershell
$date = Get-Date -Format "yyyyMMdd-HHmm"
pg_dump -U wmc_user -d wmc_ai_db -F c -f "backups\pre-migration-$date.dump"
npx prisma migrate dev --name your-change-name
```

### Production

- Enable automated daily snapshots on your managed Postgres provider.
- Enable point-in-time recovery (PITR) for 7–14 days.
- Store logical dumps in separate encrypted object storage (S3, Azure Blob).
- Test restore quarterly to a staging environment.

---

## 8. Quick-start checklist

```
[ ] PostgreSQL 15/16 installed or Docker running
[ ] wmc_ai_db database created
[ ] wmc_user created with password
[ ] uuid-ossp extension enabled in wmc_ai_db
[ ] .env copied from .env.example
[ ] DATABASE_URL updated with real credentials
[ ] DATABASE_ENABLED=true set in .env
[ ] npx prisma validate  →  schema valid ✅
[ ] npm run prisma:migrate  →  tables created
[ ] npm run prisma:studio  →  browse data at localhost:5555
[ ] npm start  →  GET /api/v1 returns source: "database"
```

---

## 9. Connection string reference

| Environment | Format |
|-------------|--------|
| Local (direct) | `postgresql://wmc_user:wmc_password@localhost:5432/wmc_ai_db` |
| Local (Docker) | `postgresql://wmc_user:wmc_password@localhost:5432/wmc_ai_db` |
| Supabase | `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres` |
| Neon | `postgresql://[user]:[password]@[host].neon.tech/wmc_ai_db?sslmode=require` |
| AWS RDS | `postgresql://wmc_user:[password]@[endpoint]:5432/wmc_ai_db?sslmode=require` |
| Azure Postgres | `postgresql://wmc_user%40[server]:[password]@[server].postgres.database.azure.com:5432/wmc_ai_db?sslmode=require` |

> Always append `?sslmode=require` for managed cloud providers.

---

*End of guide — no database connection made. Follow the checklist above when ready.*
