import { z } from 'zod'

/** One patient's snapshot for shift handover (subset of structured nursing observation). */
export const handoverRecordSchema = z.object({
  patientName: z.string().trim().min(1),
  bloodPressure: z.string().trim().min(1),
  pulse: z.coerce.number().int().positive().max(300),
  temperature: z.coerce.number(),
  oxygen: z.coerce.number().min(0).max(100),
  painScore: z.coerce.number().int().min(0).max(10),
  mood: z.string().trim().min(1),
  mobility: z.string().trim().min(1),
  sideTurning: z.string().trim().min(1),
  woundCondition: z.string().trim().min(1),
  notes: z.string().trim().optional().default(''),
})

/** Request body for `POST /handover/generate` */
export const handoverGenerateBodySchema = z.object({
  shift: z.string().trim().min(1),
  nurseInCharge: z.string().trim().min(1),
  records: z.array(handoverRecordSchema).min(1),
})

export type HandoverRecordSnapshot = z.infer<typeof handoverRecordSchema>
export type HandoverGenerateBody = z.infer<typeof handoverGenerateBodySchema>
