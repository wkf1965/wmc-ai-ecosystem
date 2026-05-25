/**
 * Attendance Punch Storage — frontend localStorage
 *
 * Mirrors the "attendance_records" Google Sheet tab.
 * Used by the React dashboard for offline/local display and manual entry.
 *
 * 14-column schema:
 *   date | staff_name | telegram_username
 *   normal_punch_in | normal_punch_out | ot_in | ot_out
 *   ot_hours | ot_rate | ot_amount
 *   record_status | approval_status | approved_by | remarks
 */

import {
  buildAttendanceRecord,
  buildMonthlyOtSummary,
  todayString,
  currentYearMonth,
  RECORD_STATUS,
  APPROVAL_STATUS,
} from '../lib/attendanceCalculation.js'

const KEY      = 'wmc_attendance_v2'
const MAX_ROWS = 3000

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeRead() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? p : []
  } catch { return [] }
}

function safeWrite(rows) {
  if (typeof window === 'undefined') return false
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_ROWS)))
    return true
  } catch { return false }
}

export function generateId() {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function readRecords() {
  return safeRead()
}

/**
 * Save (insert or update by id) one attendance record.
 * Fields are run through buildAttendanceRecord() for consistent computed values.
 */
export function saveRecord(fields) {
  const all    = safeRead()
  const record = buildAttendanceRecord(fields)
  if (!fields.id) {
    record.id        = generateId()
    record.createdAt = new Date().toISOString()
    all.unshift(record)
  } else {
    record.id        = fields.id
    record.createdAt = fields.createdAt ?? new Date().toISOString()
    record.updatedAt = new Date().toISOString()
    const idx = all.findIndex((r) => r.id === fields.id)
    if (idx >= 0) all[idx] = record
    else all.unshift(record)
  }
  return safeWrite(all) ? record : null
}

export function setApproval(id, approval_status, approved_by) {
  const all = safeRead()
  const idx = all.findIndex((r) => r.id === id)
  if (idx < 0) return null
  all[idx] = { ...all[idx], approval_status, approved_by, updatedAt: new Date().toISOString() }
  safeWrite(all)
  return all[idx]
}

export function deleteRecord(id) {
  safeWrite(safeRead().filter((r) => r.id !== id))
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getRecordsForDate(date = todayString()) {
  return safeRead().filter((r) => r.date === date)
}

export function getRecordsForMonth(month = currentYearMonth()) {
  const prefix = month.slice(0, 7)
  return safeRead().filter((r) => (r.date ?? '').startsWith(prefix))
}

// ── Dashboard stats ───────────────────────────────────────────────────────────

/**
 * Today's statistics for the 6 dashboard KPI cards.
 */
export function getTodayStats() {
  const records = getRecordsForDate()
  return {
    onDutyCount:          records.filter((r) => r.record_status === RECORD_STATUS.ON_DUTY).length,
    onOtCount:            records.filter((r) => r.record_status === RECORD_STATUS.ON_OT).length,
    missingPunchOutCount: records.filter((r) => r.record_status === RECORD_STATUS.MISSING_PUNCH_OUT).length,
    totalOtHoursToday:    Math.round(records.reduce((s, r) => s + (Number(r.ot_hours) || 0), 0) * 100) / 100,
    pendingApprovalCount: records.filter((r) =>
      r.record_status   === RECORD_STATUS.OT_COMPLETE &&
      r.approval_status === APPROVAL_STATUS.PENDING,
    ).length,
    allRecords:           records,
  }
}

/** Monthly OT ranking (approved OT Complete records). */
export function getMonthlyOtRanking(month = currentYearMonth()) {
  return buildMonthlyOtSummary(safeRead(), month)
}
