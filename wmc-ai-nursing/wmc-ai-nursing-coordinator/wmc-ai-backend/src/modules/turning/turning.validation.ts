import { z } from 'zod'

export const sideTurningCreateSchema = z.object({
  patientId: z.string().trim().min(1),
  patientName: z.string().trim().min(1),
  nurseName: z.string().trim().min(1),
  turningTime: z.string().trim().min(1),
  turningPosition: z.string().trim().min(1),
  skinCondition: z.string().trim().min(1),
  photoRequired: z.boolean(),
  photoUploaded: z.boolean(),
  notes: z.string().trim().optional().default(''),
})
