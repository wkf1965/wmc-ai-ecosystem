/**
 * OT Payroll Records — localStorage store
 *
 * Mirrors the Google Sheet tab layout:
 *   ot_records          — one row per OT shift (14 columns, see buildOtRecordSheetRow)
 *   ot_payroll_summary  — aggregated monthly totals  (7 columns)
 *
 * Payroll eligibility rule:
 *   record_status = "Complete"  AND  approval_status = "Approved"
 */

import {
  buildOtRecord,
  buildMonthlyPayrollSummary,
  currentYearMonth,
} from '../lib/otPayrollCalculation.js'

const RECORDS_KEY = 'wmc_ot_payroll_records_v2'   // v2 because schema changed
const SUMMARY_KEY = 'wmc_ot_payroll_summary_v2'
const MAX_RECORDS = 2000

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeRead(key) {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeWrite(key, rows) {
  if (typeof window === 'undefined') return false
  try {
    localStorage.setItem(key, JSON.stringify(rows.slice(0, MAX_RECORDS)))
    return true
  } catch {
    return false
  }
}

export function generateOtRecordId() {
  return `otp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── OT Records ────────────────────────────────────────────────────────────────

export function readOtRecords() {
  return safeRead(RECORDS_KEY)
}

/**
 * Save or update one OT record.
 * Fields are run through buildOtRecord() which auto-computes:
 *   record_status, ot_hours, ot_amount, and default remarks.
 *
 * @param {object} fields — raw form / bot data including punch_in, punch_out
 * @returns {object|null}
 */
export function saveOtRecord(fields) {
  const all    = safeRead(RECORDS_KEY)
  const record = buildOtRecord(fields)

  if (!fields.id) {
    record.id        = generateOtRecordId()
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

  return safeWrite(RECORDS_KEY, all) ? record : null
}

/**
 * Approve or reject a record.
 * Only records with record_status = "Complete" will count into payroll,
 * but the supervisor can still approve/reject any record.
 *
 * @param {string} id
 * @param {'Approved'|'Rejected'} status
 * @param {string} approvedBy
 */
export function setOtApprovalStatus(id, status, approvedBy) {
  const all = safeRead(RECORDS_KEY)
  const idx = all.findIndex((r) => r.id === id)
  if (idx < 0) return null
  all[idx] = {
    ...all[idx],
    approval_status: status,
    approved_by:     approvedBy,
    updatedAt:       new Date().toISOString(),
  }
  safeWrite(RECORDS_KEY, all)
  return all[idx]
}

export function deleteOtRecord(id) {
  safeWrite(RECORDS_KEY, safeRead(RECORDS_KEY).filter((r) => r.id !== id))
}

/**
 * OT records whose date falls in the given month.
 * @param {string} [month] YYYY-MM
 */
export function getOtRecordsForMonth(month = currentYearMonth()) {
  const prefix = month.slice(0, 7)
  return safeRead(RECORDS_KEY).filter((r) => (r.date ?? '').startsWith(prefix))
}

/**
 * Find individual records for a staff member on a specific date.
 * @param {string} staffName  — case-insensitive substring
 * @param {string} date       — YYYY-MM-DD (exact)
 */
export function getOtRecordsByStaffDate(staffName, date) {
  return safeRead(RECORDS_KEY).filter(
    (r) =>
      r.date === date &&
      (r.staff_name ?? '').toLowerCase().includes(staffName.toLowerCase()),
  )
}

// ── Payroll Summary ───────────────────────────────────────────────────────────

export function refreshPayrollSummary(month = currentYearMonth()) {
  const records = readOtRecords()
  const summary = buildMonthlyPayrollSummary(records, month)
  const all     = safeRead(SUMMARY_KEY).filter((s) => s.month !== month)
  safeWrite(SUMMARY_KEY, [...summary, ...all])
  return summary
}

export function getPayrollSummary(month = currentYearMonth()) {
  const cached = safeRead(SUMMARY_KEY).filter((s) => s.month === month)
  if (cached.length > 0) return cached
  return refreshPayrollSummary(month)
}

export function getStaffPayrollSummary(staffName, month = currentYearMonth()) {
  return (
    getPayrollSummary(month).find(
      (r) => r.staff_name.toLowerCase().includes(staffName.toLowerCase()),
    ) ?? null
  )
}

// ── Google Sheets row builders ────────────────────────────────────────────────

/**
 * Build row array for the "ot_records" sheet tab.
 *
 * Column order (14 cols):
 *   date | staff_name | shift | scheduled_start | scheduled_end
 *   punch_in | punch_out | ot_hours | ot_rate | ot_amount
 *   record_status | approval_status | approved_by | remarks
 */
export function buildOtRecordSheetRow(record) {
  return [
    record.date            ?? '',
    record.staff_name      ?? '',
    record.shift           ?? '',
    record.scheduled_start ?? '',
    record.scheduled_end   ?? '',
    record.punch_in        ?? '',
    record.punch_out       ?? '',
    record.ot_hours        ?? 0,
    record.ot_rate         ?? 10,
    record.ot_amount       ?? 0,
    record.record_status   ?? '',
    record.approval_status ?? 'Pending',
    record.approved_by     ?? '',
    record.remarks         ?? '',
  ]
}

/**
 * Build row array for the "ot_payroll_summary" sheet tab.
 *
 * Column order (7 cols):
 *   month | staff_name | total_ot_hours | ot_rate | total_ot_amount
 *   approved_by | remarks
 */
export function buildPayrollSummarySheetRow(summary) {
  return [
    summary.month           ?? '',
    summary.staff_name      ?? '',
    summary.total_ot_hours  ?? 0,
    summary.ot_rate         ?? 10,
    summary.total_ot_amount ?? 0,
    summary.approved_by     ?? '',
    summary.remarks         ?? '',
  ]
}
