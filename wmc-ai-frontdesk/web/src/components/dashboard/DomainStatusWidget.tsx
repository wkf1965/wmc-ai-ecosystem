import type { DomainStatusSnapshot } from "@/lib/api/types"
import { DashboardCard } from "./DashboardCard"
import { StatusPill } from "./StatusPill"

const statusTone = {
  online: "good",
  degraded: "warn",
  offline: "danger",
} as const

const statusLabel = {
  online: "Online",
  degraded: "Degraded",
  offline: "Offline",
} as const

export function DomainStatusWidget({ domain }: { domain: DomainStatusSnapshot }) {
  return (
    <DashboardCard title={domain.label} subtitle="Domain module">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label={statusLabel[domain.status]} tone={statusTone[domain.status]} />
        <span className="font-mono text-xs text-slate-500">{domain.endpoint}</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{domain.summary}</p>
    </DashboardCard>
  )
}



