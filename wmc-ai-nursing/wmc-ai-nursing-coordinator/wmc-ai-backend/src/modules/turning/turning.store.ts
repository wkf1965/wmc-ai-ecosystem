import type { SideTurningRecord } from './turning.types.js'

const rows: SideTurningRecord[] = []

export const sideTurningMemoryStore = {
  append(record: SideTurningRecord): SideTurningRecord {
    rows.push(record)
    return record
  },

  list(): SideTurningRecord[] {
    return [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  },
}
