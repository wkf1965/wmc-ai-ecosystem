/**
 * Attendance & OT Calculation Engine
 *
 * Two-track workflow:
 *   Normal duty:  /punchin → /punchout          (no OT calculated)
 *   OT:           /ot_in   → /ot_out            (OT = ot_out - ot_in)
 *
 * Rules:
 *   - OT is NOT calculated from normal shift end time.
 *   - OT requires /ot_in + /ot_out — both must exist.
 *   - ot_hours = ot_out − ot_in  (handles midnight crossover).
 *   - ot_amount = ot_hours × ot_rate  (default RM 10).
 *
 * No performance score, no side-turning allowance, no bonus/deduction.
 */

export const DEFAULT_OT_RATE = 10   // RM per hour

// ── Record status enum ────────────────────────────────────────────────────────

export const RECORD_STATUS = {
  ON_DUTY:           'On Duty',             // punched in, not out yet
  NORMAL_DUTY:       'Normal Duty',         // punched in + out, no OT
  ON_OT:             'On OT',              // in OT, not finished
  OT_COMPLETE:       'OT Complete',         // normal + OT both done
  MISSING_PUNCH_OUT: 'Missing Punch Out',   // punched in, day ended without punch_out
  MISSING_OT_OUT:    'Missing OT Out',      // started OT but never ended
}

export const APPROVAL_STATUS = {
  PENDING:  'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

// ── Time helpers ──────────────────────────────────────────────────────────────

/** Parse "HH:mm" → minutes from midnight. Returns -1 for invalid. */
function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return -1
  const [h, m] = hhmm.trim().split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1
  return h * 60 + m
}

/** Current time as "HH:mm" */
export function nowHhmm() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Today's date as YYYY-MM-DD in local time */
export function todayString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Current month as YYYY-MM */
export function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "HH:mm" → "8:05 AM" / "5:30 PM" */
export function formatTime12h(hhmm) {
  if (!hhmm) return '—'
  const [h, m] = hhmm.trim().split(':').map(Number)
  if (!Number.isFinite(h)) return hhmm
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/** "2026-05" → "May 2026" */
export function formatMonthLabel(ym) {
  try {
    return new Date(`${ym}-01T00:00:00`).toLocaleString('en-MY', {
      month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur',
    })
  } catch { return ym ?? '' }
}

// ── Calculation ───────────────────────────────────────────────────────────────

/**
 * OT hours = ot_out − ot_in.  Handles midnight crossover.
 * Returns 0 if either time is missing or ot_out ≤ ot_in after crossover.
 */
export function computeOtHours(otIn, otOut) {
  let a = toMinutes(otIn)
  let b = toMinutes(otOut)
  if (a < 0 || b < 0) return 0
  if (b < a) b += 24 * 60    // midnight crossover
  const diff = b - a
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0
}

/** OT amount = ot_hours × ot_rate */
export function computeOtAmount(otHours, otRate = DEFAULT_OT_RATE) {
  return Math.round(otHours * otRate * 100) / 100
}

/** Worked hours = normal_punch_out − normal_punch_in */
export function computeWorkedHours(punchIn, punchOut) {
  let a = toMinutes(punchIn)
  let b = toMinutes(punchOut)
  if (a < 0 || b < 0) return 0
  if (b < a) b += 24 * 60
  const diff = b - a
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0
}

// ── Record builder ────────────────────────────────────────────────────────────

/**
 * Build a fully-computed attendance record from raw fields.
 *
 * Auto-computes: ot_hours, ot_amount, record_status.
 * OT is ONLY calculated when both ot_in and ot_out are present.
 *
 * @param {object} f
 * @param {string}  f.date
 * @param {string}  f.staff_name
 * @param {string}  [f.telegram_username]
 * @param {string}  [f.normal_punch_in]
 * @param {string}  [f.normal_punch_out]
 * @param {string}  [f.ot_in]
 * @param {string}  [f.ot_out]
 * @param {number}  [f.ot_rate]
 * @param {string}  [f.approval_status]
 * @param {string}  [f.approved_by]
 * @param {string}  [f.remarks]
 * @returns {object}
 */
export function buildAttendanceRecord(f) {
  const punchIn  = (f.normal_punch_in  ?? '').trim()
  const punchOut = (f.normal_punch_out ?? '').trim()
  const otIn     = (f.ot_in  ?? '').trim()
  const otOut    = (f.ot_out ?? '').trim()
  const ot_rate  = Number(f.ot_rate) > 0 ? Number(f.ot_rate) : DEFAULT_OT_RATE

  const hasOt    = Boolean(otIn && otOut)
  const ot_hours = hasOt ? computeOtHours(otIn, otOut)      : 0
  const ot_amount= hasOt ? computeOtAmount(ot_hours, ot_rate) : 0

  let record_status = RECORD_STATUS.ON_DUTY
  let remarks = (f.remarks ?? '').trim()

  if (punchIn && punchOut && otIn && otOut) {
    record_status = RECORD_STATUS.OT_COMPLETE
  } else if (punchIn && punchOut && otIn) {
    record_status = RECORD_STATUS.ON_OT
  } else if (punchIn && punchOut) {
    record_status = RECORD_STATUS.NORMAL_DUTY
  } else if (punchIn) {
    record_status = RECORD_STATUS.ON_DUTY
    if (!remarks) remarks = 'Punch out pending'
  } else {
    record_status = RECORD_STATUS.MISSING_PUNCH_OUT
    if (!remarks) remarks = 'No punch in recorded'
  }

  return {
    date:               f.date              ?? '',
    staff_name:         f.staff_name        ?? '',
    telegram_username:  f.telegram_username ?? '',
    normal_punch_in:    punchIn,
    normal_punch_out:   punchOut,
    ot_in:              otIn,
    ot_out:             otOut,
    ot_hours,
    ot_rate,
    ot_amount,
    record_status,
    approval_status:    f.approval_status   ?? APPROVAL_STATUS.PENDING,
    approved_by:        f.approved_by       ?? '',
    remarks,
  }
}

// ── Monthly OT summary ────────────────────────────────────────────────────────

/**
 * Aggregate OT Complete + Approved records for the month.
 * Returns one row per staff, sorted by total_ot_hours descending.
 *
 * @param {object[]} records
 * @param {string}   month   YYYY-MM
 */
export function buildMonthlyOtSummary(records, month) {
  const prefix   = (month ?? '').slice(0, 7)
  const eligible = records.filter(
    (r) =>
      r.record_status   === RECORD_STATUS.OT_COMPLETE &&
      r.approval_status === APPROVAL_STATUS.APPROVED  &&
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
        approval_status: APPROVAL_STATUS.APPROVED,
        remarks:         '',
      }
    }
    map[name].total_ot_hours += Number(r.ot_hours) || 0
  }

  return Object.values(map)
    .map((s) => ({
      ...s,
      total_ot_hours:  Math.round(s.total_ot_hours * 100) / 100,
      total_ot_amount: computeOtAmount(s.total_ot_hours, s.ot_rate),
    }))
    .sort((a, b) => b.total_ot_hours - a.total_ot_hours)
}

// ── Telegram formatters ───────────────────────────────────────────────────────

/** Reply after /punchin */
export function fmtPunchIn(staffName, hhmm) {
  return [
    '🟢 *Punch In Recorded*',
    '',
    `Staff: ${staffName}`,
    `Time: ${formatTime12h(hhmm)}`,
    '',
    'Use /punchout when your normal shift ends.',
  ].join('\n')
}

/** Reply after /punchout */
export function fmtPunchOut(staffName, punchIn, punchOut) {
  const worked = computeWorkedHours(punchIn, punchOut)
  return [
    '🔴 *Punch Out Recorded*',
    '',
    `Staff: ${staffName}`,
    `Time: ${formatTime12h(punchOut)}`,
    `Worked: ${worked}h`,
    '',
    'Normal duty completed.',
    'If continuing overtime, please send /ot_in',
  ].join('\n')
}

/** Reply after /ot_in */
export function fmtOtIn(staffName, otIn) {
  return [
    '🟡 *OT Started*',
    '',
    `Staff: ${staffName}`,
    `OT Start: ${formatTime12h(otIn)}`,
    '',
    'Use /ot_out when overtime ends.',
  ].join('\n')
}

/** Reply after /ot_out */
export function fmtOtOut(staffName, otIn, otOut, ot_hours, ot_amount) {
  return [
    '🧾 *OT Completed*',
    '',
    `Staff: ${staffName}`,
    `OT Start: ${formatTime12h(otIn)}`,
    `OT End: ${formatTime12h(otOut)}`,
    `OT Hours: ${ot_hours}`,
    '',
    `Estimated OT Pay: RM${ot_amount}`,
    '',
    'Status:',
    'Pending Supervisor Approval',
  ].join('\n')
}

/** /attendance one-line row for a record or active state */
export function fmtAttendanceRow(r) {
  const icon =
    r.record_status === RECORD_STATUS.OT_COMPLETE       ? '✅' :
    r.record_status === RECORD_STATUS.ON_OT              ? '🟡' :
    r.record_status === RECORD_STATUS.NORMAL_DUTY        ? '✅' :
    r.record_status === RECORD_STATUS.ON_DUTY            ? '🟢' :
    '🔴'

  let info = ''
  if (r.record_status === RECORD_STATUS.ON_DUTY) {
    info = `IN: ${formatTime12h(r.normal_punch_in)}`
  } else if (r.record_status === RECORD_STATUS.NORMAL_DUTY) {
    info = `IN: ${formatTime12h(r.normal_punch_in)} → OUT: ${formatTime12h(r.normal_punch_out)}`
  } else if (r.record_status === RECORD_STATUS.ON_OT) {
    info = `OT from ${formatTime12h(r.ot_in)}`
  } else if (r.record_status === RECORD_STATUS.OT_COMPLETE) {
    info = `IN: ${formatTime12h(r.normal_punch_in)} | OT: ${r.ot_hours}h`
  } else {
    info = r.record_status
  }

  return `${icon} ${(r.staff_name ?? '').padEnd(18)} ${info}`
}

/** /ot_report monthly reply */
export function fmtOtReport(rows, month) {
  if (!rows || rows.length === 0) {
    return `📊 OT Report — ${formatMonthLabel(month)}\n\nNo approved OT records found.`
  }
  const lines = [
    `📊 OT Report — ${formatMonthLabel(month)}`,
    '─────────────────────────────',
  ]
  rows.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.staff_name.padEnd(16)} ${String(r.total_ot_hours).padStart(5)}h  RM${r.total_ot_amount}`)
  })
  const totalH = rows.reduce((s, r) => s + r.total_ot_hours,  0)
  const totalR = rows.reduce((s, r) => s + r.total_ot_amount, 0)
  lines.push('─────────────────────────────')
  lines.push(`Total: ${Math.round(totalH * 100) / 100}h  RM${Math.round(totalR * 100) / 100}`)
  return lines.join('\n')
}
