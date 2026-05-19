import { z } from 'zod'

export const nurseShiftOtCalculateSchema = z.object({
  nurseName: z.string().trim().min(1),
  shiftDate: z.string().trim().min(1),
  shiftStart: z.string().trim().min(1),
  shiftEnd: z.string().trim().min(1),
  actualClockIn: z.string().trim().min(1),
  actualClockOut: z.string().trim().min(1),
  breakMinutes: z.coerce.number().int().min(0).max(480),
  notes: z.string().trim().optional().default(''),
})

export type NurseShiftOtCalculateBody = z.infer<typeof nurseShiftOtCalculateSchema>
