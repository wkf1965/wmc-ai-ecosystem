import type { NurseShiftOtCalculateBody } from './nurseShift.validation.js'

/** Minutes since midnight from `HH:mm` */
export function clockToMinutes(clock: string): number | null {
  const m = clock.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null
  return h * 60 + min
}

export interface NurseShiftOtComputed {
  regularHours: number
  overtimeHours: number
  lateMinutes: number
  earlyClockInMinutes: number
}

/**
 * Same-calendar-day shift only.
 * - **Regular hours** = scheduled span minus break (paid roster window).
 * - **Overtime hours** = clock-out after scheduled end (decimal hours).
 * - **Late minutes** = clock-in after scheduled start.
 * - **Early clock-in** = scheduled start minus clock-in when early.
 */
export function computeNurseShiftOt(body: NurseShiftOtCalculateBody): NurseShiftOtComputed {
  const ss = clockToMinutes(body.shiftStart)
  const se = clockToMinutes(body.shiftEnd)
  const ai = clockToMinutes(body.actualClockIn)
  const ao = clockToMinutes(body.actualClockOut)

  if (ss === null || se === null || ai === null || ao === null) {
    throw new Error('Invalid time format — use HH:mm')
  }
  if (se <= ss) throw new Error('shiftEnd must be after shiftStart (same-day shift)')
  if (ao <= ai) throw new Error('actualClockOut must be after actualClockIn')

  const scheduledGrossMin = se - ss
  const regularMinutes = Math.max(0, scheduledGrossMin - body.breakMinutes)
  const regularHours = Math.round((regularMinutes / 60) * 1000) / 1000

  const overtimeMinutes = Math.max(0, ao - se)
  const overtimeHours = Math.round((overtimeMinutes / 60) * 1000) / 1000

  const lateMinutes = Math.max(0, ai - ss)
  const earlyClockInMinutes = Math.max(0, ss - ai)

  return {
    regularHours,
    overtimeHours,
    lateMinutes,
    earlyClockInMinutes,
  }
}
