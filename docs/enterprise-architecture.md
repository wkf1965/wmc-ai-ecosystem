# Enterprise Architecture

- API-first boundary for each domain.
- Domain apps under `wmc-ai-*` with Next.js and local API routes.
- Shared UI and contracts in `shared-resources`.
- Infra-as-code in `deployments`.
- Data contracts and SQL history in `databases`.

## Central backend (planned)

Full planning set: **[architecture/central-backend](./architecture/central-backend/README.md)** — API gateway, shared Postgres schemas, auth, AI worker, notifications, dashboard BFF, and phased migration from `wmc-ai-backend`.