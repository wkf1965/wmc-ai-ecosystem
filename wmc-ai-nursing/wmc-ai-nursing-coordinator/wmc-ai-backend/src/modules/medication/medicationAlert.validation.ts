import { z } from 'zod'

export const medicationCheckAlertBodySchema = z.object({
  patientName: z.string().trim().min(1),
  medicationName: z.string().trim().min(1),
  scheduledTime: z.string().trim().min(1),
  givenTime: z.string().trim().min(1),
  doseGiven: z.boolean(),
  missedDose: z.boolean(),
  allergy: z.boolean(),
  bloodPressure: z.string().trim().min(1),
  notes: z.string().trim().optional().default(''),
})

export type MedicationCheckAlertBody = z.infer<typeof medicationCheckAlertBodySchema>
