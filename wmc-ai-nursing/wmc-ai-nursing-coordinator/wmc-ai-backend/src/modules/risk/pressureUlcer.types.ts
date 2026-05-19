export type PressureUlcerRiskLevelDisplay = 'Low' | 'Moderate' | 'High'

export interface PressureUlcerRiskResponse {
  patientName: string
  pressureUlcerRiskScore: number
  riskLevel: PressureUlcerRiskLevelDisplay
  riskFactors: string[]
  recommendations: string[]
}
