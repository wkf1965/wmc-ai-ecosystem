export type FallRiskLevelDisplay = 'Low' | 'Moderate' | 'High'

/** Response — rule-based composite for fall-risk triage */
export interface FallScoreResponse {
  patientName: string
  fallRiskScore: number
  riskLevel: FallRiskLevelDisplay
  riskFactors: string[]
  recommendations: string[]
}
