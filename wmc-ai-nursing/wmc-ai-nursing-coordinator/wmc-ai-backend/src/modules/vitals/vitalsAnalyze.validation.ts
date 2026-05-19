import { z } from 'zod'

export const vitalsAnalyzeBodySchema = z.object({
  patientName: z.string().trim().min(1),
  bloodPressure: z.string().trim().min(1),
  pulse: z.coerce.number().int().positive().max(300),
  temperature: z.coerce.number(),
  oxygen: z.coerce.number().min(0).max(100),
  painScore: z.coerce.number().int().min(0).max(10),
  notes: z.string().trim().optional().default(''),
})

export type VitalsAnalyzeBody = z.infer<typeof vitalsAnalyzeBodySchema>
