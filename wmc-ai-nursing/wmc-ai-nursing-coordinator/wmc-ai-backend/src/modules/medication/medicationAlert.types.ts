export type MedicationAlertLevelDisplay = 'Low' | 'Moderate' | 'High'

export interface MedicationCheckAlertResponse {
  patientName: string
  alertLevel: MedicationAlertLevelDisplay
  alerts: string[]
  recommendations: string[]
}
