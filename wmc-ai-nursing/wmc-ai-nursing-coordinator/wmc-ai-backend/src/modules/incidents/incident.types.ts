export type IncidentSeverityLevel = 'Low' | 'Medium' | 'High' | 'Critical'

export interface IncidentReportRecord {
  id: string
  createdAt: string
  patientName: string
  incidentType: string
  incidentTime: string
  location: string
  reportedBy: string
  injuryDetected: boolean
  injuryDetails: string
  vitalStatus: string
  doctorInformed: boolean
  familyInformed: boolean
  notes: string
  incidentSeverity: IncidentSeverityLevel
  aiSummary: string
  recommendedActions: string[]
  recordedByUserId?: string
}
