import { z } from 'zod'

const riskTierSchema = z.enum(['Low', 'Medium', 'High'])

export const bedExitAlertBodySchema = z.object({
  patientName: z.string().trim().min(1),
  age: z.coerce.number().int().min(0).max(130),
  mobility: z.string().trim().min(1),
  confusion: z.boolean(),
  fallRiskLevel: riskTierSchema,
  wanderingRiskLevel: riskTierSchema,
  bedExitAttempt: z.boolean(),
  /** Local time of attempt when known — optional; strengthens night narrative when present */
  timeOfAttempt: z.string().trim().optional().default(''),
  nightShift: z.boolean(),
  notes: z.string().optional().default(''),
})

export type BedExitAlertBody = z.infer<typeof bedExitAlertBodySchema>
