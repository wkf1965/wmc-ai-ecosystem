"use client"

import type { ReactNode } from "react"
import { DashboardCard } from "../DashboardCard"
import { StatusPill } from "../StatusPill"

type WidgetShellProps = {
  title: string
  subtitle?: string
  endpoint: string
  loading: boolean
  usingMock: boolean
  error: string | null
  fetchedAt: string | null
  onRefresh: () => void
  className?: string
  children: ReactNode
}

function formatTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function WidgetShell({
  title,
  subtitle,
  endpoint,
  loading,
  usingMock,
  error,
  fetchedAt,
  onRefresh,
  className = "",
  children,
}: WidgetShellProps) {
  return (
    <DashboardCard
      title={title}
      subtitle={subtitle}
      className={className}
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      }
    >
      <div className="mb-4 space-y-2 border-b border-slate-100 pb-3">
        <p className="font-mono text-[10px] text-slate-400">{endpoint}</p>
        <div className="flex flex-wrap gap-2">
          <StatusPill
            label={loading ? "Loading" : usingMock ? "Mock data" : "Live"}
            tone={loading ? "neutral" : usingMock ? "warn" : "good"}
          />
          {error && !loading ? <StatusPill label="Degraded" tone="warn" /> : null}
        </div>
        {error ? <p className="text-xs text-amber-700">{error}</p> : null}
        <p className="text-[11px] text-slate-500">Updated {formatTime(fetchedAt)}</p>
      </div>
      {loading ? <WidgetLoadingSkeleton /> : children}
    </DashboardCard>
  )
}

function WidgetLoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-3 w-3/4 rounded bg-slate-200" />
      <div className="h-3 w-full rounded bg-slate-200" />
      <div className="h-3 w-1/2 rounded bg-slate-200" />
    </div>
  )
}
