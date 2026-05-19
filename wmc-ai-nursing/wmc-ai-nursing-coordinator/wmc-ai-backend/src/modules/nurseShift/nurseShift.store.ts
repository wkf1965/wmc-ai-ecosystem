import type { NurseShiftOtRecord } from './nurseShift.types.js'

const rows: NurseShiftOtRecord[] = []

export const nurseShiftOtMemoryStore = {
  append(record: NurseShiftOtRecord): NurseShiftOtRecord {
    rows.push(record)
    return record
  },

  list(): NurseShiftOtRecord[] {
    return [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  },
}
