# WMC AI Backend — Architecture

## Overview

**wmc-ai-backend** is a modular **Express + TypeScript** API for Wong Medical Centre AI: authentication with RBAC, patient records, CRM leads, nursing coordinator workflows, rehabilitation sessions, and AI endpoints (stubbed until LLM providers are wired).

```
Clients (portal, WhatsApp bridge, mobile)
        │
        ▼
   Express createApp()  —  /api/v1/*
        │
        ├── modules/meta           GET /api/v1 — service catalog (no auth)
        ├── modules/auth           JWT login, /me
        ├── modules/patients      CRUD + medical summary
        ├── modules/crm           leads, pipeline, follow-up
        ├── modules/nursing       reports, vitals, meds, alerts, doctor queue
        ├── modules/rehabilitation sessions + AI progress summary field
        └── modules/ai            stubs → ai_results tab / table
        │
        ▼
   sheetDb (persistence)
        ├── SHEETS_MODE=file      DATA_DIR/wmc-ai-store.json (tabs = arrays)
        ├── SHEETS_MODE=google    one JSON object per cell in column A per worksheet
        └── future: Postgres vs docs/schema/postgresql.sql
```

## Module responsibilities

| Module | Responsibility | Roles (typical) |
|--------|----------------|-----------------|
| **meta** | `GET /api/v1` JSON discovery (version, module base paths) | — (unauthenticated) |
| **auth** | POST /auth/login, GET /auth/me, bcrypt + JWT | all |
| **patients** | Patient CRUD, medicalSummary | clinical + admin |
| **crm** | Leads (WhatsApp / Google Form-aligned fields), status, pipeline, followUpAt | admin, receptionist, doctor |
| **nursing** | Daily reports, vitals, medications, alerts (photoUrlPlaceholder), doctor review queue | admin, doctor, nurse |
| **rehabilitation** | Sessions: pain score, mobility, therapist notes, optional aiProgressSummary | admin, doctor, therapist |
| **ai** | Stub NLP outputs; stores rows in ai_results | all authenticated roles |

## Persistence strategy

1. **Now:** `SheetDb` in `src/db/sheet-db.interface.ts`, implemented by local JSON (`file-sheet-db.ts`) or Google Sheets (`google-sheet-db.ts`).
2. **Later:** Same contract (or a repository layer) backed by PostgreSQL using `docs/schema/postgresql.sql`.

Worksheet / table names live in `src/db/sheet-tabs.ts` and should stay aligned with the SQL schema.

## Security

- JWT secret via `JWT_SECRET`; use a strong value in shared or production environments.
- Passwords hashed with bcrypt (`scripts/seed-local-db.ts`).
- Add rate limiting, audit logs, and HTTPS termination at the edge before production.

## AI integration

`src/modules/ai/ai.service.ts` returns deterministic placeholder text and records each run in `ai_results`. Replace this layer with OpenAI, Vertex AI, or an internal model service; keep request/response shapes stable for the frontend.
