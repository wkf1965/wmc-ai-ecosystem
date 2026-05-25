export interface DashboardAlerts {
  fallRisk: number
  pressureUlcerRisk: number
  vitalAlerts: number
  woundAlerts: number
  medicationAlerts: number
  doctorEscalations: number
}

export interface DashboardSummaryResponse {
  totalPatients: number
  highRiskPatients: string[]
  pendingTasks: string[]
  alerts: DashboardAlerts
  shiftStatus: 'Stable' | 'Attention Required'
}

export interface DashboardOtSummary {
  recordCount: number
  totalOvertimeHours: number
  pendingApprovalCount: number
}

export interface DashboardResponse {
  summary: DashboardSummaryResponse
  nursingRecords: unknown[]
  sideTurning: unknown[]
  ot: DashboardOtSummary
  alerts: unknown[]
  fetchedAt: string
}
