"use client"

import { useCallback } from "react"
import { fetchPredictiveRisk } from "@/lib/api/nursing/nursing-insights.client"
import { useInsightWidget } from "@/hooks/useInsightWidget"
import { BulletList, LabelBlock } from "./BulletList"
import { WidgetShell } from "./WidgetShell"

export function PredictiveRiskPanel() {
  const fetcher = useCallback(() => fetchPredictiveRisk(), [])
  const { data, loading, usingMock, error, fetchedAt, refresh } =
    useInsightWidget(fetcher)

  return (
    <WidgetShell
      title="Predictive Risk"
      subtitle="AI / analytics"
      endpoint="GET /analytics/predictive-risk"
      loading={loading}
      usingMock={usingMock}
      error={error}
      fetchedAt={fetchedAt}
      onRefresh={refresh}
      className="xl:col-span-2"
    >
      {data ? (
        <>
          <LabelBlock label="Overall prediction">
            <p className="mt-1 text-sm leading-relaxed text-slate-800">
              {data.overallPrediction}
            </p>
          </LabelBlock>
          <LabelBlock label="High concern areas">
            <BulletList items={data.highConcernAreas} tone="warn" />
          </LabelBlock>
          <LabelBlock label="Preventive recommendations">
            <BulletList items={data.preventiveRecommendations} />
          </LabelBlock>
        </>
      ) : null}
    </WidgetShell>
  )
}
