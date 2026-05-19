import { z } from 'zod'
import { ANNOUNCEMENT_PRIORITIES, ANNOUNCEMENT_TARGET_SHIFTS } from './nursingAnnouncement.types.js'

export const nursingAnnouncementCreateBodySchema = z.object({
  title: z.string().trim().min(1),
  message: z.string().trim().min(1),
  createdBy: z.string().trim().min(1),
  priority: z.enum(ANNOUNCEMENT_PRIORITIES),
  targetShift: z.enum(ANNOUNCEMENT_TARGET_SHIFTS),
  requiresAcknowledgement: z.boolean(),
})

export type NursingAnnouncementCreateBody = z.infer<typeof nursingAnnouncementCreateBodySchema>

export const nursingAnnouncementAckBodySchema = z.object({
  announcementId: z.string().uuid(),
  acknowledgedBy: z.string().trim().min(1),
})

export type NursingAnnouncementAckBody = z.infer<typeof nursingAnnouncementAckBodySchema>
