export const REMINDER_TYPES = [
  'Side Turning',
  'Medication',
  'Wound Check',
  'Vitals Recheck',
  'Doctor Follow-up',
  'Family Update',
] as const

export type ReminderTypeDisplay = (typeof REMINDER_TYPES)[number]

export const REMINDER_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const

export type ReminderPriorityDisplay = (typeof REMINDER_PRIORITIES)[number]

export interface NurseReminderRecord {
  id: string
  patientName: string
  reminderType: ReminderTypeDisplay
  task: string
  dueTime: string
  assignedTo: string
  priority: ReminderPriorityDisplay
  /** Positive hours between repeats; present only when created with repeat scheduling */
  repeatEveryHours?: number
  notes: string
  createdAt: string
}
