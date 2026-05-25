import type { IncidentReportRecord } from './incident.types.js'

const rows: IncidentReportRecord[] = []

export const incidentReportsMemoryStore = {
  append(record: IncidentReportRecord): IncidentReportRecord {
    rows.push(record)
    return record
  },

  clear(): void {
    rows.length = 0
  },

  list(): IncidentReportRecord[] {
    return [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  },
}
