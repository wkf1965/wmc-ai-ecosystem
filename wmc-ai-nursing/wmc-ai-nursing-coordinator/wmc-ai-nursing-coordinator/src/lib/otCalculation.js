/**
 * Shift windows and overtime math for nurse attendance (demo — verify against payroll policy).
 */

export const GRACE_MINUTES_DEFAULT = 10

/** Day 07:00–15:00 (8h); night 19:00–07:00 next calendar day (12h). */
export const SHIFT_PRESETS = {
  day: { label: 'Day', start: '07:00', end: '15:00', standardMinutes: 480, endNextDay: false },
  night: { label: 'Night', start: '19:00', end: '07:00', standardMinutes: 720, endNextDay: true },
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** @param {string} workDate YYYY-MM-DD */
export function shiftWindow(workDate, shiftType) {
  const preset = SHIFT_PRESETS[shiftType] || SHIFT_PRESETS.day
  const expectedStartAt = new Date(`${workDate}T${preset.start}:00`).toISOString()

  let endDateStr = workDate
  if (preset.endNextDay) {
    const d = new Date(`${workDate}T12:00:00`)
    d.setDate(d.getDate() + 1)
    endDateStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }
  const expectedEndAt = new Date(`${endDateStr}T${preset.end}:00`).toISOString()

  return {
    expectedStartAt,
    expectedEndAt,
    standardMinutes: preset.standardMinutes,
    presetLabel: preset.label,
  }
}

/**
 * @param {object} p
 * @param {string} p.workDate YYYY-MM-DD
 * @param {'day'|'night'} p.shiftType
 * @param {string} p.checkInAt ISO
 * @param {string} p.checkOutAt ISO
 * @param {number} [p.graceMinutes]
 */
export function computeShiftMetrics({ workDate, shiftType, checkInAt, checkOutAt, graceMinutes = GRACE_MINUTES_DEFAULT }) {
  const { expectedStartAt, expectedEndAt, standardMinutes } = shiftWindow(workDate, shiftType)
  const cin = new Date(checkInAt)
  const cout = new Date(checkOutAt)
  const es = new Date(expectedStartAt)
  const ee = new Date(expectedEndAt)
  const graceMs = graceMinutes * 60 * 1000

  const workedMinutes = Math.max(0, Math.round((cout.getTime() - cin.getTime()) / 60000))

  const lateRaw = cin.getTime() - es.getTime() - graceMs
  const lateArrival = lateRaw > 0
  const lateMinutes = lateArrival ? Math.round(lateRaw / 60000) : 0

  const earlyRaw = ee.getTime() - graceMs - cout.getTime()
  const earlyLeave = earlyRaw > 0
  const earlyLeaveMinutes = earlyLeave ? Math.round(earlyRaw / 60000) : 0

  const otMinutes = Math.max(0, workedMinutes - standardMinutes)
  const otHours = Math.round((otMinutes / 60) * 100) / 100
  const workedHours = Math.round((workedMinutes / 60) * 100) / 100

  return {
    expectedStartAt,
    expectedEndAt,
    standardMinutes,
    workedMinutes,
    workedHours,
    otHours,
    lateArrival,
    lateMinutes,
    earlyLeave,
    earlyLeaveMinutes,
  }
}
