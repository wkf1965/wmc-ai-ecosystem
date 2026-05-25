import type { NursingDashboardSnapshot } from "./types"

export function getMockNursingDashboard(
  reason?: string
): NursingDashboardSnapshot {
  return {
    online: false,
    usingMock: true,
    error: reason ?? "Nursing backend unreachable — showing sample data",
    fetchedAt: new Date().toISOString(),
    totalPatients: 58,
    nursingRecordsCount: 24,
    highRiskPatients: 6,
    highRiskPatientNames: ["Ah Chong", "Test Patient"],
    pendingTasks: 4,
    urgentEscalations: 2,
    facilityStatus: "Attention Required",
    commandCenterStatus: "Critical",
    shiftStatus: "Attention Required",
    supervisorSystemStatus: "Attention Required",
  }
}
