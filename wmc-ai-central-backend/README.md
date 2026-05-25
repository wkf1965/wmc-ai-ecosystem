# WMC AI Central Backend

Central API for **Nursing**, **Rehabilitation**, **CRM**, **Dashboard**, **Database ops**, **Notifications** (Telegram / WhatsApp), and the **AI Summary Engine**.

## Status

**Runnable** — `GET /api/health` on port **5000**.

## Run locally

```powershell
cd D:\WMC-AI\wmc-ai-central-backend
npm install
npm run dev
```

Or production mode: `npm start`

Test: `http://localhost:5000/api/health`

## Documentation

- [CENTRAL-BACKEND-BLUEPRINT.md](./CENTRAL-BACKEND-BLUEPRINT.md) — architecture, database design, implementation phases
- [NOTIFICATION-INTEGRATION-BLUEPRINT.md](./NOTIFICATION-INTEGRATION-BLUEPRINT.md) — Telegram / WhatsApp, mock sender first
- [DATABASE-SCHEMA-BLUEPRINT.md](./DATABASE-SCHEMA-BLUEPRINT.md) — PostgreSQL tables (24 entities, planning only)
- [DATABASE-IMPLEMENTATION-PLAN.md](./DATABASE-IMPLEMENTATION-PLAN.md) — ORM choice (Drizzle), migrations, dev/prod plan
- [DEV-LOG.md](./DEV-LOG.md) — project changelog
- Ecosystem detail: `../docs/architecture/central-backend/`

## Layout

```
src/
├── app.js              # Express app factory
├── server.js           # HTTP entry
├── config/
├── routes/             # mounts /api/*
├── modules/            # domain routers
├── shared/             # middleware, utils, validators, types
└── integrations/       # telegram, whatsapp adapters
```

## API routes (planned)

| Path | Module |
|------|--------|
| `/api/auth` | `modules/auth` |
| `/api/nursing` | `modules/nursing` |
| `/api/rehab` | `modules/rehabilitation` |
| `/api/crm` | `modules/crm` |
| `/api/dashboard` | `modules/dashboard` |
| `/api/notifications` | `modules/notifications` |
| `/api/ai-summary` | `modules/ai-summary` |
| `/api/database` | `modules/database` |

## Stage 4 — PostgreSQL Direct API

All 7 core modules now have direct PostgreSQL routes using the `pg` driver.
These live at `/api/*` (no `/v1` prefix) and use raw SQL for maximum control.

### 1. Create the database

```sql
-- In psql or pgAdmin, run once:
CREATE DATABASE wmc_ai;
```

### 2. Run the schema

```powershell
# From the project root
psql -U postgres -d wmc_ai -f database/schema.sql
```

This creates 7 tables: `patients`, `nursing_records`, `side_turning_records`,
`ot_records`, `rehab_progress`, `crm_leads`, `ai_memory`.

### 3. Configure environment

Edit `.env`:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/wmc_ai
DATABASE_ENABLED=true
```

### 4. Run the server

```powershell
cd D:\WMC-AI\wmc-ai-central-backend
npm run dev
```

Successful startup shows:
```
[pg] ✅ PostgreSQL connection established — Stage 4 database ready
[WMC AI Central Backend] listening on http://localhost:5000/api
```

### 5. API endpoints (Stage 4)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patients` | List all patients |
| POST | `/api/patients` | Create patient |
| GET | `/api/nursing/records` | List nursing records |
| POST | `/api/nursing/records` | Create nursing record |
| GET | `/api/side-turning` | List side turning records |
| POST | `/api/side-turning` | Create side turning record |
| GET | `/api/ot` | List OT records |
| POST | `/api/ot` | Create OT record |
| GET | `/api/rehab/progress` | List rehab progress |
| POST | `/api/rehab/progress` | Create rehab progress |
| GET | `/api/crm/leads` | List CRM leads |
| POST | `/api/crm/leads` | Create CRM lead |
| GET | `/api/ai/memory` | List AI memory |
| POST | `/api/ai/memory` | Create AI memory entry |
| GET | `/api/dashboard` | Aggregated dashboard summary |

### 6. Test the API (PowerShell / curl)

```powershell
# Health check
curl http://localhost:5000/api/v1/health

# Create a patient
curl -X POST http://localhost:5000/api/patients `
  -H "Content-Type: application/json" `
  -d '{"name":"Ali","room":"Room 2","diagnosis":"Stroke","status":"active","admission_date":"2026-01-15"}'

# List patients
curl http://localhost:5000/api/patients

# Add a nursing record (replace patient_id with real UUID from previous response)
curl -X POST http://localhost:5000/api/nursing/records `
  -H "Content-Type: application/json" `
  -d '{"patient_id":"<uuid>","record_type":"vital_signs","notes":"BP 120/80, Temp 36.8","nurse_name":"Aina"}'

# Dashboard summary
curl http://localhost:5000/api/dashboard
```

### 7. Query parameters (GET filters)

| Route | Supported params |
|-------|-----------------|
| GET /api/patients | `?status=active`, `?room=Room 2` |
| GET /api/nursing/records | `?patient_id=`, `?record_type=`, `?date=YYYY-MM-DD` |
| GET /api/side-turning | `?patient_id=`, `?room=`, `?date=YYYY-MM-DD` |
| GET /api/ot | `?staff_name=`, `?status=pending`, `?date=YYYY-MM-DD` |
| GET /api/rehab/progress | `?patient_id=`, `?therapist_name=`, `?treatment_type=` |
| GET /api/crm/leads | `?lead_status=new`, `?service_interest=` |
| GET /api/ai/memory | `?module=nursing`, `?risk_level=high` |

### 8. Dashboard response shape

```json
{
  "ok": true,
  "generatedAt": "2026-05-22T08:00:00.000Z",
  "data": {
    "total_patients": 12,
    "today_nursing_records": 5,
    "today_side_turning": 8,
    "pending_ot_records": 2,
    "active_crm_leads": 6,
    "latest_rehab_progress": [...],
    "latest_ai_memory": [...]
  }
}
```

---

## Configuration

Copy `.env.example` to `.env` and update values.
