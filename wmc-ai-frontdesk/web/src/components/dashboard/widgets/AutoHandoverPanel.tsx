"use client"

import { useCallback } from "react"
import { fetchAutoHandover } from "@/lib/api/nursing/nursing-insights.client"
import { useInsightWidget } from "@/hooks/useInsightWidget"
import { BulletList, LabelBlock } from "./BulletList"
import { WidgetShell } from "./WidgetShell"
import { StatusPill } from "../StatusPill"

export function AutoHandoverPanel() {
  const fetcher = useCallback(() => fetchAutoHandover(), [])
  const { data, loading, usingMock, error, fetchedAt, refresh } =
    useInsightWidget(fetcher)

  return (
    <WidgetShell
      title="Auto Handover Summary"
      subtitle={data?.shift ?? "Shift transition"}
      endpoint="GET /handover/auto-generate"
      loading={loading}
      usingMock={usingMock}
      error={error}
      fetchedAt={fetchedAt}
      onRefresh={refresh}
    >
      {data ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={data.overallShiftStatus}
              tone={
                data.overallShiftStatus === "Critical"
                  ? "danger"
                  : data.overallShiftStatus === "Attention Required"
                    ? "warn"
                    : "good"
              }
            />
            {data.preparedByAI ? (
              <span className="text-[10px] font-medium uppercase text-sky-600">
                AI-assisted
              </span>
            ) : null}
          </div>
          <LabelBlock label="Summary">
            <p className="mt-1 text-sm text-slate-800">{data.handoverSummary}</p>
          </LabelBlock>
          <LabelBlock label="Pending tasks">
            <BulletList items={data.pendingTasks} />
          </LabelBlock>
          <LabelBlock label="Critical alerts">
            <BulletList items={data.criticalAlerts} tone="danger" />
          </LabelBlock>
        </>
      ) : null}
    </WidgetShell>
  )
}
