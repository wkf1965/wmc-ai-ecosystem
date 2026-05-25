"use client"

import { useCallback } from "react"
import { fetchNightShiftMonitor } from "@/lib/api/nursing/nursing-insights.client"
import { useInsightWidget } from "@/hooks/useInsightWidget"
import { BulletList, LabelBlock } from "./BulletList"
import { WidgetShell } from "./WidgetShell"
import { StatusPill } from "../StatusPill"

export function NightShiftMonitorPanel() {
  const fetcher = useCallback(() => fetchNightShiftMonitor(), [])
  const { data, loading, usingMock, error, fetchedAt, refresh } =
    useInsightWidget(fetcher)

  const summary = data?.nightShiftSummary

  return (
    <WidgetShell
      title="Night Shift Monitor"
      subtitle={data?.systemStatus ?? "Overnight supervision"}
      endpoint="GET /night-shift/monitor"
      loading={loading}
      usingMock={usingMock}
      error={error}
      fetchedAt={fetchedAt}
      onRefresh={refresh}
    >
      {data ? (
        <>
          <StatusPill
            label={data.systemStatus}
            tone={
              data.systemStatus === "Critical"
                ? "danger"
                : data.systemStatus === "Attention Required"
                  ? "warn"
                  : "good"
            }
          />
          <LabelBlock label="Critical alerts">
            <BulletList items={summary?.criticalAlerts ?? []} tone="danger" />
          </LabelBlock>
          <LabelBlock label="Pending tasks">
            <BulletList items={summary?.pendingTasks ?? []} />
          </LabelBlock>
          <LabelBlock label="High risk patients">
            <BulletList items={summary?.highRiskPatients ?? []} tone="warn" />
          </LabelBlock>
        </>
      ) : null}
    </WidgetShell>
  )
}
