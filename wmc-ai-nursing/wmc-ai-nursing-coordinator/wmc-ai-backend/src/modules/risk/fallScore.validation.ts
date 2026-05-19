import { z } from 'zod'

export const fallScoreBodySchema = z.object({
  patientName: z.string().trim().min(1),
  mobility: z.string().trim().min(1),
  mood: z.string().trim().min(1),
  painScore: z.coerce.number().int().min(0).max(10),
  oxygen: z.coerce.number().min(0).max(100),
  historyOfFalls: z.boolean(),
  walkingAssist: z.boolean(),
  confusion: z.boolean(),
  age: z.coerce.number().int().min(0).max(130),
})

export type FallScoreBody = z.infer<typeof fallScoreBodySchema>
