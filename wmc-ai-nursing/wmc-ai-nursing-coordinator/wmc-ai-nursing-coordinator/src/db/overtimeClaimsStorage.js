/**
 * Nurse overtime claims — local simulation (verify against payroll policy).
 */

const KEY = 'wmc_overtime_claims_v1'
const MAX_ROWS = 800

function safeRead() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}

function write(rows) {
  if (typeof window === 'undefined') return false
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_ROWS)))
    return true
  } catch {
    return false
  }
}

/** @param {string} shiftDate YYYY-MM-DD @param {string} otStart HH:mm @param {string} otEnd HH:mm */
export function computeOtHours(shiftDate, otStart, otEnd) {
  if (!shiftDate || !otStart || !otEnd) return 0
  const start = new Date(`${shiftDate}T${otStart}:00`)
  let end = new Date(`${shiftDate}T${otEnd}:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }
  const h = (end.getTime() - start.getTime()) / 3600000
  return Math.round(Math.max(0, h) * 100) / 100
}

export function generateClaimId() {
  return `otc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function readOvertimeClaims() {
  return safeRead()
}

export function saveOvertimeClaim(claim) {
  const all = safeRead()
  const idx = all.findIndex((r) => r.id === claim.id)
  if (idx >= 0) all[idx] = claim
  else all.unshift(claim)
  return write(all) ? claim : null
}

export function deleteOvertimeClaim(id) {
  write(safeRead().filter((r) => r.id !== id))
}

export function claimsInMonth(ym) {
  const prefix = ym.length >= 7 ? ym.slice(0, 7) : ym
  return safeRead().filter((c) => c.shiftDate && c.shiftDate.startsWith(prefix))
}

export function monthlyOtByNurse(ym) {
  const map = {}
  for (const c of claimsInMonth(ym)) {
    if (c.status === 'rejected') continue
    const n = c.nurseName || 'Unknown'
    map[n] = (map[n] || 0) + (Number(c.totalOtHours) || 0)
  }
  return Object.entries(map)
    .map(([nurseName, totalHours]) => ({ nurseName, totalHours: Math.round(totalHours * 100) / 100 }))
    .sort((a, b) => b.totalHours - a.totalHours)
}

export function buildOvertimeCsv() {
  const rows = safeRead()
  const headers = [
    'Nurse',
    'ShiftDate',
    'NormalHours',
    'OTStart',
    'OTEnd',
    'TotalOTHours',
    'Reason',
    'Status',
    'CreatedAt',
  ]
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.join(',')]
  for (const r of rows.sort((a, b) => (b.shiftDate + b.nurseName).localeCompare(a.shiftDate + a.nurseName))) {
    lines.push(
      [
        esc(r.nurseName),
        esc(r.shiftDate),
        esc(r.normalShiftHours),
        esc(r.otStartTime),
        esc(r.otEndTime),
        esc(r.totalOtHours),
        esc(r.otReason),
        esc(r.status),
        esc(r.createdAt),
      ].join(','),
    )
  }
  return lines.join('\r\n')
}
