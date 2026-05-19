import type { WoundAssessmentRecord } from './woundAssessment.types.js'

const rows: WoundAssessmentRecord[] = []

export const woundAssessmentMemoryStore = {
  append(record: WoundAssessmentRecord): WoundAssessmentRecord {
    rows.push(record)
    return record
  },

  list(): WoundAssessmentRecord[] {
    return [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  },
}
