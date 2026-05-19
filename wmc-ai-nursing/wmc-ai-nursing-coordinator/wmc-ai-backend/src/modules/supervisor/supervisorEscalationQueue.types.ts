/** Priority order matches tasks / nurse-facing queue semantics */
export type SupervisorQueuePriority = 'Urgent' | 'High' | 'Medium' | 'Low'

export type SupervisorSystemStatus = 'Stable' | 'Attention Required' | 'Critical'

export interface SupervisorEscalationQueueItem {
  priority: SupervisorQueuePriority
  patientName: string
  issue: string
  source: string
  recommendedAction: string
}

export interface SupervisorEscalationQueueResponse {
  queue: SupervisorEscalationQueueItem[]
  summary: {
    urgentCases: number
    highRiskCases: number
    mediumRiskCases: number
    totalQueueItems: number
  }
  systemStatus: SupervisorSystemStatus
}
