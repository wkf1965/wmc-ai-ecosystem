"use client"

import { nursingApiUrl } from "@/lib/api/nursing/config"
import type { NursingDashboardSnapshot } from "@/lib/api/nursing/types"
import { DashboardCard } from "./DashboardCard"
import { StatusPill } from "./StatusPill"

function formatTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

type Props = {
  snapshot: NursingDashboardSnapshot | null
  loading: boolean
  onRefresh: () => void
}

export function NursingBackendStatusCard({ snapshot, loading, onRefresh }: Props) {
  const online = snapshot?.online && !snapshot?.usingMock
  const partial = Boolean(snapshot?.online && snapshot?.error && !snapshot.usingMock)

  return (
    <DashboardCard
      title="Nursing Backend"
      subtitle="wmc-ai-backend · /api/v1"
      className="md:col-span-2 xl:col-span-2"
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Backend" value={loading ? "Checking…" : online ? "Online" : "Offline"} />
        <Field
          label="Data source"
          value={snapshot?.usingMock ? "Mock fallback" : "Live API"}
        />
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Base URL
          </p>
          <p className="mt-1 break-all font-mono text-xs text-slate-600">
            {nursingApiUrl("")}
          </p>
        </div>
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <StatusPill
            label={loading ? "…" : online ? "Connected" : "Disconnected"}
            tone={loading ? "neutral" : online ? "good" : "danger"}
          />
          {partial ? <StatusPill label="Partial errors" tone="warn" /> : null}
          {snapshot?.usingMock ? <StatusPill label="Mock data" tone="warn" /> : null}
        </div>
        {snapshot?.error ? (
          <p className="sm:col-span-2 text-sm text-amber-700">{snapshot.error}</p>
        ) : null}
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Last updated
          </p>
          <p className="mt-1 text-sm font-medium text-slate-800">
            {formatTime(snapshot?.fetchedAt ?? null)}
          </p>
        </div>
      </div>
    </DashboardCard>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}
