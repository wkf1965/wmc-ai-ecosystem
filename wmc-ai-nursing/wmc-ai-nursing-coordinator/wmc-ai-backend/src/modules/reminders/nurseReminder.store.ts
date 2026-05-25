import type { NurseReminderRecord } from './nurseReminder.types.js'

const rows: NurseReminderRecord[] = []

export const nurseReminderMemoryStore = {
  append(record: NurseReminderRecord): NurseReminderRecord {
    rows.push(record)
    return record
  },

  clear(): void {
    rows.length = 0
  },

  list(): NurseReminderRecord[] {
    return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },
}
