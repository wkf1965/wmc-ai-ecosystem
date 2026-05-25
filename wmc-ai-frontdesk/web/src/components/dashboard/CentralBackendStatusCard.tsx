"use client"

import { getCentralHealthUrl } from "@/lib/api/config"
import type { CentralBackendConnection } from "@/lib/api/types"
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
  connection: CentralBackendConnection | null
  loading: boolean
  onRefresh: () => void
}

export function CentralBackendStatusCard({ connection, loading, onRefresh }: Props) {
  const online = connection?.online ?? false
  const health = connection?.health

  return (
    <DashboardCard
      title="Central Backend"
      subtitle={health?.service ?? "WMC AI Central Backend"}
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
      className="md:col-span-2 xl:col-span-2"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Backend
          </p>
          <div className="mt-2">
            <StatusPill
              label={loading ? "Checking…" : online ? "Online" : "Offline"}
              tone={loading ? "neutral" : online ? "good" : "danger"}
            />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            API status
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {health?.status ?? (connection?.error ? "unreachable" : "—")}
          </p>
          {health?.message ? (
            <p className="mt-1 text-sm text-slate-600">{health.message}</p>
          ) : connection?.error ? (
            <p className="mt-1 text-sm text-rose-600">{connection.error}</p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Health endpoint
          </p>
          <p className="mt-1 break-all font-mono text-xs text-slate-600">
            {getCentralHealthUrl()}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Last refresh
          </p>
          <p className="mt-1 text-sm font-medium text-slate-800">
            {formatTime(connection?.fetchedAt ?? null)}
          </p>
        </div>
      </div>
    </DashboardCard>
  )
}

