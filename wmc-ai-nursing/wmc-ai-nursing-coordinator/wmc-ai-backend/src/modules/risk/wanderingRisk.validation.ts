import { z } from 'zod'

export const wanderingRiskBodySchema = z.object({
  patientName: z.string().trim().min(1),
  age: z.coerce.number().int().min(0).max(130),
  diagnosis: z.string().trim().min(1),
  confusion: z.boolean(),
  agitation: z.boolean(),
  nightRestlessness: z.boolean(),
  historyOfWandering: z.boolean(),
  mobility: z.string().trim().min(1),
  sleepPattern: z.string().trim().min(1),
  notes: z.string().optional().default(''),
})

export type WanderingRiskBody = z.infer<typeof wanderingRiskBodySchema>
