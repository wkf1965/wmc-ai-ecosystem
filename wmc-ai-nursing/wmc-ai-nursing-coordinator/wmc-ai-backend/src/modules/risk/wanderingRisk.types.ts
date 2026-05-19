export type WanderingRiskLevelDisplay = 'Low' | 'Medium' | 'High'

export interface WanderingRiskResponse {
  patientName: string
  wanderingRiskScore: number
  riskLevel: WanderingRiskLevelDisplay
  riskFactors: string[]
  recommendations: string[]
  aiSummary: string
}
