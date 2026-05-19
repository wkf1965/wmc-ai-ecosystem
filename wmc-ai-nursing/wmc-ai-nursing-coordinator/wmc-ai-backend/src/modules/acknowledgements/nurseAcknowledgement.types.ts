/** What the nurse is acknowledging (announcements, alerts, handover follow-ups). */
export const ACK_ITEM_TYPES = ['Announcement', 'Urgent Alert', 'Handover Task'] as const

export type AcknowledgementItemType = (typeof ACK_ITEM_TYPES)[number]

export type NurseAcknowledgementStatus = 'Confirmed' | 'Pending'

export interface NurseAcknowledgementRecord {
  id: string
  nurseName: string
  /** Referenced item id (announcement code, alert id, handover task id, etc.) */
  announcementId: string
  announcementTitle: string
  itemType: AcknowledgementItemType
  acknowledged: boolean
  /** Client-supplied acknowledgement timestamp label */
  acknowledgedAt: string
  notes: string
  /** Derived presentation status */
  status: NurseAcknowledgementStatus
  createdAt: string
}
