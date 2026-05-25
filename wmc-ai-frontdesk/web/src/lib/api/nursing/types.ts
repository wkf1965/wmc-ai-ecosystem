export type NursingPatientsResponse = {
  patients: Array<{ id: string; fullName: string; mrn?: string }>
}

export type NursingRecordsResponse = {
  records: unknown[]
}

export type NursingDashboardSummary = {
  totalPatients: number
  highRiskPatients: string[]
  pendingTasks: string[]
  alerts: {
    fallRisk: number
    pressureUlcerRisk: number
    vitalAlerts: number
    woundAlerts: number
    medicationAlerts: number
    doctorEscalations: number
  }
  shiftStatus: "Stable" | "Attention Required"
}

export type NursingTasksQueueResponse = {
  tasks: unknown[]
  summary: {
    urgentTasks: number
    highPriorityTasks: number
    mediumPriorityTasks: number
    totalTasks: number
  }
}

export type NursingEscalationQueueResponse = {
  queue: unknown[]
  summary: {
    urgentCases: number
    highRiskCases: number
    mediumRiskCases: number
    totalQueueItems: number
  }
  systemStatus: string
}

export type NursingCommandCenterStatus = {
  facilityStatus: string
  summary: Record<string, number>
  criticalPatients: Array<{ patientName: string; issue: string; priority: string }>
  operationalAlerts: string[]
  recommendedActions: string[]
  systemHealth?: { apiStatus?: string }
}

export type NursingDashboardSnapshot = {
  online: boolean
  usingMock: boolean
  error: string | null
  fetchedAt: string
  totalPatients: number
  nursingRecordsCount: number
  highRiskPatients: number
  highRiskPatientNames: string[]
  pendingTasks: number
  urgentEscalations: number
  facilityStatus: string
  commandCenterStatus: string
  shiftStatus: string
  supervisorSystemStatus: string
}
