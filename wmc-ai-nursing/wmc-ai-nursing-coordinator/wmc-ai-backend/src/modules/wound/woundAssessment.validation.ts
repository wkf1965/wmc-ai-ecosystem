import { z } from 'zod'

export const woundAssessmentBodySchema = z.object({
  patientId: z.string().min(1),
  patientName: z.string().min(1),
  nurseName: z.string().min(1),
  woundLocation: z.string().min(1),
  redness: z.boolean(),
  swelling: z.boolean(),
  discharge: z.boolean(),
  odor: z.boolean(),
  painScore: z.number().min(0).max(10),
  woundSize: z.string().min(1),
  dressingChanged: z.boolean(),
  photoUploaded: z.boolean(),
  notes: z.string().optional().default(''),
})

export type WoundAssessmentBody = z.infer<typeof woundAssessmentBodySchema>
