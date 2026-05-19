export const ANNOUNCEMENT_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const

export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number]

export const ANNOUNCEMENT_TARGET_SHIFTS = [
  'Morning Shift',
  'Evening Shift',
  'Night Shift',
  'All Shifts',
] as const

export type AnnouncementTargetShift = (typeof ANNOUNCEMENT_TARGET_SHIFTS)[number]

export interface AnnouncementAcknowledgement {
  acknowledgedBy: string
  acknowledgedAt: string
}

export interface NursingAnnouncementRecord {
  id: string
  title: string
  message: string
  createdBy: string
  priority: AnnouncementPriority
  targetShift: AnnouncementTargetShift
  requiresAcknowledgement: boolean
  acknowledgements: AnnouncementAcknowledgement[]
  createdAt: string
}
