import type { NursingClinicalRecord } from './nursing.records.types.js'

/** In-memory store for structured nursing records (mock DB). */
const rows: NursingClinicalRecord[] = []

export const nursingClinicalRecordsMemoryStore = {
  append(record: NursingClinicalRecord): NursingClinicalRecord {
    rows.push(record)
    return record
  },

  clear(): void {
    rows.length = 0
  },

  list(): NursingClinicalRecord[] {
    return [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  },
}
