import {
  mergeSideTurningLoopRows,
  readSideTurningLoopRaw,
  ensureBaselineScores,
} from '../db/sideTurningLoopStorage.js'

export const POSITION_LABEL = {
  left: 'Left',
  right: 'Right',
  supine: 'Supine',
}

const DUE_WINDOW_MS = 30 * 60 * 1000
const GRACE_MS = 2 * 60 * 1000

export function effectiveNextDueMs(row, nowMs = Date.now()) {
  const base = new Date(row.nextDueAt).getTime()
  const snooze = row.snoozeUntil ? new Date(row.snoozeUntil).getTime() : null
  if (snooze != null && snooze > nowMs) return Math.max(base, snooze)
  return base
}

/**
 * @returns {'due_now'|'upcoming'|'overdue'|'completed'}
 */
export function turningBoardBucket(row, nowMs = Date.now()) {
  const next = effectiveNextDueMs(row, nowMs)
  const intervalMs = row.intervalMinutes * 60 * 1000
  const segmentStart = next - intervalMs
  const last = row.lastTurnedAt ? new Date(row.lastTurnedAt).getTime() : 0

  if (last >= segmentStart - 90 * 1000) return 'completed'

  if (nowMs > next + GRACE_MS) return 'overdue'

  if (nowMs >= next - DUE_WINDOW_MS && nowMs <= next + GRACE_MS) return 'due_now'

  return 'upcoming'
}

export function formatTurningTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function listSideTurningLoopRows(patients) {
  ensureBaselineScores()
  const now = Date.now()
  const merged = mergeSideTurningLoopRows(patients)
  return merged.map((row) => {
    const bucket = turningBoardBucket(row, now)
    const nextMs = effectiveNextDueMs(row, now)
    const overdueMin = now > nextMs ? Math.floor((now - nextMs) / 60000) : 0
    return {
      ...row,
      bucket,
      effectiveNextDueMs: nextMs,
      overdueMin,
    }
  })
}

export function buildTurningLoopAiAlerts(rows) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of rows) {
    const base = `${row.patientName} · Rm ${row.room} · Bed ${row.bedNumber}`

    if (row.bucket === 'overdue' && row.overdueMin >= 30) {
      add(
        `miss-${row.patientId}`,
        row.overdueMin >= 120 ? 'critical' : 'high',
        'Missed turning',
        `Turn overdue ${row.overdueMin} min`,
        base,
      )
    }

    if (row.bucket === 'overdue' && row.overdueStreak >= 2) {
      add(
        `repeat-${row.patientId}`,
        'high',
        'Repeated overdue',
        `Multiple slipped cycles`,
        `${base} · streak ${row.overdueStreak}`,
      )
    }

    if (row.pressureSoreRisk === 'High' && row.bucket !== 'completed') {
      add(
        `pressure-${row.patientId}`,
        'high',
        'High pressure sore risk',
        `Turning priority`,
        base,
      )
    }

    if (/erythema|redness|red\s/i.test(row.skinCondition || '')) {
      add(
        `red-${row.patientId}`,
        'medium',
        'Redness detected',
        `Skin surveillance`,
        `${base} · ${row.skinCondition}`,
      )
    }

    if (row.fallRisk === 'High' && row.bucket === 'overdue') {
      add(
        `immobile-${row.patientId}`,
        'high',
        'Immobility risk',
        `High fall risk + overdue repositioning`,
        base,
      )
    }
  }

  return alerts
}

export function scoreTotalsDisplay() {
  const raw = readSideTurningLoopRaw()
  ensureBaselineScores()
  const b = raw.baseline || { onTime: 0, late: 0, missed: 0, photoUploaded: 0, skinChecked: 0 }
  const s = raw.scores || {}
  return {
    onTime: b.onTime + (s.onTime ?? 0),
    late: b.late + (s.late ?? 0),
    missed: b.missed + (s.missed ?? 0),
    photoUploaded: b.photoUploaded + (s.photoUploaded ?? 0),
    skinChecked: b.skinChecked + (s.skinChecked ?? 0),
  }
}

export function turningLoopAiSummary(rows) {
  const urgentIds = new Set()
  rows.forEach((r) => {
    if (r.bucket === 'due_now' || r.bucket === 'overdue') urgentIds.add(r.patientId)
  })

  const highRiskBeds = rows.filter((r) => r.pressureSoreRisk === 'High' || r.fallRisk === 'High').length

  const scores = scoreTotalsDisplay()
  const denom = scores.onTime + scores.late + scores.missed
  const compliancePct = denom > 0 ? Math.round((100 * scores.onTime) / denom) : 94

  let prevention = `${scores.photoUploaded} simulated photo-documented turns · ${scores.skinChecked} skin checks logged. `
  if (compliancePct >= 90) prevention += 'Cadence compliance strong — keep q2h anchors on high-risk beds.'
  else if (compliancePct >= 75) prevention += 'Mixed on-time performance — focus rounding on overdue list.'
  else prevention += 'Elevated late/missed mix — consider staffing overlay on heavy units.'

  return {
    urgentPatientCount: urgentIds.size,
    highRiskBeds,
    compliancePct,
    preventionSummary: prevention,
  }
}

export function nextDueAfterTurn(intervalMinutes, fromMs = Date.now()) {
  return new Date(fromMs + intervalMinutes * 60 * 1000).toISOString()
}
