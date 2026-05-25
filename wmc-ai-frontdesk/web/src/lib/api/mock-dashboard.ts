import type { DashboardMetricsSnapshot } from "./types"

/**
 * Fallback metrics shown when the central backend is offline or
 * individual API calls fail.
 */
export function getMockDashboardMetrics(
  centralOnline: boolean
): DashboardMetricsSnapshot {
  return {
    totalPatients:    centralOnline ? 12 : 0,
    alertCount:       centralOnline ? 7  : 0,
    pendingTasks:     centralOnline ? 5  : 0,
    emergencyQueue:   centralOnline ? 2  : 0,
    highRiskPatients: centralOnline ? 3  : 0,
    useLiveCentralHealth: centralOnline,
    liveSource: "fallback",
    domains: [
      {
        id: "nursing",
        label: "Nursing",
        status: centralOnline ? "online" : "offline",
        summary: centralOnline
          ? "Vitals, handovers, and shift records syncing"
          : "Awaiting central backend",
        endpoint: "/api/v1/nursing",
      },
      {
        id: "rehab",
        label: "Rehabilitation",
        status: centralOnline ? "degraded" : "offline",
        summary: centralOnline
          ? "Sessions active — AI progress summary pending"
          : "Awaiting central backend",
        endpoint: "/api/v1/rehab",
      },
      {
        id: "crm",
        label: "CRM",
        status: centralOnline ? "online" : "offline",
        summary: centralOnline
          ? "Leads and appointments pipeline nominal"
          : "Awaiting central backend",
        endpoint: "/api/v1/crm",
      },
    ],
  }
}
