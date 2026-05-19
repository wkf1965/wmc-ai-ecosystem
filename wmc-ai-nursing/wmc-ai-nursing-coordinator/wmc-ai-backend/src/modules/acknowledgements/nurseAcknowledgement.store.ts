import type { NurseAcknowledgementRecord } from './nurseAcknowledgement.types.js'

const rows: NurseAcknowledgementRecord[] = []

export const nurseAcknowledgementMemoryStore = {
  append(record: NurseAcknowledgementRecord): NurseAcknowledgementRecord {
    rows.push(record)
    return record
  },

  list(): NurseAcknowledgementRecord[] {
    return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },
}
