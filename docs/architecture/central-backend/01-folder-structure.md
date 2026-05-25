# 1 — Folder Architecture

## Design goals

- One **platform root** (`wmc-ai-platform/`) so central backend code is not buried inside Nursing.
- **Domain modules** stay isolated; shared code lives in `packages/`.
- **Integrations** (Telegram, WhatsApp, EHR) stay adapter-shaped and testable.
- **SQL migrations** remain in repo-level `databases/` (source of truth), referenced by `packages/shared-db`.

## Recommended monorepo layout

```
WMC-AI/                                    # existing ecosystem root
├── docs/architecture/central-backend/     # this planning set
├── databases/
│   ├── migrations/                        # ordered SQL (all schemas)
│   ├── postgres/
│   └── redis/
├── integrations/
│   ├── messaging/
│   │   ├── telegram/
│   │   └── whatsapp/
│   ├── webhooks/
│   └── api-clients/
├── shared-resources/
│   ├── ui/
│   ├── config/                            # shared env schema, constants
│   └── contracts/                         # OpenAPI / JSON Schema (new)
├── wmc-ai-platform/                       # NEW — central backend
│   ├── apps/
│   │   ├── api-gateway/
│   │   │   ├── src/
│   │   │   │   ├── app.ts
│   │   │   │   ├── server.ts
│   │   │   │   ├── config/
│   │   │   │   ├── middleware/
│   │   │   │   ├── routes/                # mounts domain routers only
│   │   │   │   └── bff/                   # dashboard-specific composers
│   │   │   ├── package.json
│   │   │   └── .env.example
│   │   ├── notification-worker/
│   │   │   └── src/
│   │   │       ├── worker.ts
│   │   │       ├── processors/
│   │   │       └── adapters/              # thin wrappers → integrations/
│   │   └── ai-worker/
│   │       └── src/
│   │           ├── worker.ts
│   │           ├── jobs/
│   │           └── providers/             # OpenAI, local stub, etc.
│   ├── packages/
│   │   ├── shared-auth/
│   │   │   └── src/ jwt, rbac, session types
│   │   ├── shared-db/
│   │   │   └── src/ pool, migrations runner, repositories base
│   │   ├── shared-types/
│   │   │   └── src/ domain DTOs, API envelopes
│   │   ├── shared-utils/
│   │   │   └── src/ logger, errors, dates, validation
│   │   ├── domain-core/
│   │   │   └── src/ users, patients, meta, health
│   │   ├── domain-crm/
│   │   │   └── src/ leads, pipeline, appointments
│   │   ├── domain-nursing/
│   │   │   └── src/ vitals, handover, alerts, OT, ...
│   │   ├── domain-rehab/
│   │   │   └── src/ sessions, progress, goals
│   │   ├── domain-dashboard/
│   │   │   └── src/ read models, rollups
│   │   └── domain-notifications/
│   │       └── src/ templates, outbox, delivery log
│   ├── package.json                       # workspace root
│   └── tsconfig.base.json
├── wmc-ai-nursing/                        # existing — UI + coordinator
├── wmc-ai-rehabilitation/
├── wmc-ai-crm/
├── wmc-ai-core/
└── wmc-ai-frontdesk/
```

## Per-app internal structure (Express module pattern)

Mirror the proven layout in `wmc-ai-backend`:

```
packages/domain-nursing/src/
├── index.ts                    # export createNursingRouter(deps)
├── nursing.routes.ts
├── nursing.controller.ts
├── nursing.service.ts
├── nursing.repository.ts
├── nursing.validation.ts
└── nursing.types.ts
```

**Rules**

| Layer | Responsibility |
|-------|----------------|
| `*.routes.ts` | HTTP verbs, path params, middleware chain |
| `*.controller.ts` | Request/response mapping, status codes |
| `*.service.ts` | Business rules, orchestration, events |
| `*.repository.ts` | SQL only; no Express imports |
| `*.validation.ts` | Zod (or similar) schemas |

## What stays in existing project folders (phase 1)

| Keep temporarily | Migrate later to |
|--------------------|------------------|
| `wmc-ai-backend/src/modules/*` | `wmc-ai-platform/packages/domain-*` |
| `wmc-ai-crm/wmc-ai-crm/api` | `domain-crm` + gateway mount |
| Coordinator `telegramWebhookServer.js` | `integrations/messaging/telegram` + worker |
| Next.js `app/api/*` in domain webs | Gateway proxies or delete once clients use central API |

## `integrations/` vs `packages/domain-notifications`

- **`integrations/`** — vendor SDKs, webhook parsers, HMAC verification, rate limits.
- **`domain-notifications`** — business rules: who gets what template, priority, quiet hours, audit.

Workers call: `domain-notifications` → `integrations/messaging/*`.

## `shared-resources/contracts/`

Add versioned API contracts consumed by:

- Next.js apps (generated types optional)
- Gateway OpenAPI export
- Integration test fixtures

## pnpm workspace extension

When implementing, extend `pnpm-workspace.yaml`:

```yaml
packages:
  - "wmc-ai-platform/apps/*"
  - "wmc-ai-platform/packages/*"
  # existing web packages...
```

## Naming conventions

| Item | Convention |
|------|------------|
| Package names | `@wmc/domain-nursing`, `@wmc/shared-auth` |
| Env prefix | `WMC_` for platform; `WMC_AI_` for LLM keys |
| Route prefix | `/api/v1` global; domain segment `/nursing`, `/crm`, `/rehab` |
| DB schemas | `core`, `crm`, `nursing`, `rehab`, `notify`, `ai` |
