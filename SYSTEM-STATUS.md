# WMC AI — System Status

**Stage:** Stage 4 — Stable Prototype  
**Last updated:** 2026-05-20  
**Overall system status:** ✅ Operational (mock/dev mode)

---

## System components

### Central Backend
| Item | Status | Notes |
|------|--------|-------|
| Express server | ✅ Running | `http://localhost:5000` |
| API Gateway | ✅ Active | `GET /api/v1` — 17 modules registered |
| Auth mode | ✅ Mock | `AUTH_MODE=mock` — JWT signed, DB-free |
| Database mode | ✅ Mock | `DATABASE_ENABLED=false` — in-memory fallback |
| Repository layer | ✅ Active | 7 repositories (patient/nursing/rehab/crm/task/alert/handover) |
| Event bus | ✅ Active | 14 event types with listeners (Node EventEmitter) |
| Audit logger | ✅ Active | Append-only in-memory store, seeded with 9 mock entries |
| Notification mock | ✅ Active | Telegram + WhatsApp mock with configurable delay/fail rate |

### API Endpoints

| Endpoint | Method | Status | Auth |
|----------|--------|--------|------|
| `/api/v1` | GET | ✅ | Public |
| `/api/v1/health` | GET | ✅ | Public |
| `/api/v1/patients` | GET | ✅ | Public (dev) |
| `/api/v1/nursing/records` | GET | ✅ | Public (dev) |
| `/api/v1/tasks` | GET | ✅ | Public (dev) |
| `/api/v1/tasks/queue` | GET | ✅ | supervisor+ |
| `/api/v1/alerts` | GET | ✅ | Public (dev) |
| `/api/v1/alerts/:id/acknowledge` | PATCH | ✅ | clinical staff |
| `/api/v1/alerts/:id/escalate` | POST | ✅ | clinical staff |
| `/api/v1/dashboard` | GET | ✅ | Public |
| `/api/v1/dashboard/summary` | GET | ✅ | supervisor+ |
| `/api/v1/supervisor/escalation-queue` | GET | ✅ | supervisor+ |
| `/api/v1/supervisor/recent-activity` | GET | ✅ | supervisor+ |
| `/api/v1/auth/login` | POST | ✅ | Public |
| `/api/v1/auth/refresh` | POST | ✅ | Public |
| `/api/v1/auth/logout` | POST | ✅ | Public |
| `/api/v1/auth/me` | GET | ✅ | requireAuth |
| `/api/v1/users` | GET | ✅ | supervisor+ |
| `/api/v1/users/me` | GET | ✅ | requireAuth |
| `/api/v1/audit/logs` | GET | ✅ | supervisor+ |
| `/api/v1/audit/summary` | GET | ✅ | supervisor+ |
| `/api/v1/events/recent` | GET | ✅ | supervisor+ |
| `/api/v1/events/dashboard-state` | GET | ✅ | supervisor+ |
| `/api/v1/crm/leads` | GET/POST | ✅ | Public (dev) |
| `/api/v1/notifications/send` | POST | ✅ | Public (dev) |
| `/api/v1/notifications/logs` | GET | ✅ | Public (dev) |
| `/api/v1/telegram/mock-message` | POST | ✅ | Public (dev) |
| `/api/v1/whatsapp/mock-send` | POST | ✅ | Public (dev) |

### Frontend Dashboard (WMC AI Frontdesk)
| Item | Status | Notes |
|------|--------|-------|
| Next.js dev server | ✅ Running | `http://localhost:3000` |
| Dashboard page | ✅ Connected | `http://localhost:3000/dashboard` |
| Central backend health | ✅ Live | Fetches `GET /api/v1/health` |
| Patient count | ✅ Live | Fetches `GET /api/v1/patients` |
| Task count | ✅ Live | Fetches `GET /api/v1/tasks` |
| Alert count | ✅ Live | Fetches `GET /api/v1/alerts` |
| Escalation queue | ✅ Live | Fetches `GET /api/v1/events/dashboard-state` |
| Module manifest | ✅ Live | Fetches `GET /api/v1` |
| Fallback UI | ✅ Active | Shows offline banner + fallback data if backend is down |
| Auto-refresh | ✅ Active | Every 30 seconds |
| Nursing operations | ✅ Mock | Connects to nursing backend `:4000` (mock fallback when offline) |

### Prisma / Database
| Item | Status | Notes |
|------|--------|-------|
| Prisma version | ✅ v6.x | Pinned to avoid v7 breaking changes |
| Schema validation | ✅ Valid | 10 models + `User` + `AuditLog` across 5 schemas |
| PostgreSQL connection | ⏸ Disabled | `DATABASE_ENABLED=false` — mock fallback active |
| Mock fallback | ✅ Active | All repositories use in-memory data |
| Migration files | ⏸ Not run | `prisma migrate dev` ready when DB is available |

### Notification mock
| Item | Status | Notes |
|------|--------|-------|
| Telegram mock | ✅ Active | `POST /api/v1/telegram/mock-message` |
| WhatsApp mock | ✅ Active | `POST /api/v1/whatsapp/mock-send` |
| Notification logs | ✅ Active | `GET /api/v1/notifications/logs` |
| Mock delay | ✅ Configured | `NOTIFICATION_MOCK_DELAY_MS=400` |
| Real Telegram bot | ⏸ Pending | `TELEGRAM_BOT_TOKEN=` (empty = mock mode) |
| Real WhatsApp | ⏸ Pending | `WHATSAPP_ACCESS_TOKEN=` (empty = mock mode) |

---

## Completed modules

| Module | Layer | Status |
|--------|-------|--------|
| Express + API Gateway | Infrastructure | ✅ Complete |
| JWT Auth + RBAC | Auth | ✅ Complete (mock) |
| Audit log system | Compliance | ✅ Complete (mock) |
| Event bus | Architecture | ✅ Complete (EventEmitter) |
| Patient repository | Domain | ✅ Complete (mock) |
| Nursing repository | Domain | ✅ Complete (mock) |
| Task repository | Domain | ✅ Complete (mock) |
| Alert repository | Domain | ✅ Complete (mock) |
| CRM repository | Domain | ✅ Complete (mock) |
| Rehab repository | Domain | ✅ Stub (mock) |
| Handover repository | Domain | ✅ Complete (mock) |
| Notification service | Integration | ✅ Complete (mock) |
| Telegram bridge | Integration | ✅ Complete (mock) |
| WhatsApp bridge | Integration | ✅ Complete (mock) |
| Dashboard frontend | Frontend | ✅ Connected (live backend) |
| Supervisor endpoints | Operations | ✅ Complete (mock) |
| Prisma schema | Database | ✅ Designed (12 models) |

---

## How to start

```bash
# Start central backend (port 5000)
cd wmc-ai-central-backend
npm run dev

# Start frontdesk dashboard (port 3000)
cd wmc-ai-frontdesk/web
pnpm run dev

# Verify backend
curl http://localhost:5000/api/v1/health

# Verify dashboard
open http://localhost:3000/dashboard
```

## Mock tokens (for testing protected endpoints)

```
mock-token-admin       → admin role
mock-token-supervisor  → supervisor role
mock-token-nurse       → nurse role
mock-token-therapist   → therapist role
mock-token-doctor      → doctor role
mock-token-frontdesk   → frontdesk role
```

## Mock login emails (AUTH_MODE=mock)

```
admin@wmc.dev       supervisor@wmc.dev   nurse@wmc.dev
therapist@wmc.dev   doctor@wmc.dev       frontdesk@wmc.dev
password: any
```

---

## Pending (Stage 5+)

- [ ] Connect real PostgreSQL (`DATABASE_ENABLED=true`)
- [ ] Run `prisma migrate dev --name init`
- [ ] Activate `AUTH_MODE=jwt` + seed real admin user
- [ ] Replace event bus with Redis Pub/Sub
- [ ] Connect real Telegram bot token
- [ ] Connect real WhatsApp Cloud API
- [ ] Add rate limiting + HTTPS (production hardening)
- [ ] Build report generation module
- [ ] Build AI summary engine worker
