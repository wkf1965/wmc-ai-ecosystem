import { z } from 'zod'
import { ACK_ITEM_TYPES } from './nurseAcknowledgement.types.js'

export const nurseAcknowledgementConfirmBodySchema = z.object({
  nurseName: z.string().trim().min(1),
  announcementId: z.string().trim().min(1),
  announcementTitle: z.string().trim().min(1),
  itemType: z.enum(ACK_ITEM_TYPES).optional().default('Announcement'),
  acknowledged: z.boolean(),
  acknowledgedAt: z.string().trim().min(1),
  notes: z.string().optional().default(''),
})

export type NurseAcknowledgementConfirmBody = z.infer<typeof nurseAcknowledgementConfirmBodySchema>
