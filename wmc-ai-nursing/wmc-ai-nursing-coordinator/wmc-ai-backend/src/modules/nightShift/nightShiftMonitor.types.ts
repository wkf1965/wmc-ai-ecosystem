/** Night-shift supervisor monitoring panel */
export type NightShiftSystemStatus = 'Stable' | 'Attention Required' | 'Critical'

export interface NightShiftMonitorSummaryInner {
  highRiskPatients: string[]
  pendingTasks: string[]
  criticalAlerts: string[]
  unacknowledgedAlerts: number
  doctorEscalations: number
}

export interface NightShiftMonitorResponse {
  nightShiftSummary: NightShiftMonitorSummaryInner
  recommendations: string[]
  systemStatus: NightShiftSystemStatus
}
