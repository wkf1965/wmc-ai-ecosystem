import { z } from 'zod'

export const emergencyRespondBodySchema = z.object({
  patientName: z.string().trim().min(1),
  eventType: z.string().trim().min(1),
  bloodPressure: z.string().trim().min(1),
  pulse: z.coerce.number().int().min(40).max(220),
  temperature: z.coerce.number(),
  oxygen: z.coerce.number().min(0).max(100),
  consciousness: z.string().trim().min(1),
  breathingDifficulty: z.boolean(),
  notes: z.string().optional().default(''),
})

export type EmergencyRespondBody = z.infer<typeof emergencyRespondBodySchema>
