import { Card, KpiCard, PageHeader, StatusBadge } from "@wmc/ui"

export default function DashboardPage() {
  return (
    <div className="min-h-screen p-6">
      <PageHeader
        title="Marketing Command"
        description="Pilot-grade enterprise starter for Marketing workflows with shared UI primitives and API handlers."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Units monitored" value="12" tone="good" />
        <KpiCard label="Open tasks" value="41" tone="warn" />
        <KpiCard label="Escalations" value="4" tone="danger" />
        <KpiCard label="SLA adherence" value="97%" tone="good" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card title="Domain status" subtitle="Health signal">
          <StatusBadge value="Operational" tone="good" />
        </Card>
        <Card title="Service scope" subtitle="Core boundary">
          <p className="text-sm text-slate-700">Marketing domain boundaries and API routes are organized by this module.</p>
        </Card>
        <Card title="API route" subtitle="Health check">
          <p className="font-mono text-sm text-slate-700">/api/health</p>
        </Card>
      </div>
    </div>
  )
}