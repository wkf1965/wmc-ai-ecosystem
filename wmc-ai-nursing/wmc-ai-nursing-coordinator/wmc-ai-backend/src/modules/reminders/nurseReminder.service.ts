import type { NurseReminderRecord, ReminderPriorityDisplay } from './nurseReminder.types.js'
import { addHoursToClockHm } from '../turning/turning.service.js'
import type { NurseReminderCreateBody } from './nurseReminder.validation.js'

export function nextReminderTimeHm(body: NurseReminderCreateBody): string | undefined {
  if (body.repeatEveryHours === undefined) return undefined
  const next = addHoursToClockHm(body.dueTime, body.repeatEveryHours)
  return next || undefined
}

export function priorityAlertText(priority: ReminderPriorityDisplay): string | undefined {
  if (priority === 'High') return 'High priority reminder created'
  if (priority === 'Urgent') return 'Urgent priority reminder created'
  return undefined
}

export function normalizeDueTimeHm(dueTime: string): string {
  const m = dueTime.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return dueTime.trim()
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh > 23 || mm > 59) return dueTime.trim()
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function buildReminderRecord(body: NurseReminderCreateBody, id: string, createdAt: string): NurseReminderRecord {
  const base: NurseReminderRecord = {
    id,
    patientName: body.patientName.trim(),
    reminderType: body.reminderType,
    task: body.task.trim(),
    dueTime: normalizeDueTimeHm(body.dueTime),
    assignedTo: body.assignedTo.trim(),
    priority: body.priority,
    notes: body.notes?.trim() ?? '',
    createdAt,
  }
  if (body.repeatEveryHours !== undefined) {
    base.repeatEveryHours = body.repeatEveryHours
  }
  return base
}
