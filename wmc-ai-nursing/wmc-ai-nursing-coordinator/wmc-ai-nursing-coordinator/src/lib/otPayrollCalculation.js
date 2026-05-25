/**
 * OT Payroll Calculation Engine
 *
 * Accurate rules:
 *   1. OT requires BOTH punch_in AND punch_out.
 *      → Missing punch_out: record_status = "Missing Punch Out", ot_hours = 0.
 *   2. OT hours = punch_out − scheduled_end  (only when punch_out > scheduled_end).
 *   3. OT amount = ot_hours × ot_rate  (default RM 10 / hr).
 *   4. Manual claims are recorded but marked "Pending Approval"; they do NOT
 *      count into payroll until record_status = "Complete" AND
 *      approval_status = "Approved".
 *
 * No performance score, no side-turning allowance, no bonus/deduction.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_OT_RATE = 10   // RM per hour

/** All valid record_status values */
export const RECORD_STATUS = {
  COMPLETE:          'Complete',
  MISSING_PUNCH_IN:  'Missing Punch In',
  MISSING_PUNCH_OUT: 'Missing Punch Out',
  INVALID_TIME:      'Invalid Time',
  PENDING_APPROVAL:  'Pending Approval',
}

/** approval_status value that counts into payroll */
export const APPROVED_STATUS = 'Approved'

// ── Time helpers ──────────────────────────────────────────────────────────────

/**
 * Parse "HH:mm" → minutes from midnight. Returns -1 for invalid input.
 */
function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return -1
  const [h, m] = hhmm.trim().split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1
  return h * 60 + m
}

/**
 * Format total minutes as "HH:mm".
 */
export function minutesToHhmm(mins) {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── Record status logic ───────────────────────────────────────────────────────

/**
 * Determine the record_status from raw punch times.
 *
 * @param {string|undefined} punchIn   HH:mm
 * @param {string|undefined} punchOut  HH:mm
 * @returns {string} one of RECORD_STATUS values
 */
export function getRecordStatus(punchIn, punchOut) {
  const hasIn  = Boolean(punchIn  && punchIn.trim())
  const hasOut = Boolean(punchOut && punchOut.trim())

  if (!hasIn)  return RECORD_STATUS.MISSING_PUNCH_IN
  if (!hasOut) return RECORD_STATUS.MISSING_PUNCH_OUT

  if (toMinutes(punchIn)  < 0) return RECORD_STATUS.INVALID_TIME
  if (toMinutes(punchOut) < 0) return RECORD_STATUS.INVALID_TIME

  return RECORD_STATUS.COMPLETE
}

/**
 * True if record_status and approval_status allow this record to count into payroll.
 */
export function isPayrollEligible(record) {
  return (
    record.record_status    === RECORD_STATUS.COMPLETE &&
    record.approval_status  === APPROVED_STATUS
  )
}

// ── OT calculation ────────────────────────────────────────────────────────────

/**
 * Compute OT hours = punch_out − scheduled_end.
 * Returns 0 if punch_out ≤ scheduled_end or inputs are missing/invalid.
 * Handles midnight crossover (e.g. scheduled_end 23:00, punch_out 01:00).
 *
 * @param {string} scheduledEnd  HH:mm — shift end time
 * @param {string} punchOut      HH:mm — actual clock-out time
 * @returns {number} hours, rounded to 2 dp
 */
export function computeOtHours(scheduledEnd, punchOut) {
  const n = toMinutes(scheduledEnd)
  let   a = toMinutes(punchOut)
  if (n < 0 || a < 0) return 0

  // Midnight crossover
  if (a < n) a += 24 * 60

  const diffMins = a - n
  if (diffMins <= 0) return 0
  return Math.round((diffMins / 60) * 100) / 100
}

/**
 * Compute OT amount = ot_hours × ot_rate.
 * @param {number} otHours
 * @param {number} [otRate]
 * @returns {number} RM amount, rounded to 2 dp
 */
export function computeOtAmount(otHours, otRate = DEFAULT_OT_RATE) {
  return Math.round(otHours * otRate * 100) / 100
}

// ── Record builder ────────────────────────────────────────────────────────────

/**
 * Build a complete, validated OT record from raw input.
 *
 * Auto-computes:
 *   record_status — based on punch_in / punch_out presence and validity
 *   ot_hours      — only when record_status = Complete
 *   ot_amount     — only when record_status = Complete
 *   remarks       — auto-filled for missing punch-out
 *
 * @param {object} fields
 * @param {string}  fields.date             YYYY-MM-DD
 * @param {string}  fields.staff_name
 * @param {string}  fields.shift            Morning | Afternoon | Night
 * @param {string}  fields.scheduled_start  HH:mm
 * @param {string}  fields.scheduled_end    HH:mm  — shift end (basis for OT calc)
 * @param {string}  fields.punch_in         HH:mm
 * @param {string}  fields.punch_out        HH:mm
 * @param {number}  [fields.ot_rate]
 * @param {string}  [fields.remarks]
 * @param {string}  [fields.approved_by]
 * @param {string}  [fields.approval_status]
 * @returns {object}
 */
export function buildOtRecord(fields) {
  const otRate       = Number(fields.ot_rate) > 0 ? Number(fields.ot_rate) : DEFAULT_OT_RATE
  const punchIn      = (fields.punch_in  ?? '').trim()
  const punchOut     = (fields.punch_out ?? '').trim()
  const scheduledEnd = (fields.scheduled_end ?? '').trim()

  const recordStatus = getRecordStatus(punchIn, punchOut)

  let otHours  = 0
  let otAmount = 0
  let remarks  = (fields.remarks ?? '').trim()

  if (recordStatus === RECORD_STATUS.COMPLETE) {
    otHours  = computeOtHours(scheduledEnd, punchOut)
    otAmount = computeOtAmount(otHours, otRate)
  } else if (recordStatus === RECORD_STATUS.MISSING_PUNCH_OUT) {
    if (!remarks) remarks = 'Missing punch out — supervisor review required'
  } else if (recordStatus === RECORD_STATUS.MISSING_PUNCH_IN) {
    if (!remarks) remarks = 'Missing punch in — record incomplete'
  } else if (recordStatus === RECORD_STATUS.INVALID_TIME) {
    if (!remarks) remarks = 'Invalid time value — please correct'
  }

  return {
    date:            fields.date            ?? '',
    staff_name:      fields.staff_name      ?? '',
    shift:           fields.shift           ?? '',
    scheduled_start: fields.scheduled_start ?? '',
    scheduled_end:   scheduledEnd,
    punch_in:        punchIn,
    punch_out:       punchOut,
    ot_hours:        otHours,
    ot_rate:         otRate,
    ot_amount:       otAmount,
    record_status:   recordStatus,
    approval_status: fields.approval_status ?? 'Pending',
    approved_by:     fields.approved_by     ?? '',
    remarks,
  }
}

// ── Monthly payroll summary ───────────────────────────────────────────────────

/**
 * Build a monthly payroll summary from OT records.
 *
 * A record counts ONLY when:
 *   record_status   = "Complete"
 *   approval_status = "Approved"
 *
 * @param {object[]} records
 * @param {string}   month   YYYY-MM
 * @returns {object[]} one row per staff, sorted by name
 */
export function buildMonthlyPayrollSummary(records, month) {
  const prefix  = (month ?? '').slice(0, 7)
  const eligible = records.filter(
    (r) =>
      isPayrollEligible(r) &&
      (r.date ?? '').startsWith(prefix),
  )

  const map = {}
  for (const r of eligible) {
    const name = (r.staff_name ?? '').trim() || 'Unknown'
    if (!map[name]) {
      map[name] = {
        month,
        staff_name:      name,
        total_ot_hours:  0,
        ot_rate:         Number(r.ot_rate) || DEFAULT_OT_RATE,
        total_ot_amount: 0,
        approved_by:     r.approved_by ?? '',
        remarks:         '',
      }
    }
    map[name].total_ot_hours += Number(r.ot_hours) || 0
    if (r.approved_by) map[name].approved_by = r.approved_by
  }

  return Object.values(map)
    .map((s) => ({
      ...s,
      total_ot_hours:  Math.round(s.total_ot_hours * 100) / 100,
      total_ot_amount: computeOtAmount(s.total_ot_hours, s.ot_rate),
    }))
    .sort((a, b) => a.staff_name.localeCompare(b.staff_name))
}

// ── Telegram formatters ───────────────────────────────────────────────────────

/**
 * Format the /ot_payroll reply for one staff member.
 */
export function formatPayrollTelegramReply(summary, month) {
  const monthLabel = formatMonthLabel(month)

  if (!summary) {
    return [
      '🧾 OT Payroll Summary',
      `Month: ${monthLabel}`,
      '',
      'No payroll-eligible OT records found.',
      '(Record must be Complete + Approved to count.)',
    ].join('\n')
  }

  const statusLabel = summary.approved_by
    ? `Approved (by ${summary.approved_by})`
    : 'For supervisor approval'

  return [
    '🧾 OT Payroll Summary',
    `Month: ${monthLabel}`,
    `Staff: ${summary.staff_name}`,
    '',
    `Approved OT Hours: ${summary.total_ot_hours}`,
    `OT Rate: RM${summary.ot_rate}/hour`,
    `Total OT Pay: RM${summary.total_ot_amount}`,
    '',
    `Status: ${statusLabel}`,
  ].join('\n')
}

/**
 * Format the /ot_check reply for a single OT record.
 * Matches the exact format specified in requirements.
 */
export function formatOtCheckReply(record) {
  if (!record) {
    return 'No OT record found for that staff / date.'
  }

  const statusLine = (() => {
    if (record.record_status !== RECORD_STATUS.COMPLETE) return record.record_status
    if (record.approval_status === APPROVED_STATUS) return `Approved (by ${record.approved_by})`
    return 'Pending Approval'
  })()

  return [
    'OT Record Check',
    `Staff: ${record.staff_name}`,
    `Date: ${record.date}`,
    `Punch In: ${record.punch_in  || '—'}`,
    `Punch Out: ${record.punch_out || '—'}`,
    `OT Hours: ${record.ot_hours}`,
    `Status: ${statusLine}`,
  ].join('\n')
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** "2026-05" → "May 2026" */
export function formatMonthLabel(ym) {
  try {
    return new Date(`${ym}-01T00:00:00`).toLocaleString('en-MY', {
      month:    'long',
      year:     'numeric',
      timeZone: 'Asia/Kuala_Lumpur',
    })
  } catch {
    return ym ?? ''
  }
}

/** Current month as YYYY-MM */
export function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Badge variant for a record_status string */
export function recordStatusVariant(status) {
  switch (status) {
    case RECORD_STATUS.COMPLETE:         return 'success'
    case RECORD_STATUS.MISSING_PUNCH_IN:
    case RECORD_STATUS.MISSING_PUNCH_OUT:
    case RECORD_STATUS.INVALID_TIME:     return 'danger'
    case RECORD_STATUS.PENDING_APPROVAL: return 'warning'
    default:                             return 'warning'
  }
}
