import { z } from 'zod'

export const familyUpdateBodySchema = z.object({
  patientName: z.string().min(1),
  condition: z.string().min(1),
  mood: z.string().min(1),
  appetite: z.string().min(1),
  mobility: z.string().min(1),
  vitalStatus: z.string().min(1),
  rehabCompleted: z.boolean(),
  sideTurningCompleted: z.boolean(),
  notes: z.string().optional().default(''),
})

export type FamilyUpdateBody = z.infer<typeof familyUpdateBodySchema>
