export type DailyFacilityFacilityStatus = 'Stable' | 'Attention Required' | 'High Alert' | 'Critical'

/** Core metrics surfaced to management dashboards */
export interface DailyFacilityKeyMetrics {
  totalPatients: number
  highRiskPatients: number
  emergencyCases: number
  doctorEscalations: number
  incidentReports: number
  pendingTasks: number
  medicationAlerts: number
  woundCases: number
  totalOTHours: number
}

export interface DailyFacilityReportResponse {
  reportDate: string
  facilityStatus: DailyFacilityFacilityStatus
  executiveSummary: string
  shiftHandoverStatus: string
  keyMetrics: DailyFacilityKeyMetrics
  riskHighlights: string[]
  staffHighlights: string[]
  familyCommunicationSummary: string[]
  managementRecommendations: string[]
}
