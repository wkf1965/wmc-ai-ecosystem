export type EscalationPriorityLevel = 'Low' | 'Medium' | 'High' | 'Urgent'

export interface DoctorEscalationResponse {
  patientName: string
  escalationRequired: boolean
  priority: EscalationPriorityLevel
  reasons: string[]
  recommendedActions: string[]
}
