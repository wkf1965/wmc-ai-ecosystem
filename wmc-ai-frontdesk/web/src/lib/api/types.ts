// ── Central backend health ───────────────────────────────────────────────────

export type CentralHealthResponse = {
  status: string
  service: string
  version?: string
  uptime?: number
  timestamp?: string
  message?: string
}

export type CentralBackendConnection = {
  online: boolean
  health: CentralHealthResponse | null
  error: string | null
  fetchedAt: string
}

// ── /api/v1 manifest ─────────────────────────────────────────────────────────

export type BackendModuleInfo = {
  name: string
  path: string
  status: "active" | "stub" | string
  description: string
}

export type BackendApiInfo = {
  service: string
  version: string
  apiVersion: string
  baseUrl: string
  uptime: number
  authMode: string
  modules: BackendModuleInfo[]
}

// ── Domain list responses ─────────────────────────────────────────────────────

export type BackendPatientsResponse = {
  total: number
  count: number
  source: string
  mock: boolean
}

export type BackendTasksResponse = {
  total: number
  count: number
  source: string
  mock: boolean
}

export type BackendAlertsResponse = {
  total: number
  count: number
  source: string
  mock: boolean
}

// ── Events / dashboard state ──────────────────────────────────────────────────

export type EscalationEntry = {
  patientId: string
  reason: string
  triggeredBy: string
  at: string
}

export type DashboardRefreshEntry = {
  module: string
  targetId: string | null
  at: string
}

export type BackendDashboardState = {
  escalationQueue: EscalationEntry[]
  pendingRefreshes: DashboardRefreshEntry[]
  source: string
  mock: boolean
}

// ── Composite live snapshot ───────────────────────────────────────────────────

export type LiveBackendData = {
  connection: CentralBackendConnection
  apiInfo: BackendApiInfo | null
  patients: BackendPatientsResponse | null
  tasks: BackendTasksResponse | null
  alerts: BackendAlertsResponse | null
  dashboardState: BackendDashboardState | null
  fetchedAt: string
  /** true = all data came from live API; false = some / all from fallback */
  liveSource: "backend" | "fallback"
}

// ── Domain status (existing, unchanged) ──────────────────────────────────────

export type DomainOperationalStatus = "online" | "degraded" | "offline"

export type DomainStatusSnapshot = {
  id: "nursing" | "rehab" | "crm"
  label: string
  status: DomainOperationalStatus
  summary: string
  endpoint: string
}

// ── Dashboard metrics (used by useCentralBackendHealth) ──────────────────────

export type DashboardMetricsSnapshot = {
  totalPatients: number
  alertCount: number
  pendingTasks: number
  emergencyQueue: number
  highRiskPatients: number
  domains: DomainStatusSnapshot[]
  /** true when data came from live central backend */
  useLiveCentralHealth: boolean
  liveSource: "backend" | "fallback"
}
