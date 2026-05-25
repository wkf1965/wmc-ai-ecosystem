"use client"

import { AutoHandoverPanel } from "./AutoHandoverPanel"
import { DailyFacilityReportPanel } from "./DailyFacilityReportPanel"
import { FamilyCommunicationPanel } from "./FamilyCommunicationPanel"
import { NightShiftMonitorPanel } from "./NightShiftMonitorPanel"
import { PredictiveRiskPanel } from "./PredictiveRiskPanel"

/** AI summary + risk monitoring widgets (nursing backend :4000) */
export function AiInsightsSection() {
  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          AI summary &amp; risk monitoring
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Each card fetches its own endpoint with independent refresh and mock fallback.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <PredictiveRiskPanel />
        <NightShiftMonitorPanel />
        <DailyFacilityReportPanel />
        <AutoHandoverPanel />
        <FamilyCommunicationPanel />
      </div>
    </section>
  )
}
