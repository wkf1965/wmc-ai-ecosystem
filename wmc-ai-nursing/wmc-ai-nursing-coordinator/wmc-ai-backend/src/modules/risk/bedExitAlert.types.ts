export type RiskTierInput = 'Low' | 'Medium' | 'High'

export type BedExitAlertLevel = 'Low' | 'Medium' | 'High' | 'Urgent'

export interface BedExitAlertResponse {
  patientName: string
  bedExitAlertLevel: BedExitAlertLevel
  alertReasons: string[]
  recommendedActions: string[]
  aiSummary: string
}
