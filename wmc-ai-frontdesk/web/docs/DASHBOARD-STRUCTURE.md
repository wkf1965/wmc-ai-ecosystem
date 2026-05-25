# Frontdesk dashboard — folder structure

```
wmc-ai-frontdesk/web/src/
├── app/
│   └── dashboard/
│       └── page.tsx              # Route: /dashboard — renders CommandCenterDashboard
├── components/
│   └── dashboard/                # Reusable UI (Tailwind + @wmc/ui)
│       ├── index.ts              # Barrel exports
│       ├── CommandCenterDashboard.tsx   # Main client layout
│       ├── CentralBackendStatusCard.tsx # Live /api/health card
│       ├── DomainStatusWidget.tsx       # Nursing / Rehab / CRM cards
│       ├── MetricWidget.tsx             # KPI tiles (alerts, risk, emergency)
│       ├── DashboardCard.tsx            # Card shell
│       └── StatusPill.tsx               # Online / offline badges
├── hooks/
│   └── useCentralBackendHealth.ts  # Poll central API + attach mock metrics
└── lib/
    └── api/
        ├── config.ts               # NEXT_PUBLIC_CENTRAL_API_URL
        ├── types.ts
        ├── central-backend.client.ts
        ├── mock-dashboard.ts
        └── nursing/
            ├── config.ts           # NEXT_PUBLIC_NURSING_API_URL
            ├── types.ts
            ├── nursing-backend.client.ts  # 6 nursing endpoints
            └── mock-nursing-dashboard.ts
```

## Data flow

**Central backend**

1. `useCentralBackendHealth` → `GET http://localhost:5000/api/health`
2. Mock domain tiles for Rehab/CRM until connected

**Nursing backend**

1. `useNursingDashboard` → parallel fetch:
   - `GET /patients`
   - `GET /nursing/records`
   - `GET /dashboard/summary`
   - `GET /tasks/queue`
   - `GET /supervisor/escalation-queue`
   - `GET /command-center/status`
2. On failure → `mock-nursing-dashboard.ts`
3. UI auto-refreshes every 30 seconds

**AI summary & risk monitoring** (`components/dashboard/widgets/`)

Each widget uses `useInsightWidget` + `nursing-insights.client.ts`:

| Widget | Endpoint |
|--------|----------|
| PredictiveRiskPanel | `GET /analytics/predictive-risk` |
| NightShiftMonitorPanel | `GET /night-shift/monitor` |
| DailyFacilityReportPanel | `GET /reports/daily-facility` |
| AutoHandoverPanel | `GET /handover/auto-generate` |
| FamilyCommunicationPanel | `GET /family/communication-queue` |

Per-widget: loading skeleton, refresh button, mock fallback, last updated time.

## Environment

Copy `.env.example` → `.env.local`:

```
NEXT_PUBLIC_CENTRAL_API_URL=http://localhost:5000
```

Ensure **Central Backend** is running: `cd wmc-ai-central-backend && npm start`.
