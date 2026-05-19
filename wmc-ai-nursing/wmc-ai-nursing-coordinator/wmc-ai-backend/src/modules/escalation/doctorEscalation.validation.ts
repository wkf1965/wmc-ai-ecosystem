import { z } from 'zod'

export const doctorEscalationBodySchema = z.object({
  patientName: z.string().trim().min(1),
  bloodPressure: z.string().trim().min(1),
  pulse: z.coerce.number().int().positive().max(300),
  temperature: z.coerce.number(),
  oxygen: z.coerce.number().min(0).max(100),
  painScore: z.coerce.number().int().min(0).max(10),
  mood: z.string().trim().min(1),
  mobility: z.string().trim().min(1),
  woundCondition: z.string().trim().min(1),
  notes: z.string().trim().optional().default(''),
})

export type DoctorEscalationBody = z.infer<typeof doctorEscalationBodySchema>
