# WMC AI Central Backend — Authentication & RBAC Architecture

**Location:** `D:\WMC-AI\wmc-ai-central-backend`  
**Status:** Mock login active · JWT infrastructure ready · Production hardening pending  
**Version:** 1.0 · 2026-05-20  
**Packages:** `jsonwebtoken` · `bcryptjs`

**Related:**

- [ARCHITECTURE-LAYERS.md](./ARCHITECTURE-LAYERS.md) — full layer diagram
- `src/modules/auth/` — login, refresh, logout, /me
- `src/modules/users/` — user identity and role management
- `src/shared/middleware/auth.middleware.js` — `requireAuth`
- `src/shared/middleware/role.middleware.js` — `requireRole`, convenience guards

---

## Auth modes

| Mode | `AUTH_MODE` env | How it works |
|------|----------------|--------------|
| **Mock** (current) | `mock` | Any `MOCK_USERS` email logs in with any password. Returns real signed JWTs. No DB needed. |
| **JWT** (production) | `jwt` | bcrypt password check against Prisma `users` table. Full token lifecycle. |

Switch by setting `AUTH_MODE` in `.env` — zero code changes required.

---

## Roles

| Role | Code | Clinical access | Admin access |
|------|------|----------------|--------------|
| `admin` | `admin` | Full | Full |
| `supervisor` | `supervisor` | Nursing + Rehab + CRM + Dashboard | Read-only |
| `nurse` | `nurse` | Nursing only | None |
| `therapist` | `therapist` | Rehab only | None |
| `doctor` | `doctor` | Patients + Escalations | None |
| `frontdesk` | `frontdesk` | CRM (leads + appointments) | None |

---

## JWT flow

```
Client                          API Gateway
  │                                  │
  │──── POST /api/v1/auth/login ─────▶│
  │     { email, password }           │
  │                                  │
  │                        auth.service.login()
  │                        ├── Mock: find in MOCK_USERS
  │                        └── JWT:  bcrypt.compare() + Prisma lookup
  │                                  │
  │◀──── 200 OK ─────────────────────│
  │  { accessToken, refreshToken,     │
  │    tokenType: "Bearer",           │
  │    expiresIn: "15m",              │
  │    user: { id, email, role } }    │
  │                                  │
  │──── GET /api/v1/patients ─────────▶│
  │     Authorization: Bearer <at>    │
  │                                  │
  │                        requireAuth middleware
  │                        ├── jwt.verify(token, JWT_SECRET)
  │                        └── attaches req.user
  │                                  │
  │◀──── 200 OK (patient data) ───────│
```

---

## Refresh token flow

Access tokens expire in **15 minutes**. The client uses the refresh token (7 days) to obtain a new access token without re-entering credentials.

```
Client                          API Gateway
  │                                  │
  │── POST /api/v1/auth/refresh ──────▶│
  │   { refreshToken: "<rt>" }        │
  │                                  │
  │                        1. jwt.verify(rt, JWT_REFRESH_SECRET)
  │                        2. Check refreshTokenStore (not revoked)
  │                        3. Fetch user (mock or Prisma)
  │                        4. Revoke old rt (token rotation)
  │                        5. Issue new accessToken + refreshToken
  │                                  │
  │◀── 200 { accessToken, refreshToken, rotated: true } ──│
```

**Token rotation:** Every `/auth/refresh` call revokes the old refresh token and issues a new one. This prevents replay attacks — a stolen refresh token can only be used once.

---

## Logout flow

```
Client                          API Gateway
  │                                  │
  │── POST /api/v1/auth/logout ───────▶│
  │   { refreshToken: "<rt>" }        │
  │                                  │
  │                        refreshTokenStore.delete(rt)
  │                        (access token is short-lived, no revocation needed)
  │                                  │
  │◀── 200 { message: "Logged out" } ─│
```

In production: store refresh tokens in `core.refresh_tokens` table (index by `user_id`, `expires_at`). Allow single-device or multi-device logout.

---

## Middleware usage

### `requireAuth`

Verifies the Bearer JWT. Attaches `req.user` on success.

```javascript
const { requireAuth } = require('../../shared/middleware/auth.middleware')

// Single route
router.get('/sensitive', requireAuth, handler)

// Entire router (apply before route definitions)
router.use(requireAuth)
```

### `requireRole(roles)`

Must run **after** `requireAuth`. Returns 403 if caller's role is not in the list.

```javascript
const { requireRole } = require('../../shared/middleware/role.middleware')

// Single role
router.get('/admin-only', requireAuth, requireRole('admin'), handler)

// Multiple roles
router.get('/nursing-ops', requireAuth, requireRole(['nurse', 'supervisor', 'admin']), handler)
```

### Convenience guards

| Export | Allowed roles |
|--------|--------------|
| `adminOnly` | `admin` |
| `supervisorOrAbove` | `admin`, `supervisor` |
| `clinicalStaff` | `admin`, `supervisor`, `nurse`, `doctor` |
| `nursingTeam` | `admin`, `supervisor`, `nurse` |
| `rehabTeam` | `admin`, `supervisor`, `therapist` |
| `crmTeam` | `admin`, `supervisor`, `frontdesk` |

```javascript
const { nursingTeam, rehabTeam, crmTeam } = require('../../shared/middleware/role.middleware')

router.get('/records', requireAuth, nursingTeam, handler)
router.get('/progress', requireAuth, rehabTeam, handler)
router.get('/leads',   requireAuth, crmTeam,    handler)
```

---

## Protected route map

| Path | Method | Guard | Notes |
|------|--------|-------|-------|
| `/api/v1/auth/login` | POST | Public | Returns tokens |
| `/api/v1/auth/refresh` | POST | Public | Token in body |
| `/api/v1/auth/logout` | POST | Public | Revokes refresh token |
| `/api/v1/auth/me` | GET | `requireAuth` | Returns caller identity |
| `/api/v1/users` | GET | `requireAuth + supervisorOrAbove` | List users |
| `/api/v1/users/me` | GET | `requireAuth` | Own profile |
| `/api/v1/users/:id` | GET | `requireAuth + adminOnly` | Admin only |
| `/api/v1/dashboard/admin` | GET | `requireAuth + adminOnly` | Example |
| `/api/v1/nursing/protected-example` | GET | `requireAuth + nursingTeam` | Example |
| `/api/v1/rehab/protected-example` | GET | `requireAuth + rehabTeam` | Example |
| `/api/v1/crm/protected-example` | GET | `requireAuth + crmTeam` | Example |

Existing domain routes (`/patients`, `/nursing/records`, `/tasks`, `/alerts`) are **open in development** (`AUTH_MODE=mock`). Apply guards when switching to `AUTH_MODE=jwt`.

---

## Mock tokens (development)

In `AUTH_MODE=mock`, the `requireAuth` middleware accepts these tokens without DB:

| Token | Role |
|-------|------|
| `mock-token-admin` | admin |
| `mock-token-supervisor` | supervisor |
| `mock-token-nurse` | nurse |
| `mock-token-therapist` | therapist |
| `mock-token-doctor` | doctor |
| `mock-token-frontdesk` | frontdesk |

```bash
# Test protected route as nurse
curl http://localhost:5000/api/v1/nursing/protected-example \
  -H "Authorization: Bearer mock-token-nurse"

# Test admin-only route
curl http://localhost:5000/api/v1/dashboard/admin \
  -H "Authorization: Bearer mock-token-admin"
```

---

## Mock users (development login)

In `AUTH_MODE=mock`, login with any `MOCK_USERS` email and any password:

| Email | Role |
|-------|------|
| `admin@wmc.dev` | admin |
| `supervisor@wmc.dev` | supervisor |
| `nurse@wmc.dev` | nurse |
| `therapist@wmc.dev` | therapist |
| `doctor@wmc.dev` | doctor |
| `frontdesk@wmc.dev` | frontdesk |

```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "nurse@wmc.dev", "password": "any" }'
```

---

## Prisma-ready User model

Defined in `prisma/schema.prisma` (add to `core` schema when User table is created):

```prisma
model User {
  id           String   @id @default(uuid()) @db.Uuid
  fullName     String   @map("full_name")
  email        String   @unique
  passwordHash String   @map("password_hash")
  role         String   // admin | supervisor | nurse | therapist | doctor | frontdesk
  isActive     Boolean  @default(true) @map("is_active")
  lastLoginAt  DateTime? @map("last_login_at")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  staff        Staff?

  @@map("users")
  @@schema("core")
}
```

---

## Healthcare security considerations

| Concern | Implementation |
|---------|---------------|
| **Short access token lifetime** | 15 minutes — limits exposure if token leaked |
| **Refresh token rotation** | Old token revoked on every refresh — replay attack prevention |
| **bcrypt password hashing** | Cost factor 10 — suitable for healthcare environments |
| **No passwords in logs** | Auth service never logs credentials |
| **Role-scoped endpoints** | Nurses cannot access CRM; frontdesk cannot access nursing records |
| **Soft deactivation** | `isActive=false` disables login without deleting user or audit trail |
| **PHI access control** | Patient data routes (`/patients`, `/nursing`) restricted to clinical roles |
| **No tokens in URLs** | Tokens only in `Authorization` header — never in query strings |
| **Idempotency keys** | Notification dedup prevents double-sends on auth retry |

---

## Future production hardening

| Item | Priority | Notes |
|------|----------|-------|
| Persist refresh tokens in `core.refresh_tokens` DB table | High | Survives process restart |
| Add `jti` claim to access tokens for revocation | High | Per-token revocation list |
| Rate-limit `/auth/login` (e.g. 5 req/min per IP) | High | Brute-force protection |
| HTTPS enforcement (`Strict-Transport-Security`) | High | No plaintext tokens |
| Add `iat`/`nbf` validation | Medium | Clock drift protection |
| Separate `JWT_SECRET` per environment | High | Dev secret never used in prod |
| Add Prisma `User` model + migration | Medium | Required for `AUTH_MODE=jwt` |
| Session audit log (`core.login_events`) | Medium | WHO logged in from WHERE |
| MFA (TOTP/SMS) for admin and supervisor | Medium | Healthcare compliance |
| Role upgrade approval workflow | Low | Nurse → Supervisor requires admin |

---

## Activation checklist (switching to production JWT)

```
[ ] 1. Set AUTH_MODE=jwt in .env
[ ] 2. Set strong JWT_SECRET and JWT_REFRESH_SECRET (min 64 chars random)
[ ] 3. Add User model to prisma/schema.prisma (core schema)
[ ] 4. Run: npx prisma migrate dev --name add_users
[ ] 5. Hash admin password: node -e "require('bcryptjs').hash('password',10).then(console.log)"
[ ] 6. Seed admin user in DB
[ ] 7. Apply requireAuth + role guards to all domain routes
[ ] 8. Create core.refresh_tokens table (replace in-memory Map)
[ ] 9. Add rate limiting middleware (express-rate-limit)
[ ] 10. Enable HTTPS / TLS termination
```

---

*Mock auth active — real JWT flow ready to activate with AUTH_MODE=jwt.*
