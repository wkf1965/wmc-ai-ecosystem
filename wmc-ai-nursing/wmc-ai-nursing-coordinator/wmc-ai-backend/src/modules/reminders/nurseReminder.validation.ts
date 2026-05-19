import { z } from 'zod'
import { REMINDER_PRIORITIES, REMINDER_TYPES } from './nurseReminder.types.js'

export const nurseReminderCreateBodySchema = z.object({
  patientName: z.string().trim().min(1),
  reminderType: z.enum(REMINDER_TYPES),
  task: z.string().trim().min(1),
  dueTime: z
    .string()
    .trim()
    .regex(/^(?:[01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  assignedTo: z.string().trim().min(1),
  priority: z.enum(REMINDER_PRIORITIES),
  repeatEveryHours: z.coerce.number().finite().positive().optional(),
  notes: z.string().optional().default(''),
})

export type NurseReminderCreateBody = z.infer<typeof nurseReminderCreateBodySchema>
