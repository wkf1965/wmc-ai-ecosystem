export type VitalAlertLevelDisplay = 'Low' | 'Medium' | 'High'

export interface VitalsAnalyzeResponse {
  patientName: string
  alertLevel: VitalAlertLevelDisplay
  abnormalSigns: string[]
  recommendations: string[]
}
