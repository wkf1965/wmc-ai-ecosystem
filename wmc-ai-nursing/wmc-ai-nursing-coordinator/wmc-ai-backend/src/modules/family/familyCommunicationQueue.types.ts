export type FamilyCommunicationPriority = 'Urgent' | 'High' | 'Medium' | 'Low'

export interface FamilyCommunicationQueueItem {
  patientName: string
  priority: FamilyCommunicationPriority
  /** Short clinical / operational label for coordinators */
  reason: string
  recommendedMessage: string
}

export interface FamilyCommunicationQueueSummary {
  urgentFamilyUpdates: number
  /** Combined High / Medium / Low queue depth */
  routineUpdates: number
  totalPendingCommunications: number
}

export interface FamilyCommunicationQueueResponse {
  queue: FamilyCommunicationQueueItem[]
  summary: FamilyCommunicationQueueSummary
  recommendedActions: string[]
}
