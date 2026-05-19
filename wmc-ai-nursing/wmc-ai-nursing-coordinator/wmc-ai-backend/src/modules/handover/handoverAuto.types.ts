export type HandoverOverallShiftStatus = 'Stable' | 'Attention Required' | 'Critical'

export interface HandoverAutoHighRiskPatient {
  patientName: string
  issues: string[]
}

export interface HandoverAutoGenerateResponse {
  shift: string
  /** Local wall-clock timestamp `YYYY-MM-DD HH:mm` */
  generatedAt: string
  overallShiftStatus: HandoverOverallShiftStatus
  handoverSummary: string
  highRiskPatients: HandoverAutoHighRiskPatient[]
  pendingTasks: string[]
  criticalAlerts: string[]
  recommendations: string[]
  preparedByAI: boolean
}
