import type { AnnouncementTargetShift, NursingAnnouncementRecord } from './nursingAnnouncement.types.js'
import type { NursingAnnouncementCreateBody } from './nursingAnnouncement.validation.js'

/** Matches flagship copy: "High priority announcement for Night Shift" */
export function announcementAlertText(
  priority: NursingAnnouncementRecord['priority'],
  targetShift: AnnouncementTargetShift,
): string {
  return `${priority} priority announcement for ${targetShift}`
}

export function buildAnnouncementRecord(
  body: NursingAnnouncementCreateBody,
  id: string,
  createdAt: string,
): NursingAnnouncementRecord {
  return {
    id,
    title: body.title.trim(),
    message: body.message.trim(),
    createdBy: body.createdBy.trim(),
    priority: body.priority,
    targetShift: body.targetShift,
    requiresAcknowledgement: body.requiresAcknowledgement,
    acknowledgements: [],
    createdAt,
  }
}
