import { z } from 'zod'

export const pressureUlcerBodySchema = z.object({
  patientName: z.string().trim().min(1),
  bedbound: z.boolean(),
  sideTurningCompleted: z.boolean(),
  nutritionStatus: z.string().trim().min(1),
  skinCondition: z.string().trim().min(1),
  moisture: z.string().trim().min(1),
  mobility: z.string().trim().min(1),
  age: z.coerce.number().int().min(0).max(130),
  incontinence: z.boolean(),
})

export type PressureUlcerBody = z.infer<typeof pressureUlcerBodySchema>
