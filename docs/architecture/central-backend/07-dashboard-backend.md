# 7 — Dashboard Backend Structure

## Dashboard types in WMC ecosystem

| Dashboard | Primary users | Data sources |
|-----------|---------------|--------------|
| **Command center** | Admin, supervisor | Nursing alerts, OT, incidents, facility status |
| **Nursing coordinator** | Nurses, doctors | Handover, vitals, turning, tasks |
| **Telegram live board** | Supervisors | Snapshot metrics, alerts |
| **CRM pipeline** | Reception | Leads, appointments, follow-ups |
| **Rehab progress** | Therapists | Sessions, goals, AI summaries |
| **Cross-domain executive** | Management | Aggregated KPIs |

## Pattern: BFF read layer

Dashboard APIs are **read-optimized composers** in `apps/api-gateway/src/bff/`, backed by:

1. Domain service calls (phase 1)
2. SQL views / materialized views in `dashboard` schema (phase 2)
3. Redis cache with TTL (phase 2)

Do not duplicate write logic in BFF.

## Route structure

```
/api/v1/dashboard/
├── command-center/status          # exists in wmc-ai-backend — migrate here
├── nursing/summary                # shift rollup
├── nursing/telegram-snapshot      # TelegramDashboardLive shape
├── crm/pipeline-summary
├── rehab/weekly-progress
├── alerts/active                  # cross-domain critical list
└── meta/widgets                   # widget config per role
```

## Response shape (consistent envelope)

```json
{
  "generatedAt": "2026-05-20T10:00:00Z",
  "facilityId": "uuid",
  "widgets": {
    "criticalPatients": [],
    "operationalAlerts": [],
    "crm": { "newLeadsToday": 3 },
    "rehab": { "sessionsToday": 12 }
  },
  "recommendedActions": []
}
```

## Role-based widget visibility

| Widget | Roles |
|--------|-------|
| `criticalPatients` | admin, doctor, nurse |
| `crm.pipeline` | admin, receptionist |
| `rehab.weekly` | admin, therapist, doctor |
| `otWarnings` | admin, nurse supervisor |

Implement `GET /api/v1/dashboard/meta/widgets` returning allowed widget keys for `req.user.role`.

## Telegram snapshot contract

Preserve compatibility with coordinator hook `useTelegramDashboardSnapshot`:

- Stable field names during migration
- Version field: `snapshotVersion: 2` for breaking UI changes

## Materialized views (phase 2)

```sql
-- dashboard.mv_facility_daily
-- Refreshed every 5 min via cron job
SELECT facility_id, date,
  count_critical_alerts,
  open_incidents,
  leads_new,
  rehab_sessions_completed
FROM ... ;
```

Worker: `apps/api-gateway/src/jobs/refresh-dashboard-views.ts` or shared cron container.

## Caching

| Key | TTL | Invalidation |
|-----|-----|--------------|
| `dashboard:command-center:{facilityId}` | 30s | On critical alert webhook |
| `dashboard:telegram-snapshot:{facilityId}` | 15s | Timer |

## Frontend consumption

Next.js apps in `wmc-ai-nursing/web`, `wmc-ai-core/web`, etc.:

- Server components fetch gateway with service token or user session cookie
- Remove duplicate `app/api/*` routes once gateway is stable

## Real-time (optional phase 3)

- SSE: `GET /api/v1/dashboard/stream` for alert feed
- Or WebSocket behind same gateway with Redis pub/sub `events:facility:{id}`

## Testing

- Golden JSON fixtures per dashboard endpoint in `packages/domain-dashboard/tests/fixtures/`
- Contract tests against `shared-resources/contracts/dashboard/*.json`
