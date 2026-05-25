"use client"

import { useCallback } from "react"
import { fetchFamilyCommunicationQueue } from "@/lib/api/nursing/nursing-insights.client"
import { useInsightWidget } from "@/hooks/useInsightWidget"
import { BulletList, LabelBlock } from "./BulletList"
import { WidgetShell } from "./WidgetShell"

export function FamilyCommunicationPanel() {
  const fetcher = useCallback(() => fetchFamilyCommunicationQueue(), [])
  const { data, loading, usingMock, error, fetchedAt, refresh } =
    useInsightWidget(fetcher)

  const urgent = data?.queue.filter((q) => q.priority === "Urgent") ?? []
  const pending = data?.queue ?? []

  return (
    <WidgetShell
      title="Family Communication Queue"
      subtitle={`${data?.summary.totalPendingCommunications ?? 0} pending`}
      endpoint="GET /family/communication-queue"
      loading={loading}
      usingMock={usingMock}
      error={error}
      fetchedAt={fetchedAt}
      onRefresh={refresh}
      className="xl:col-span-2"
    >
      {data ? (
        <>
          <QueueSummaryMetrics
            urgent={data.summary.urgentFamilyUpdates}
            routine={data.summary.routineUpdates}
            total={data.summary.totalPendingCommunications}
          />
          <LabelBlock label="Urgent family updates">
            {urgent.length === 0 ? (
              <BulletList items={[]} empty="No urgent updates" />
            ) : (
              <ul className="mt-2 space-y-2">
                {urgent.map((item) => (
                  <li
                    key={`${item.patientName}-${item.reason}`}
                    className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm"
                  >
                    <p className="font-semibold text-rose-900">{item.patientName}</p>
                    <p className="text-rose-800">{item.reason}</p>
                    <p className="mt-1 text-xs text-rose-700">{item.recommendedMessage}</p>
                  </li>
                ))}
              </ul>
            )}
          </LabelBlock>
          <LabelBlock label="Pending communication queue">
            <ul className="mt-2 space-y-2">
              {pending.map((item) => (
                <li
                  key={`${item.patientName}-${item.priority}`}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-slate-900">{item.patientName}</span>
                    <span className="text-xs font-medium text-slate-500">{item.priority}</span>
                  </div>
                  <p className="text-slate-700">{item.reason}</p>
                </li>
              ))}
            </ul>
          </LabelBlock>
          <LabelBlock label="Recommended actions">
            <BulletList items={data.recommendedActions} />
          </LabelBlock>
        </>
      ) : null}
    </WidgetShell>
  )
}

function QueueSummaryMetrics({
  urgent,
  routine,
  total,
}: {
  urgent: number
  routine: number
  total: number
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-lg bg-rose-50 p-2 text-center">
        <p className="text-lg font-bold text-rose-800">{urgent}</p>
        <p className="text-[10px] uppercase text-rose-600">Urgent</p>
      </div>
      <div className="rounded-lg bg-amber-50 p-2 text-center">
        <p className="text-lg font-bold text-amber-800">{routine}</p>
        <p className="text-[10px] uppercase text-amber-600">Routine</p>
      </div>
      <div className="rounded-lg bg-slate-100 p-2 text-center">
        <p className="text-lg font-bold text-slate-800">{total}</p>
        <p className="text-[10px] uppercase text-slate-600">Total</p>
      </div>
    </div>
  )
}
