# 10 — Recommended Implementation Phases

Planning-only roadmap. Each phase has exit criteria before starting the next.

---

## Phase 0 — Foundation (1–2 weeks)

**Goal:** Scaffold platform without breaking existing apps.

| Task | Deliverable |
|------|-------------|
| Create `wmc-ai-platform/` workspace | Empty apps + packages with TypeScript base |
| Add architecture docs to CI/readme links | This folder linked from root README |
| Define `shared-resources/contracts` OpenAPI skeleton | Paths for auth, patients, nursing |
| Docker compose for Postgres + Redis | Local dev boots with one command |
| Copy `postgresql.sql` → `databases/migrations/001_*` | Schema namespaced |

**Exit criteria**

- [ ] `pnpm dev` starts gateway with `/health` only
- [ ] Migrations apply cleanly on empty DB

---

## Phase 1 — Core + Auth + Gateway shell (2–3 weeks)

**Goal:** Central login and patient API; Next.js apps can point to one URL.

| Task | Deliverable |
|------|-------------|
| Implement `@wmc/shared-auth`, `@wmc/shared-db` | JWT + pool |
| Migrate `modules/auth`, `modules/patients`, `modules/meta` from wmc-ai-backend | `domain-core` |
| Gateway mounts `/api/v1/auth`, `/patients` | Parity with existing API |
| Seed users script | Same roles as current seed |
| Feature flag in nursing web: `NEXT_PUBLIC_API_URL` | Toggle central API |

**Exit criteria**

- [ ] Nursing UI logs in against new gateway
- [ ] Existing smoke tests adapted or duplicated

---

## Phase 2 — Domain migration: Nursing (3–4 weeks)

**Goal:** Largest module set moves behind gateway.

| Task | Deliverable |
|------|-------------|
| Extract nursing modules to `@wmc/domain-nursing` | handover, vitals, alerts, OT, etc. |
| Postgres repositories replace SheetDb for nursing tables | Feature flag `WMC_DB_MODE=postgres` |
| Deprecate file/google store for nursing paths | Read-only fallback one release |
| Keep route paths identical | No frontend churn |

**Exit criteria**

- [ ] Critical flows on Postgres: vitals, alerts, handover
- [ ] Sheet mode documented as legacy

---

## Phase 3 — CRM + Rehab (2–3 weeks each, can overlap)

**Goal:** Unify CRM and rehab under same auth and patients.

| Task | Deliverable |
|------|-------------|
| Port `wmc-ai-crm` API into `@wmc/domain-crm` | Leads, pipeline, agents hooks |
| Port rehab routes from wmc-ai-backend + rehabilitation web APIs | `@wmc/domain-rehab` |
| Link `converted_patient_id` on lead conversion | core.patients FK |
| Remove duplicate patient stores in CRM | |

**Exit criteria**

- [ ] CRM web uses gateway for leads
- [ ] Rehab sessions reference central `patient_id`

---

## Phase 4 — Notifications (2–3 weeks)

**Goal:** Reliable Telegram / WhatsApp outbound + inbound webhooks.

| Task | Deliverable |
|------|-------------|
| `notify` schema + outbox | Migrations applied |
| `notification-worker` + integrations adapters | |
| Move `telegramWebhookServer.js` to gateway `/webhooks/telegram` | |
| Wire nursing family updates + CRM follow-ups to outbox | |
| Admin retry API | |

**Exit criteria**

- [ ] End-to-end: create alert → WhatsApp/Telegram delivery logged
- [ ] Inbound Telegram command routes to CRM or nursing handler

---

## Phase 5 — AI Summary Engine (2–3 weeks)

**Goal:** Async LLM jobs with stub provider in dev.

| Task | Deliverable |
|------|-------------|
| `ai_jobs` + worker | |
| `@wmc/domain-ai` enqueue + poll APIs | |
| Handover + rehab progress kinds first | |
| Stub + OpenAI providers | |
| UI: show job status / result | |

**Exit criteria**

- [ ] Handover summary generated async with stored `ai_results`
- [ ] No LLM calls blocking sync clinical endpoints

---

## Phase 6 — Dashboard BFF (2 weeks)

**Goal:** Unified command center + Telegram snapshot from gateway.

| Task | Deliverable |
|------|-------------|
| `bff/command-center`, `bff/telegram-snapshot` | |
| Role-based widget meta endpoint | |
| Optional Redis cache | |
| Coordinator dashboard reads central API | |

**Exit criteria**

- [ ] Telegram dashboard hook works against new snapshot URL
- [ ] Command center parity with `GET /command-center/status`

---

## Phase 7 — Hardening & ops (ongoing)

| Task | Deliverable |
|------|-------------|
| Rate limiting, audit log, HTTPS | |
| Split DB roles | `wmc_api`, `wmc_notify`, `wmc_ai` |
| Observability (metrics, tracing) | |
| K8s manifests in `deployments/kubernetes` | |
| Decommission standalone wmc-ai-backend deploy | Single platform image |

**Exit criteria for “central backend complete”**

- [ ] One production API URL for all domain apps
- [ ] Postgres sole source of truth
- [ ] Workers running for notify + AI
- [ ] Legacy coordinator storage retired or read-only archive

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Big-bang migration | Strangler: route proxy from old backend to new packages |
| Dual data stores | Time-box SheetDb; per-module cutover |
| Webhook downtime during move | Blue/green webhook URL at load balancer |
| LLM cost / latency | Queue + stub default; caps per `kind` |

---

## Team parallelization

| Stream A | Stream B |
|----------|----------|
| Phase 1–2 gateway + nursing | Phase 0 infra + migrations |
| Phase 4 notifications | Phase 5 AI worker |
| Phase 6 dashboard BFF | Phase 3 CRM |

---

## Success metrics

- p95 API latency < 300ms for sync clinical reads (excl. AI)
- Notification delivery success rate > 99% (after retries)
- Zero duplicate patient records across CRM/nursing
- All domain apps authenticate via single issuer
