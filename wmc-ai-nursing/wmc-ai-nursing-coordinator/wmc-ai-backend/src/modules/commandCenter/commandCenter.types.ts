export type CommandCenterFacilityStatus = 'Stable' | 'Attention Required' | 'High Alert' | 'Critical'

export type CommandCenterPatientPriority = 'Critical' | 'High' | 'Medium' | 'Low'

export interface CommandCenterSummary {
  totalPatients: number
  /** Count of distinct high‑risk identifiers from dashboard rollup */
  highRiskPatients: number
  /** Patients (latest nursing snapshot) classified **Critical** by emergency responder rules */
  emergencyCases: number
  doctorEscalations: number
  pendingSideTurning: number
  medicationAlerts: number
  bedExitAlerts: number
  fallRiskAlerts: number
  pressureUlcerRisks: number
  wanderingRisks: number
  vitalSignAlerts: number
  pendingAcknowledgements: number
  incidentReports: number
  /** Composite: critical bulletin strings + unacknowledged urgent/high shift items */
  nightShiftAlerts: number
  nurseTaskQueue: number
  unresolvedUrgentTasks: number
}

export interface CommandCenterCriticalPatient {
  patientName: string
  issue: string
  priority: CommandCenterPatientPriority
}

export interface CommandCenterSystemHealth {
  apiStatus: 'Online' | 'Degraded'
  alertEngine: 'Running' | 'Degraded'
  handoverSystem: 'Running' | 'Degraded'
  riskMonitoring: 'Running' | 'Degraded'
}

export interface CommandCenterStatusResponse {
  facilityStatus: CommandCenterFacilityStatus
  summary: CommandCenterSummary
  criticalPatients: CommandCenterCriticalPatient[]
  operationalAlerts: string[]
  recommendedActions: string[]
  systemHealth: CommandCenterSystemHealth
}
