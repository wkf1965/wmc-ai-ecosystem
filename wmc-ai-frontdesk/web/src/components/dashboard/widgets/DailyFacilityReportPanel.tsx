"use client"

import { useCallback } from "react"
import { fetchDailyFacilityReport } from "@/lib/api/nursing/nursing-insights.client"
import { useInsightWidget } from "@/hooks/useInsightWidget"
import { LabelBlock } from "./BulletList"
import { WidgetShell } from "./WidgetShell"
import { StatusPill } from "../StatusPill"

export function DailyFacilityReportPanel() {
  const fetcher = useCallback(() => fetchDailyFacilityReport(), [])
  const { data, loading, usingMock, error, fetchedAt, refresh } =
    useInsightWidget(fetcher)

  const m = data?.keyMetrics

  return (
    <WidgetShell
      title="Daily Facility Report"
      subtitle={data?.reportDate ?? "Management rollup"}
      endpoint="GET /reports/daily-facility"
      loading={loading}
      usingMock={usingMock}
      error={error}
      fetchedAt={fetchedAt}
      onRefresh={refresh}
      className="xl:col-span-2"
    >
      {data ? (
        <>
          <div className="flex flex-wrap gap-2">
            <StatusPill label={data.facilityStatus} tone="warn" />
          </div>
          <LabelBlock label="Executive summary">
            <p className="mt-1 text-sm leading-relaxed text-slate-800">
              {data.executiveSummary}
            </p>
          </LabelBlock>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Emergency" value={m?.emergencyCases ?? 0} />
            <Metric label="Doctor escalations" value={m?.doctorEscalations ?? 0} />
            <Metric label="High risk" value={m?.highRiskPatients ?? 0} />
            <Metric label="OT hours" value={m?.totalOTHours ?? 0} />
          </div>
        </>
      ) : null}
    </WidgetShell>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  )
}
