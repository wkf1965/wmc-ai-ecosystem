/** Persisted OT calculation row (in-memory). */
export interface NurseShiftOtRecord {
  id: string
  nurseName: string
  shiftDate: string
  shiftStart: string
  shiftEnd: string
  actualClockIn: string
  actualClockOut: string
  breakMinutes: number
  notes: string
  regularHours: number
  overtimeHours: number
  lateMinutes: number
  earlyClockInMinutes: number
  createdAt: string
  recordedByUserId?: string
}
