# 8 — Inter-Service Communication

## Evolution path

| Phase | Style | When |
|-------|--------|------|
| **1** | In-process function calls between domain packages | Now — single gateway process |
| **2** | Shared DB + outbox + Redis queues | Notifications, AI workers |
| **3** | Internal HTTP + optional event bus | Scale teams / deploy independently |

Avoid microservices until phase 3 triggers are met (see [10-implementation-phases.md](./10-implementation-phases.md)).

## Phase 1: In-process (modular monolith)

```typescript
// apps/api-gateway/src/deps.ts
export function createDeps(pool: Pool) {
  const patients = createPatientsService(pool)
  const nursing = createNursingService(pool, { patients })
  const notifications = createNotificationsService(pool)
  return { patients, nursing, notifications, ... }
}
```

- Domain packages export **factory functions**, not singleton globals.
- Cross-domain calls go through **service interfaces**, not direct repository imports.

## Phase 2: Async jobs (workers)

### Redis queue (BullMQ recommended)

| Queue | Producer | Consumer |
|-------|----------|----------|
| `notify:outbound` | domain-notifications | notification-worker |
| `ai:jobs` | domain-ai | ai-worker |
| `dashboard:refresh` | cron | api-gateway job runner |

### Domain events (lightweight)

Publish after commit:

```typescript
// Event payload (typed)
type DomainEvent =
  | { type: 'nursing.alert.created'; alertId: string; patientId: string; severity: string }
  | { type: 'crm.lead.followup_due'; leadId: string }
  | { type: 'rehab.session.completed'; sessionId: string }
```

| Transport | Use |
|-----------|-----|
| Same process | `EventEmitter` for tests |
| Production | Insert outbox row + Redis LPUSH (no separate Kafka initially) |

**Handlers** live in `domain-notifications/src/events/` — subscribe in worker startup.

## Phase 3: Internal HTTP

When `nursing-api` splits from gateway:

```
https://internal.wmc.local/nursing/v1/...
Authorization: Bearer <service-jwt>
X-Request-Id: <uuid>
```

| Concern | Approach |
|---------|----------|
| Discovery | K8s services or env `WMC_NURSING_API_URL` |
| Timeouts | 5s default; 30s for reports |
| Retries | Idempotent GET only; POST with idempotency key |
| Circuit breaker | opossum or simple failure counter |

## Synchronous vs asynchronous decision tree

```
Need response in < 500ms for UI?
  YES → sync domain service call (rules, CRUD)
  NO  → enqueue job (LLM, WhatsApp send, heavy report)

Cross-domain read for dashboard?
  YES → BFF composer or materialized view
  NO  → domain API only

External provider (Telegram/WhatsApp)?
  ALWAYS async outbox after DB commit
```

## Idempotency

| Operation | Key |
|-----------|-----|
| Create alert + notify | `nursing:alert:{id}:notify` |
| AI summarize handover | `ai:handover:{handoverId}:v1` |
| CRM WhatsApp follow-up | `crm:lead:{leadId}:followup:{date}` |

## Correlation & tracing

- Gateway sets `X-Request-Id` (UUID)
- Propagate to workers, DB `audit_log`, notification `meta.requestId`
- OpenTelemetry hooks in `shared-utils` (phase 3)

## Anti-patterns to avoid

- Domain A directly SQL-updating Domain B's tables
- Next.js server calling Google Sheets while gateway uses Postgres (dual write)
- LLM calls inside HTTP request thread
- Circular package imports (`domain-nursing` ↔ `domain-crm`) — use events or `domain-core` only

## CRM ↔ Nursing linkage

- `crm_leads.converted_patient_id` → `core.patients.id` (nullable FK)
- Conversion event emits `crm.lead.converted` → nursing intake checklist notification

## File / legacy coordinator

`wmc-ai-nursing-coordinator` JS stores (loop storage) migrate to Postgres gradually:

- Read from API only for new UI
- One-way sync scripts until deprecated
