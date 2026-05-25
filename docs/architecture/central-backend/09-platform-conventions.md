# 9 — Platform Conventions (Node, Express, PostgreSQL, Utils, Env)

Recommendations aligned with existing `wmc-ai-backend` patterns.

## Node.js backend structure

| Choice | Recommendation |
|--------|----------------|
| Runtime | Node 20 LTS |
| Language | TypeScript strict |
| Module system | ESM (`"type": "module"`) — match current backend |
| Package manager | pnpm workspaces |
| Test runner | Vitest or Node native test |
| Validation | Zod at HTTP boundary |

### Workspace scripts (platform root)

```json
{
  "scripts": {
    "dev": "pnpm --filter @wmc/api-gateway dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "db:migrate": "node packages/shared-db/scripts/migrate.js",
    "db:seed": "node packages/shared-db/scripts/seed.js"
  }
}
```

## Express architecture

### App factory

```typescript
// apps/api-gateway/src/app.ts
export function createApp(deps: AppDeps) {
  const app = express()
  // global middleware
  app.use(config.apiPrefix, createApiRouter(deps))
  app.use(errorHandler)
  return app
}
```

### Conventions (from existing backend)

| Practice | Detail |
|----------|--------|
| Routers per domain | One `*Router` per package, mounted in gateway |
| Async errors | `asyncHandler` wrapper → `next(err)` |
| Errors | `AppError` with `statusCode`, `code` |
| Auth | `apiAuthMiddleware` on `/api/v1` + per-route `requireRoles` |
| Body limit | 2mb default; larger only on upload routes |
| Logging | `morgan` dev / structured JSON prod |

### Controller pattern

```typescript
// Thin controller
export const getAlert = asyncHandler(async (req, res) => {
  const alert = await nursingService.getAlert(req.params.id, req.user)
  res.json(alert)
})
```

### Avoid

- Business logic in route files
- Raw SQL in controllers
- Multiple Express apps on different ports per domain (phase 1)

## PostgreSQL structure

| Topic | Convention |
|-------|------------|
| Schemas | `core`, `crm`, `nursing`, `rehab`, `notify`, `ai`, `dashboard` |
| PKs | UUID `uuid_generate_v4()` |
| Timestamps | `TIMESTAMPTZ` with `now()` defaults |
| Migrations | `databases/migrations/NNN_description.sql` |
| Queries | Parameterized only; repositories use `pg` or Drizzle |
| Enums | Postgres ENUM for stable domains; lookup tables if values change often |
| JSON | `JSONB` for `meta`, `payload`; document shape in TypeScript |

### Repository base (`@wmc/shared-db`)

```typescript
export abstract class BaseRepository {
  constructor(protected pool: Pool) {}
  protected async query<T>(text: string, params?: unknown[]) { ... }
}
```

### Search path

```sql
SET search_path TO core, nursing, crm, rehab, notify, ai, public;
```

Or always qualify: `nursing.nursing_alerts`.

## Shared utilities (`@wmc/shared-utils`)

```
shared-utils/src/
├── logger.ts              # pino or winston
├── errors.ts              # AppError, NotFoundError
├── async-handler.ts
├── dates.ts               # facility timezone Asia/Kuala_Lumpur
├── phone.ts               # E.164 normalize (WhatsApp)
├── pagination.ts          # cursor + limit
├── id.ts                  # uuid validate
└── result.ts              # optional Result<T,E> for services
```

## Shared types (`@wmc/shared-types`)

- API envelopes: `PaginatedResponse<T>`, `ApiError`
- Re-export domain DTOs consumed by Next.js via `shared-resources/contracts`

## Environment variables structure

### Layering

```
.env                    # local only, gitignored
.env.example            # committed template per app
config/env.schema.ts    # Zod validate at boot — fail fast
```

### Naming

| Prefix | Scope |
|--------|--------|
| `WMC_` | Platform-wide |
| `WMC_DB_` / `DATABASE_URL` | Postgres |
| `WMC_REDIS_URL` | Redis |
| `WMC_JWT_*` | Auth |
| `WMC_AI_*` | LLM provider |
| `WMC_TELEGRAM_*`, `WMC_WHATSAPP_*` | Messaging |
| `WMC_SERVICE_TOKEN_*` | Worker auth |

### `apps/api-gateway/.env.example`

```bash
NODE_ENV=development
PORT=4000
API_PREFIX=/api/v1

# Database
DATABASE_URL=postgresql://wmc:wmc@localhost:5432/wmc_ai
WMC_DB_POOL_MAX=10

# Redis
WMC_REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=change-me
JWT_EXPIRES_IN=7d
WMC_DEMO_AUTH=1
WMC_DEMO_AUTH_TOKEN=demo-token

# AI
WMC_AI_PROVIDER=stub
WMC_AI_API_KEY=
WMC_AI_MODEL_DEFAULT=gpt-4o-mini

# Messaging
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=

# Legacy migration only
SHEETS_MODE=file
DATA_DIR=./data/store
```

### Config module pattern

```typescript
// packages/shared-config or per-app config/env.ts
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32).optional(),
})

export const config = EnvSchema.parse(process.env)
```

Production: require `JWT_SECRET` min length; reject demo auth.

## Docker / local dev

- `deployments/docker/docker-compose.yml` — postgres, redis, api-gateway, workers
- Health: `/health` liveness, `/ready` checks DB + Redis

## Code quality

- ESLint + Prettier shared config in `wmc-ai-platform/`
- Pre-commit: lint + test smoke on gateway
- No secrets in `DEV-LOG.md` or committed `.env`
