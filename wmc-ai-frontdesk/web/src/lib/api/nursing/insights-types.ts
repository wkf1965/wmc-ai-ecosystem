/** GET /analytics/predictive-risk (may 404 until backend ships — mock fallback) */
export type PredictiveRiskResponse = {
  overallPrediction: string
  highConcernAreas: string[]
  preventiveRecommendations: string[]
  generatedAt?: string
}

export type NightShiftMonitorResponse = {
  nightShiftSummary: {
    highRiskPatients: string[]
    pendingTasks: string[]
    criticalAlerts: string[]
    unacknowledgedAlerts: number
    doctorEscalations: number
  }
  recommendations: string[]
  systemStatus: string
}

export type DailyFacilityReportResponse = {
  reportDate: string
  facilityStatus: string
  executiveSummary: string
  shiftHandoverStatus?: string
  keyMetrics: {
    totalPatients: number
    highRiskPatients: number
    emergencyCases: number
    doctorEscalations: number
    incidentReports?: number
    pendingTasks: number
    medicationAlerts?: number
    woundCases?: number
    totalOTHours: number
  }
  riskHighlights?: string[]
  staffHighlights?: string[]
  familyCommunicationSummary?: string[]
  managementRecommendations?: string[]
}

export type HandoverAutoGenerateResponse = {
  shift: string
  generatedAt: string
  overallShiftStatus: string
  handoverSummary: string
  highRiskPatients: Array<{ patientName: string; issues: string[] }>
  pendingTasks: string[]
  criticalAlerts: string[]
  recommendations: string[]
  preparedByAI?: boolean
}

export type FamilyCommunicationQueueResponse = {
  queue: Array<{
    patientName: string
    priority: string
    reason: string
    recommendedMessage: string
  }>
  summary: {
    urgentFamilyUpdates: number
    routineUpdates: number
    totalPendingCommunications: number
  }
  recommendedActions: string[]
}
