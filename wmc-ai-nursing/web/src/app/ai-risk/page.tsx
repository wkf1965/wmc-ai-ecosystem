"use client"

import { useMemo } from "react"
import Link from "next/link"
import { PageHeader, Card, KpiCard, StatusBadge } from "@wmc/ui"
import { analyzeAllPatients } from "../../lib/aiRiskDetection"

export default function AIRiskDetectionPage() {
  const results = useMemo(() => analyzeAllPatients(), [])

  const escalations = results.filter((result) => result.categories.some((item) => item.escalate)).length

  return (
    <div className="min-h-screen p-6">
      <PageHeader
        title="AI Risk Detection"
        description="Automated nursing risk scoring generated from local notes and patient profile signals."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Patients evaluated" value={results.length} tone="good" />
        <KpiCard label="Escalations triggered" value={escalations} tone="danger" />
        <KpiCard label="Watchlist items" value={results.filter((i) => i.categories.length > 0).length} tone="warn" />
      </div>

      <Card title="Escalation policy" subtitle="AI governance note">
        <p className="text-sm text-slate-700">
          Rule-based scoring combines structured patient profile risk flags with natural language signals from daily notes.
          All alerts are advisory and require clinical review.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge value="Monitor" tone="good" />
          <StatusBadge value="Escalate now" tone="danger" />
        </div>
      </Card>

      <div className="mt-6 grid gap-4">
        {results.map((result) => (
          <Card key={result.patientId} title={result.patientName} subtitle={`Overall score ${result.totalScore}/100`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge value={result.riskBadge} tone={result.riskBadge === "high" ? "danger" : result.riskBadge === "medium" ? "warn" : "good"} />
              <Link href={`/patients/${result.patientId}`} className="text-sm text-sky-700 hover:underline">
                View patient profile
              </Link>
              <span className="text-sm text-slate-500">Categories: {result.categories.length}</span>
            </div>
            <div className="grid gap-3">
              {result.categories.length === 0 ? (
                <p className="text-sm text-slate-500">No active risk signals detected in sample notes.</p>
              ) : (
                result.categories.map((category) => (
                  <div key={category.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{category.label}</h3>
                      <StatusBadge value={category.warning} tone={category.escalate ? "danger" : "good"} />
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {category.score}
                      <span className="text-sm font-normal text-slate-500">/100</span>
                    </p>
                    <p className="mt-2 text-sm text-slate-700">Action: {category.action}</p>
                    {category.signals.length > 0 ? (
                      <p className="mt-2 text-xs text-slate-500">Signals: {category.signals.join(", ")}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
