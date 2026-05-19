export type WoundInfectionRiskLevel = 'Low' | 'Medium' | 'High'

export interface WoundAssessmentRecord {
  id: string
  createdAt: string
  patientId: string
  patientName: string
  nurseName: string
  woundLocation: string
  redness: boolean
  swelling: boolean
  discharge: boolean
  odor: boolean
  painScore: number
  woundSize: string
  dressingChanged: boolean
  photoUploaded: boolean
  notes: string
  infectionRisk: WoundInfectionRiskLevel
  alerts: string[]
  recommendations: string[]
  recordedByUserId?: string
}
