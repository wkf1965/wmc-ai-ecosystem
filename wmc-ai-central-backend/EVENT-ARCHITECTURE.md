# WMC AI Central Backend — Event Bus & Inter-Service Communication Architecture

**Location:** `D:\WMC-AI\wmc-ai-central-backend`  
**Status:** Node EventEmitter active · Redis/RabbitMQ adapter-ready  
**Version:** 1.0 · 2026-05-20

**Related files:**

- `src/core/events/event-bus.js` — singleton bus, `emitEvent`, `onEvent`
- `src/core/events/event-types.js` — all 30 event type constants
- `src/core/events/event-listeners.js` — domain listener registry
- `src/shared/state/dashboard-state.js` — refresh signals + escalation queue
- `src/shared/state/ai-summary-queue.js` — AI job queue stub
- `GET /api/v1/events/recent` — live event log viewer

---

## Why event-driven architecture in healthcare?

Traditional request-response architecture tightly couples modules:

```
❌ Direct coupling
NursingController → AuditService
NursingController → DashboardService
NursingController → AIService
NursingController → NotificationService
```

With an event bus, the nursing module emits one event and walks away:

```
✅ Event-driven decoupling
NursingController → emitEvent(NURSING_RECORD_CREATED, payload)
                         │
                         ├──▶ AuditListener      → write audit log
                         ├──▶ DashboardListener  → mark refresh needed
                         ├──▶ AIListener         → enqueue summary job
                         └──▶ (future) PushListener → WebSocket to dashboard
```

Benefits:
- **Modules don't know about each other** — nursing doesn't import audit, AI, or dashboard
- **Add new behaviour without touching existing code** — just register a new listener
- **Async workflows** — listeners run independently without blocking the HTTP response
- **Testability** — emit events in unit tests without spinning up real services

---

## Event bus architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WMC AI Central Backend                          │
│                                                                         │
│  ┌───────────┐    emitEvent()    ┌─────────────────────────────────┐   │
│  │ Controller│ ────────────────▶ │         Event Bus               │   │
│  │ Service   │                   │  (Node EventEmitter singleton)  │   │
│  └───────────┘                   └────────────────┬────────────────┘   │
│                                                   │                     │
│                          ┌────────────────────────┼──────────────────┐ │
│                          │                        │                  │ │
│                     ┌────▼────┐          ┌────────▼──────┐   ┌──────▼─┤ │
│                     │ Audit   │          │  Dashboard    │   │  AI    │ │
│                     │Listener │          │  Listener     │   │ Queue  │ │
│                     └────┬────┘          └───────┬───────┘   └──────┬─┘ │
│                          │                       │                  │   │
│                     AUDIT_STORE          dashboard-state.js    ai-summary│
│                                                                  -queue  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Notification Listener → sendNotification() → Telegram / WhatsApp│ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Event types (30 total)

| Group | Event | Emitted by |
|-------|-------|-----------|
| **auth** | `USER_LOGGED_IN` | auth.service |
| | `USER_LOGGED_OUT` | auth.service |
| | `USER_TOKEN_REFRESHED` | auth.service |
| **patients** | `PATIENT_CREATED` | patient.controller |
| | `PATIENT_UPDATED` | patient.controller |
| | `PATIENT_DISCHARGED` | patient.controller |
| **nursing** | `NURSING_RECORD_CREATED` | nursing.controller |
| | `NURSING_RECORD_UPDATED` | nursing.controller |
| | `SHIFT_HANDOVER_GENERATED` | handover route |
| **alerts** | `VITAL_ALERT_TRIGGERED` | alert.controller |
| | `ALERT_ACKNOWLEDGED` | alert.controller |
| | `DOCTOR_ESCALATION_TRIGGERED` | alert.controller |
| | `INCIDENT_REPORTED` | alert.controller |
| **tasks** | `TASK_CREATED` | task.controller |
| | `TASK_COMPLETED` | task.controller |
| | `TASK_OVERDUE` | scheduled job (future) |
| **rehab** | `REHAB_PROGRESS_UPDATED` | rehab.controller |
| | `REHAB_SESSION_COMPLETED` | rehab.controller |
| **crm** | `CRM_LEAD_CREATED` | crm.controller |
| | `CRM_LEAD_CONVERTED` | crm.controller |
| | `APPOINTMENT_BOOKED` | crm.controller |
| | `APPOINTMENT_CANCELLED` | crm.controller |
| **notifications** | `FAMILY_UPDATE_SENT` | notification.controller |
| | `NOTIFICATION_SENT` | notification.service |
| | `NOTIFICATION_FAILED` | notification.service |
| **ai** | `AI_SUMMARY_REQUESTED` | ai-summary.controller |
| | `AI_SUMMARY_COMPLETED` | ai-summary worker |
| | `DASHBOARD_REFRESH_REQUESTED` | dashboard.controller |
| **system** | `AUDIT_EVENT_LOGGED` | audit-logger |
| | `SYSTEM_HEALTH_CHECKED` | health route |

---

## Listener map

### NURSING_RECORD_CREATED

```
→ AuditListener       write CREATE_NURSING_RECORD to audit log
→ DashboardListener   markRefreshNeeded('nursing', patientId)
→ AIListener          enqueue AI summary job for patient
```

### DOCTOR_ESCALATION_TRIGGERED

```
→ AuditListener       write ESCALATION_TRIGGERED to audit log
→ TelegramListener    send 🚨 ESCALATION alert to doctor on-call chat
→ WhatsAppListener    send ESCALATION message to supervisor phone
→ DashboardListener   addEscalation({ patientId, reason, triggeredBy })
```

### VITAL_ALERT_TRIGGERED

```
→ AuditListener       write CREATE_ALERT to audit log
→ TelegramListener    send ⚠️ Vital alert to supervisor chat
→ DashboardListener   markRefreshNeeded('alerts', patientId)
```

### SHIFT_HANDOVER_GENERATED

```
→ AuditListener       write CREATE_HANDOVER_LOG
→ AIListener          enqueue high-priority AI summary job
→ TelegramListener    notify incoming nurse group
```

### PATIENT_DISCHARGED

```
→ AuditListener       write DISCHARGE_PATIENT
→ WhatsAppListener    send discharge notification to family
```

### CRM_LEAD_CREATED

```
→ AuditListener       write CREATE_CRM_LEAD
→ TelegramListener    notify CRM team chat of new lead
```

---

## emitEvent() usage

```javascript
const { emitEvent } = require('../../core/events/event-bus')
const { EVENT_TYPES } = require('../../core/events/event-types')

// Basic emit
emitEvent(EVENT_TYPES.NURSING_RECORD_CREATED, {
  patientId,
  nurseName,
  recordId,
  userId:    req.user?.id,
  userRole:  req.user?.role,
  ipAddress: req.ip,
})

// With context enrichment
emitEvent(EVENT_TYPES.DOCTOR_ESCALATION_TRIGGERED, {
  patientId,
  reason:          'Critical BP 180/120',
  userId:          req.user?.id,
  userRole:        req.user?.role,
  doctorChatId:    '-100123456789',    // Telegram group
  supervisorPhone: '+60123456789',     // WhatsApp number
})
```

## onEvent() — registering a new listener

```javascript
const { onEvent } = require('../../core/events/event-bus')
const { EVENT_TYPES } = require('../../core/events/event-types')

// In event-listeners.js (bootstrapEventListeners):
onEvent(EVENT_TYPES.NURSING_RECORD_CREATED, async ({ payload }) => {
  // payload = everything passed to emitEvent()
  await someService.doSomethingWith(payload.patientId)
})
```

Errors inside listeners are caught by the bus wrapper — they **never crash the emitting thread**.

---

## Async workflows

All listeners are declared `async` and run after the HTTP response is sent. The emitting controller does not wait for listeners to complete:

```
POST /nursing/records → create record → emitEvent() → respond 201
                                             │
                                   (async, non-blocking)
                                             │
                                   ┌─────────┴─────────┐
                                   │ audit log written  │
                                   │ dashboard refreshed│
                                   │ AI job queued      │
                                   └───────────────────┘
```

---

## Module decoupling diagram

```
                    ┌─────────────────┐
                    │   Event Bus     │
                    │  (single hub)   │
                    └────────┬────────┘
          ┌──────────────────┼──────────────────┐
          │                  │                  │
   ┌──────▼──────┐   ┌───────▼──────┐   ┌──────▼──────┐
   │   Nursing   │   │    Alerts    │   │    Tasks    │
   │   Module    │   │    Module    │   │   Module    │
   └─────────────┘   └─────────────┘   └─────────────┘
          ▲                  ▲                  ▲
          │                  │                  │
   emits events        emits events        emits events
          │                  │                  │
   ┌──────┴──────────────────┴──────────────────┴──────┐
   │               No direct imports between modules    │
   │          Nursing ≠ import Audit ≠ import Dashboard│
   └───────────────────────────────────────────────────┘
```

---

## Current vs future backends

| Property | Current (EventEmitter) | Future (Redis/RabbitMQ) |
|----------|----------------------|------------------------|
| Scope | In-process only | Cross-process / multi-instance |
| Durability | Lost on crash | Persisted in queue |
| Delivery guarantee | At-most-once | At-least-once (with ack) |
| Retry | None | Configurable backoff |
| Dead-letter queue | None | Auto-capture failed jobs |
| Fan-out | Multiple listeners per event | Exchange-based routing |
| Monitoring | Console log + `/events/recent` | Queue dashboard (Bull UI etc) |

### Redis/RabbitMQ migration plan

The bus is designed with an **adapter pattern** — swap the backend without changing emitters or listeners:

```javascript
// Current (event-bus.js):
bus.emit(type, envelope)          // Node EventEmitter

// Future Redis adapter:
await redisClient.publish(type, JSON.stringify(envelope))

// Future RabbitMQ adapter:
await channel.publish('wmc-events', type, Buffer.from(JSON.stringify(envelope)))
```

Emitters and listeners use only `emitEvent()` and `onEvent()` — they never touch the underlying transport. Migration = swap the implementation inside `event-bus.js`.

---

## API endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/events` | Public | Module info + event type manifest |
| `GET` | `/api/v1/events/recent` | admin, supervisor | Live event log (last 200) |
| `GET` | `/api/v1/events/types` | admin, supervisor | All event type constants |
| `GET` | `/api/v1/events/dashboard-state` | admin, supervisor | Pending refreshes + escalations |
| `GET` | `/api/v1/events/ai-queue` | admin, supervisor | AI summary job queue |

---

## Scalability path

```
Phase 1 (current)   Node EventEmitter — single process, development
Phase 2             Redis Pub/Sub — multi-instance, same datacenter
Phase 3             RabbitMQ / Kafka — distributed, retry, dead-letter
Phase 4             Event sourcing — full event replay and state reconstruction
Phase 5             CQRS — separate read/write models per domain
```

---

## Adding a new listener (checklist)

```
1. Define event type in event-types.js (if new)
2. Add onEvent(...) block in event-listeners.js bootstrapEventListeners()
3. Use payload fields emitted by the source controller
4. Keep listener async + non-blocking (no await chains > 500ms)
5. Catch errors inside the listener (bus wrapper handles uncaught ones)
6. Test: emit the event manually via /api/v1/events/recent to verify it appears
```

---

*Event bus active — 13 listener types registered across auth, nursing, alerts, tasks, patients, rehab, CRM, and family notifications.*
