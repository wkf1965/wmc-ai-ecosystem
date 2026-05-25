"use client"

import type { NursingDashboardSnapshot } from "@/lib/api/nursing/types"
import { DashboardCard } from "./DashboardCard"
import { MetricWidget } from "./MetricWidget"
import { NursingBackendStatusCard } from "./NursingBackendStatusCard"
import { StatusPill } from "./StatusPill"

type Props = {
  snapshot: NursingDashboardSnapshot | null
  loading: boolean
  onRefresh: () => void
  lastUpdated: string | null
}

function facilityTone(status: string): "good" | "warn" | "danger" | "neutral" {
  const s = status.toLowerCase()
  if (s.includes("stable")) return "good"
  if (s.includes("critical") || s.includes("high alert")) return "danger"
  if (s.includes("attention")) return "warn"
  return "neutral"
}

export function NursingOperationsSection({
  snapshot,
  loading,
  onRefresh,
  lastUpdated,
}: Props) {
  const facilityStatus = snapshot?.facilityStatus ?? "—"
  const commandStatus = snapshot?.commandCenterStatus ?? "—"

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Nursing operations
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Live data from nursing backend endpoints (mock fallback when offline)
          </p>
        </div>
        {lastUpdated ? (
          <p className="text-xs text-slate-500">
            Last updated {new Date(lastUpdated).toLocaleString()}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <NursingBackendStatusCard
          snapshot={snapshot}
          loading={loading}
          onRefresh={onRefresh}
        />

        <MetricWidget
          label="Total patients"
          value={loading ? "…" : (snapshot?.totalPatients ?? "—")}
          tone="neutral"
        />
        <MetricWidget
          label="Nursing records"
          value={loading ? "…" : (snapshot?.nursingRecordsCount ?? "—")}
          tone="neutral"
        />
        <MetricWidget
          label="High risk patients"
          value={loading ? "…" : (snapshot?.highRiskPatients ?? "—")}
          tone={(snapshot?.highRiskPatients ?? 0) > 0 ? "danger" : "good"}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricWidget
          label="Pending tasks"
          value={loading ? "…" : (snapshot?.pendingTasks ?? "—")}
          tone={(snapshot?.pendingTasks ?? 0) > 0 ? "warn" : "good"}
        />
        <MetricWidget
          label="Urgent escalations"
          value={loading ? "…" : (snapshot?.urgentEscalations ?? "—")}
          tone={(snapshot?.urgentEscalations ?? 0) > 0 ? "danger" : "good"}
        />
        <DashboardCard title="Facility status" subtitle="Command center">
          <StatusPill label={facilityStatus} tone={facilityTone(facilityStatus)} />
          <p className="mt-3 text-xs text-slate-500">
            Shift: {snapshot?.shiftStatus ?? "—"}
          </p>
        </DashboardCard>
        <DashboardCard title="Command center" subtitle="Facility rollup">
          <StatusPill label={commandStatus} tone={facilityTone(commandStatus)} />
          <p className="mt-3 text-xs text-slate-500">
            Supervisor: {snapshot?.supervisorSystemStatus ?? "—"}
          </p>
        </DashboardCard>
      </div>

      {snapshot?.highRiskPatientNames && snapshot.highRiskPatientNames.length > 0 ? (
        <DashboardCard
          title="High risk watchlist"
          subtitle="From /dashboard/summary"
          className="mt-4"
        >
          <ul className="flex flex-wrap gap-2">
            {snapshot.highRiskPatientNames.map((name) => (
              <li
                key={name}
                className="rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-800 ring-1 ring-rose-200"
              >
                {name}
              </li>
            ))}
          </ul>
        </DashboardCard>
      ) : null}
    </section>
  )
}
