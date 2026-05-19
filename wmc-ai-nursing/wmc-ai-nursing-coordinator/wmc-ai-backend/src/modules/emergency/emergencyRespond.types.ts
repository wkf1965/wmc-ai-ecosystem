export type EmergencySeverityLevel = 'Low' | 'Medium' | 'High' | 'Critical'

/** When nursing should intervene */
export type EmergencyResponseTimePriority = 'Routine' | 'Standard' | 'Urgent' | 'Immediate'

export interface EmergencyRespondResponse {
  patientName: string
  emergencyLevel: EmergencySeverityLevel
  detectedEmergencies: string[]
  immediateActions: string[]
  aiSummary: string
  responseTimePriority: EmergencyResponseTimePriority
}
