/**
 * Local OT / attendance storage (staff roster + shift records).
 */

import { computeShiftMetrics, shiftWindow, GRACE_MINUTES_DEFAULT } from '../lib/otCalculation.js'

const STAFF_KEY = 'wmc_ot_staff_v1'
const ATTENDANCE_KEY = 'wmc_ot_attendance_v1'
const MAX_ATTENDANCE = 3000

const SEED_STAFF = [
  { id: 'stf_seed_1', fullName: 'Avery Ng', employeeCode: 'RN-1001', active: true },
  { id: 'stf_seed_2', fullName: 'Jordan Lee', employeeCode: 'LPN-2044', active: true },
  { id: 'stf_seed_3', fullName: 'Sam Rivera', employeeCode: 'RN-1088', active: true },
]

function safeParse(raw, fallback) {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : fallback
  } catch {
    return fallback
  }
}

export function readStaff() {
  if (typeof window === 'undefined') return [...SEED_STAFF]
  try {
    const raw = localStorage.getItem(STAFF_KEY)
    if (!raw) {
      localStorage.setItem(STAFF_KEY, JSON.stringify(SEED_STAFF))
      return [...SEED_STAFF]
    }
    const rows = safeParse(raw, [])
    return rows.length ? rows : [...SEED_STAFF]
  } catch {
    return [...SEED_STAFF]
  }
}

export function writeStaff(rows) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STAFF_KEY, JSON.stringify(rows))
  } catch {
    // no-op
  }
}

export function generateStaffId() {
  return `stf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function saveStaffMember(member) {
  const all = readStaff()
  const idx = all.findIndex((s) => s.id === member.id)
  if (idx >= 0) all[idx] = member
  else all.unshift(member)
  writeStaff(all)
  return member
}

export function removeStaffMember(id) {
  writeStaff(readStaff().filter((s) => s.id !== id))
}

export function readAttendance() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(ATTENDANCE_KEY)
    if (!raw) return []
    return safeParse(raw, [])
  } catch {
    return []
  }
}

function writeAttendance(rows) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(rows.slice(0, MAX_ATTENDANCE)))
  } catch {
    // no-op
  }
}

export function generateAttendanceId() {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function saveAttendanceRecord(record) {
  const all = readAttendance()
  const idx = all.findIndex((r) => r.id === record.id)
  if (idx >= 0) all[idx] = { ...record, updatedAt: new Date().toISOString() }
  else all.unshift({ ...record, updatedAt: new Date().toISOString() })
  writeAttendance(all)
  return record
}

/** Open shift: checked in, no checkout. */
export function findOpenAttendance(staffId, workDate, shiftType) {
  return readAttendance().find(
    (r) =>
      r.staffId === staffId &&
      r.workDate === workDate &&
      r.shiftType === shiftType &&
      !r.checkOutAt &&
      r.status === 'open',
  )
}

export function checkInStaff({ staffId, staffName, workDate, shiftType }) {
  const existing = findOpenAttendance(staffId, workDate, shiftType)
  if (existing) return { ok: false, error: 'Already checked in for this shift. Check out first.', record: existing }

  const now = new Date().toISOString()
  const win = shiftWindow(workDate, shiftType)

  const record = {
    id: generateAttendanceId(),
    staffId,
    staffName,
    workDate,
    shiftType,
    checkInAt: now,
    checkOutAt: null,
    expectedStartAt: win.expectedStartAt,
    expectedEndAt: win.expectedEndAt,
    standardMinutes: win.standardMinutes,
    workedMinutes: null,
    workedHours: null,
    otHours: null,
    lateArrival: false,
    lateMinutes: 0,
    earlyLeave: false,
    earlyLeaveMinutes: 0,
    otApprovalStatus: 'open',
    approvedBy: null,
    approvedAt: null,
    supervisorNote: null,
    status: 'open',
  }

  const cin = new Date(now)
  const es = new Date(win.expectedStartAt)
  const graceMs = GRACE_MINUTES_DEFAULT * 60 * 1000
  const lateRaw = cin.getTime() - es.getTime() - graceMs
  record.lateArrival = lateRaw > 0
  record.lateMinutes = record.lateArrival ? Math.round(lateRaw / 60000) : 0

  saveAttendanceRecord(record)
  return { ok: true, record }
}

export function checkOutStaff(attendanceId) {
  const all = readAttendance()
  const idx = all.findIndex((r) => r.id === attendanceId)
  if (idx < 0) return { ok: false, error: 'Record not found.' }
  const row = all[idx]
  if (row.checkOutAt) return { ok: false, error: 'Already checked out.' }

  const now = new Date().toISOString()
  const m = computeShiftMetrics({
    workDate: row.workDate,
    shiftType: row.shiftType,
    checkInAt: row.checkInAt,
    checkOutAt: now,
    graceMinutes: GRACE_MINUTES_DEFAULT,
  })

  const next = {
    ...row,
    checkOutAt: now,
    expectedStartAt: m.expectedStartAt,
    expectedEndAt: m.expectedEndAt,
    standardMinutes: m.standardMinutes,
    workedMinutes: m.workedMinutes,
    workedHours: m.workedHours,
    otHours: m.otHours,
    lateArrival: m.lateArrival || row.lateArrival,
    lateMinutes: Math.max(row.lateMinutes || 0, m.lateMinutes),
    earlyLeave: m.earlyLeave,
    earlyLeaveMinutes: m.earlyLeaveMinutes,
    status: 'completed',
    otApprovalStatus: m.otHours > 0 ? 'pending' : 'none',
    updatedAt: now,
  }

  saveAttendanceRecord(next)
  return { ok: true, record: next }
}

export function setOtApproval(attendanceId, decision, approvedBy, supervisorNote = '') {
  const all = readAttendance()
  const idx = all.findIndex((r) => r.id === attendanceId)
  if (idx < 0) return { ok: false, error: 'Record not found.' }
  const row = all[idx]
  if (row.otApprovalStatus !== 'pending') return { ok: false, error: 'No pending OT on this record.' }

  const next = {
    ...row,
    otApprovalStatus: decision === 'approve' ? 'approved' : 'rejected',
    approvedBy: approvedBy || 'Supervisor',
    approvedAt: new Date().toISOString(),
    supervisorNote: supervisorNote.trim() || row.supervisorNote,
    updatedAt: new Date().toISOString(),
  }
  saveAttendanceRecord(next)
  return { ok: true, record: next }
}

function monthPrefix(ym) {
  return ym.length >= 7 ? ym.slice(0, 7) : ym
}

export function attendanceInMonth(ym) {
  const prefix = monthPrefix(ym)
  return readAttendance().filter((r) => r.workDate && r.workDate.startsWith(prefix))
}

export function getDashboardOtSnapshot() {
  const rows = readAttendance()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const openToday = rows.filter((r) => r.status === 'open' && r.workDate === todayStr).length
  const pendingOt = rows.filter((r) => r.otApprovalStatus === 'pending').length

  const monthRows = rows.filter((r) => r.workDate.startsWith(ym) && r.status === 'completed')
  const approvedOtHours = monthRows.filter((r) => r.otApprovalStatus === 'approved').reduce((s, r) => s + (Number(r.otHours) || 0), 0)
  const lateMonth = monthRows.filter((r) => r.lateArrival).length

  return {
    openToday,
    pendingOt,
    approvedOtHoursMonth: Math.round(approvedOtHours * 100) / 100,
    lateArrivalsMonth: lateMonth,
    monthLabel: ym,
  }
}

/** Build CSV for completed rows in a month (YYYY-MM). */
export function buildOtReportCsv(ym) {
  const list = attendanceInMonth(ym).filter((r) => r.status === 'completed')
  const headers = [
    'Staff',
    'EmployeeCode',
    'WorkDate',
    'Shift',
    'CheckIn',
    'CheckOut',
    'WorkedHours',
    'StandardHours',
    'OTHours',
    'OTApproval',
    'LateArrival',
    'LateMinutes',
    'EarlyLeave',
    'EarlyLeaveMinutes',
    'ApprovedBy',
    'ApprovedAt',
    'SupervisorNote',
  ]
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.join(',')]
  const staff = readStaff()
  for (const r of list.sort((a, b) => (a.workDate + a.staffName).localeCompare(b.workDate + b.staffName))) {
    const code = staff.find((s) => s.id === r.staffId)?.employeeCode || ''
    const stdH = ((r.standardMinutes || 0) / 60).toFixed(2)
    lines.push(
      [
        esc(r.staffName),
        esc(code),
        esc(r.workDate),
        esc(r.shiftType),
        esc(r.checkInAt),
        esc(r.checkOutAt),
        esc(r.workedHours ?? ''),
        esc(stdH),
        esc(r.otHours ?? ''),
        esc(r.otApprovalStatus),
        esc(r.lateArrival ? 'Yes' : 'No'),
        esc(r.lateMinutes ?? 0),
        esc(r.earlyLeave ? 'Yes' : 'No'),
        esc(r.earlyLeaveMinutes ?? 0),
        esc(r.approvedBy ?? ''),
        esc(r.approvedAt ?? ''),
        esc(r.supervisorNote ?? ''),
      ].join(','),
    )
  }
  return lines.join('\r\n')
}
