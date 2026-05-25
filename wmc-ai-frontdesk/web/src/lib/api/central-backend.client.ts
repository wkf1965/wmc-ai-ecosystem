import {
  getCentralHealthUrl,
  v1Url,
  DEV_SUPERVISOR_TOKEN,
} from "./config"
import { getMockDashboardMetrics } from "./mock-dashboard"
import type {
  BackendApiInfo,
  BackendAlertsResponse,
  BackendDashboardState,
  BackendPatientsResponse,
  BackendTasksResponse,
  CentralBackendConnection,
  CentralHealthResponse,
  DashboardMetricsSnapshot,
  LiveBackendData,
} from "./types"

const DEFAULT_TIMEOUT_MS = 8000

// ── Fetch primitive ───────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** GET a JSON endpoint; returns null on any error (network, timeout, non-2xx). */
async function safeGet<T>(
  url: string,
  headers?: Record<string, string>
): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { Accept: "application/json", ...headers },
        cache: "no-store",
      },
      DEFAULT_TIMEOUT_MS
    )
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// ── Individual API functions ──────────────────────────────────────────────────

/** GET /api/v1/health */
export async function getHealth(): Promise<CentralBackendConnection> {
  const fetchedAt = new Date().toISOString()
  const url = getCentralHealthUrl()
  try {
    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) {
      return { online: false, health: null, error: `HTTP ${res.status}`, fetchedAt }
    }
    const health = (await res.json()) as CentralHealthResponse
    const online = health.status === "ok"
    return { online, health, error: online ? null : `Status: ${health.status}`, fetchedAt }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reach central backend"
    return { online: false, health: null, error: message, fetchedAt }
  }
}

/** GET /api/v1 — module manifest + uptime */
export async function getApiInfo(): Promise<BackendApiInfo | null> {
  return safeGet<BackendApiInfo>(v1Url("/"))
}

export type PatientRecord = {
  id: string
  mrn: string
  fullName: string
  gender: string
  age?: number
  diagnosis?: string | null
  roomNumber?: string | null
  mobilityStatus?: string
  fallRiskLevel?: string
  status: string
  createdAt: string
  mock?: boolean
}

type PatientsListResponse = {
  total: number
  count: number
  patients: PatientRecord[]
  source: string
  mock: boolean
}

/** GET /api/v1/patients — returns full list with patient records */
export async function getPatients(): Promise<BackendPatientsResponse | null> {
  return safeGet<BackendPatientsResponse>(v1Url("/patients"))
}

/** GET /api/v1/patients — returns full patient list for the patients page */
export async function listPatients(): Promise<PatientsListResponse | null> {
  return safeGet<PatientsListResponse>(v1Url("/patients"))
}

export type CreatePatientInput = {
  fullName: string
  gender: string
  age: number
  diagnosis: string
  roomNumber: string
  mobilityStatus: string
  fallRiskLevel: string
  mrn?: string
  phone?: string
}

export type CreatePatientResult = {
  patient: {
    id: string
    mrn: string
    fullName: string
    gender: string
    age: number
    diagnosis: string | null
    roomNumber: string | null
    mobilityStatus: string
    fallRiskLevel: string
    status: string
    createdAt: string
    mock: boolean
  }
  source: string
  mock: boolean
}

/** POST /api/v1/patients — create a new patient record */
export async function createPatient(
  input: CreatePatientInput
): Promise<{ ok: true; data: CreatePatientResult } | { ok: false; error: string }> {
  try {
    const res = await fetchWithTimeout(v1Url("/patients"), {
      method:  "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body:    JSON.stringify(input),
      cache:   "no-store",
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      return { ok: false, error: body.error ?? `HTTP ${res.status}` }
    }
    const data = (await res.json()) as CreatePatientResult
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }
}

/** GET /api/v1/tasks */
export async function getTasksQueue(): Promise<BackendTasksResponse | null> {
  return safeGet<BackendTasksResponse>(v1Url("/tasks"))
}

/** GET /api/v1/alerts */
export async function getAlerts(): Promise<BackendAlertsResponse | null> {
  return safeGet<BackendAlertsResponse>(v1Url("/alerts"))
}

/**
 * GET /api/v1/events/dashboard-state
 * Requires supervisor token — uses mock-token-supervisor in dev mode.
 */
export async function getEscalationQueue(): Promise<BackendDashboardState | null> {
  return safeGet<BackendDashboardState>(v1Url("/events/dashboard-state"), {
    Authorization: `Bearer ${DEV_SUPERVISOR_TOKEN}`,
  })
}

// ── Composite snapshot ────────────────────────────────────────────────────────

/**
 * Fetches all dashboard data in parallel.
 * Any individual call failure degrades gracefully — never throws.
 */
export async function fetchLiveBackendData(): Promise<LiveBackendData> {
  const fetchedAt = new Date().toISOString()

  const [connection, apiInfo, patients, tasks, alerts, dashboardState] =
    await Promise.all([
      getHealth(),
      getApiInfo(),
      getPatients(),
      getTasksQueue(),
      getAlerts(),
      getEscalationQueue(),
    ])

  const liveSource: "backend" | "fallback" =
    connection.online && (patients !== null || alerts !== null || tasks !== null)
      ? "backend"
      : "fallback"

  return {
    connection,
    apiInfo,
    patients,
    tasks,
    alerts,
    dashboardState,
    fetchedAt,
    liveSource,
  }
}

/**
 * Builds the DashboardMetricsSnapshot from live backend data.
 * Falls back to mock values for any field that could not be fetched.
 */
function buildMetrics(live: LiveBackendData): DashboardMetricsSnapshot {
  const online = live.connection.online
  const mock = getMockDashboardMetrics(online)

  // Module manifest → derive domain statuses
  const moduleStatus = Object.fromEntries(
    (live.apiInfo?.modules ?? []).map((m) => [m.name, m.status])
  )

  const domainStatus = (
    id: "nursing" | "rehab" | "crm",
    label: string,
    endpoint: string,
    onlineSummary: string,
    offlineSummary: string
  ) => {
    const ms = moduleStatus[id]
    const status = !online
      ? "offline"
      : ms === "active"
        ? "online"
        : ms === "stub"
          ? "degraded"
          : "degraded"
    return {
      id,
      label,
      status: status as "online" | "degraded" | "offline",
      summary: online ? onlineSummary : offlineSummary,
      endpoint,
    }
  }

  return {
    totalPatients:   live.patients?.count  ?? mock.totalPatients,
    alertCount:      live.alerts?.count    ?? mock.alertCount,
    pendingTasks:    live.tasks?.count     ?? mock.pendingTasks,
    emergencyQueue:  live.dashboardState?.escalationQueue.length ?? mock.emergencyQueue,
    highRiskPatients: mock.highRiskPatients,
    useLiveCentralHealth: online,
    liveSource: live.liveSource,
    domains: [
      domainStatus(
        "nursing",
        "Nursing",
        "/api/v1/nursing",
        `Records syncing · source: ${live.patients?.source ?? "—"}`,
        "Awaiting central backend"
      ),
      domainStatus(
        "rehab",
        "Rehabilitation",
        "/api/v1/rehab",
        "Sessions active — stub module",
        "Awaiting central backend"
      ),
      domainStatus(
        "crm",
        "CRM",
        "/api/v1/crm",
        "Leads & appointments pipeline nominal",
        "Awaiting central backend"
      ),
    ],
  }
}

/**
 * Primary hook data fetcher — used by useCentralBackendHealth.
 */
export async function fetchDashboardSnapshot(): Promise<{
  connection: CentralBackendConnection
  metrics: DashboardMetricsSnapshot
  live: LiveBackendData
}> {
  const live = await fetchLiveBackendData()
  const metrics = buildMetrics(live)
  return { connection: live.connection, metrics, live }
}

/** @deprecated kept for backwards compat — use fetchDashboardSnapshot */
export async function fetchCentralHealth(): Promise<CentralBackendConnection> {
  return getHealth()
}
