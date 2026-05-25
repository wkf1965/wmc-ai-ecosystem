"use client"

import { PageHeader } from "@wmc/ui"
import { useCentralBackendHealth } from "@/hooks/useCentralBackendHealth"
import { useNursingDashboard } from "@/hooks/useNursingDashboard"
import { CentralBackendStatusCard } from "./CentralBackendStatusCard"
import { DomainStatusWidget } from "./DomainStatusWidget"
import { MetricWidget } from "./MetricWidget"
import { NursingOperationsSection } from "./NursingOperationsSection"
import { PatientInputSection } from "./PatientInputSection"
import { RoomsCard } from "./RoomsCard"
import { MedicationCard } from "./MedicationCard"
import { AiInsightsSection } from "./widgets"

function LiveBadge({ source }: { source: "backend" | "fallback" | undefined }) {
  if (!source) return null
  const live = source === "backend"
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        live
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-amber-500"}`}
      />
      {live ? "Live data" : "Fallback data"}
    </span>
  )
}

export function CommandCenterDashboard() {
  const {
    connection,
    metrics,
    live,
    loading: centralLoading,
    refresh: refreshCentral,
    lastRefresh,
  } = useCentralBackendHealth(true)

  const {
    snapshot: nursingSnapshot,
    loading: nursingLoading,
    refresh: refreshNursing,
    lastUpdated: nursingLastUpdated,
  } = useNursingDashboard(true)

  const refreshAll = () => {
    void refreshCentral()
    void refreshNursing()
  }

  // Prefer nursing backend data when live, else fall back to central backend metrics
  const nursingLive = nursingSnapshot && !nursingSnapshot.usingMock

  const totalPatients = nursingLive
    ? nursingSnapshot.totalPatients
    : (metrics?.totalPatients ?? 0)

  const alertCount = nursingLive
    ? nursingSnapshot.pendingTasks
    : (metrics?.alertCount ?? 0)

  const highRisk = nursingLive
    ? nursingSnapshot.highRiskPatients
    : (metrics?.highRiskPatients ?? 0)

  const emergency = nursingLive
    ? nursingSnapshot.urgentEscalations
    : (metrics?.emergencyQueue ?? 0)

  const pendingTasks = nursingLive
    ? nursingSnapshot.pendingTasks
    : (metrics?.pendingTasks ?? 0)

  const isOffline = !centralLoading && !connection?.online

  return (
    <div className="min-h-screen bg-slate-50 p-6">

      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PageHeader
            title="WMC AI Command Center"
            description="Central backend health, nursing operations, and domain status."
          />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <LiveBadge source={metrics?.liveSource} />
          <button
            type="button"
            onClick={refreshAll}
            disabled={centralLoading || nursingLoading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {centralLoading ? "Refreshing…" : "Refresh Data"}
          </button>
        </div>
      </div>

      {/* ── Timestamps ── */}
      <p className="mb-2 text-xs text-slate-500">
        Auto-refresh every 30 s
        {lastRefresh ? ` · Central updated ${new Date(lastRefresh).toLocaleTimeString()}` : null}
        {nursingLastUpdated
          ? ` · Nursing updated ${new Date(nursingLastUpdated).toLocaleTimeString()}`
          : null}
      </p>

      {/* ── Offline banner ── */}
      {isOffline && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="text-base">⚠️</span>
          <span>
            <strong>Backend offline</strong> — showing fallback data. Make sure{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">
              localhost:5000
            </code>{" "}
            is running.
          </span>
        </div>
      )}

      {/* ── Loading shimmer ── */}
      {centralLoading && !connection && (
        <p className="mb-6 text-sm text-slate-500 animate-pulse">
          Loading dashboard data…
        </p>
      )}

      {/* ── Platform metrics ── */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Platform
      </h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CentralBackendStatusCard
          connection={connection}
          loading={centralLoading}
          onRefresh={refreshCentral}
        />

        <MetricWidget
          label="Total patients"
          value={centralLoading ? "…" : totalPatients}
          tone="neutral"
        />
        <MetricWidget
          label="Pending tasks"
          value={centralLoading ? "…" : pendingTasks}
          tone={pendingTasks >= 5 ? "warn" : pendingTasks > 0 ? "warn" : "good"}
        />
        <MetricWidget
          label="Open alerts"
          value={centralLoading ? "…" : alertCount}
          tone={alertCount >= 5 ? "danger" : alertCount > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricWidget
          label="High risk patients"
          value={centralLoading ? "…" : highRisk}
          tone={highRisk > 0 ? "danger" : "good"}
        />
        <MetricWidget
          label="Urgent escalations"
          value={centralLoading ? "…" : emergency}
          tone={emergency > 0 ? "danger" : "good"}
        />
        {live?.apiInfo ? (
          <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Backend info
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {live.apiInfo.service}{" "}
              <span className="font-mono text-xs text-slate-500">
                v{live.apiInfo.version}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Auth: <span className="font-mono">{live.apiInfo.authMode}</span> ·
              Uptime: {Math.floor((live.apiInfo.uptime ?? 0) / 60)} min ·{" "}
              {live.apiInfo.modules.filter((m) => m.status === "active").length} active modules
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Patient input + card list ── */}
      <PatientInputSection onPatientCreated={() => void refreshCentral()} />

      {/* ── Rooms + Medication ── */}
      <div className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Facility Operations
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <RoomsCard />
          <MedicationCard />
        </div>
      </div>

      {/* ── Nursing operations ── */}
      <NursingOperationsSection
        snapshot={nursingSnapshot}
        loading={nursingLoading}
        onRefresh={refreshNursing}
        lastUpdated={nursingLastUpdated}
      />

      {/* ── AI Insights ── */}
      <AiInsightsSection />

      {/* ── Domain status ── */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Domain status
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {metrics?.domains.map((domain) => {
          if (domain.id === "nursing" && nursingLive) {
            return (
              <DomainStatusWidget
                key={domain.id}
                domain={{
                  ...domain,
                  status: "online",
                  summary: `Live · ${nursingSnapshot.totalPatients} patients, ${nursingSnapshot.nursingRecordsCount} records`,
                }}
              />
            )
          }
          return <DomainStatusWidget key={domain.id} domain={domain} />
        }) ??
          ["nursing", "rehab", "crm"].map((id) => (
            <div
              key={id}
              className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white"
            />
          ))}
      </div>

      {/* ── Last updated footer ── */}
      {lastRefresh && (
        <p className="mt-8 text-center text-xs text-slate-400">
          Dashboard last updated at{" "}
          <span className="font-medium text-slate-500">
            {new Date(lastRefresh).toLocaleString()}
          </span>
          {metrics?.liveSource === "backend" ? " · data from live backend" : " · fallback data"}
        </p>
      )}
    </div>
  )
}
