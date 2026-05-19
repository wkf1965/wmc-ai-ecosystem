import { CARE_LOOP_TYPES } from '../data/careLoopTypes.js'
import { loopInstanceKey, mergeInstances, ensureBaselineStats } from '../db/careLoopsStorage.js'

export function effectiveNextDueMs(row, nowMs = Date.now()) {
  const next = new Date(row.nextDueAt).getTime()
  const snooze = row.snoozeUntil ? new Date(row.snoozeUntil).getTime() : null
  if (snooze != null && snooze > nowMs) return Math.max(next, snooze)
  return next
}

/**
 * @returns {'due'|'overdue'|'completed'}
 */
export function computeLoopStatus(row, nowMs = Date.now()) {
  const nextDue = effectiveNextDueMs(row, nowMs)
  const intervalMs = row.intervalMinutes * 60 * 1000
  const segmentStart = nextDue - intervalMs
  const last = row.lastCompletedAt ? new Date(row.lastCompletedAt).getTime() : 0
  const GRACE = 45 * 1000
  if (last >= segmentStart - GRACE) return 'completed'
  if (nowMs > nextDue) return 'overdue'
  return 'due'
}

export function formatCareLoopTime(iso) {
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

export function nextDueAfterComplete(row, completedAtMs = Date.now()) {
  const intervalMs = row.intervalMinutes * 60 * 1000
  return new Date(completedAtMs + intervalMs).toISOString()
}

export function classifyCompletionScore(completedAtMs, dueAtMs) {
  const grace = 20 * 60 * 1000
  if (completedAtMs <= dueAtMs + grace) return 'on_time'
  return 'late'
}

export function enrichRows(patients, rows) {
  ensureBaselineStats()
  const now = Date.now()
  return rows.map((row) => {
    const status = computeLoopStatus(row, now)
    const nextMs = effectiveNextDueMs(row, now)
    return {
      ...row,
      key: loopInstanceKey(row.patientId, row.loopTypeId),
      status,
      nextDueMs: nextMs,
    }
  })
}

export function listCareLoopRows(patients) {
  const merged = mergeInstances(patients)
  return enrichRows(patients, merged)
}

export function buildCareLoopAiAlerts(enrichedRows, patientsById) {
  const alerts = []
  const now = Date.now()

  for (const row of enrichedRows) {
    const patient = patientsById[row.patientId] || {}
    const dueMs = row.nextDueMs ?? effectiveNextDueMs(row, now)
    const overdueMin = row.status === 'overdue' ? Math.floor((now - dueMs) / 60000) : 0

    if (row.status === 'overdue' && overdueMin >= 30) {
      alerts.push({
        id: `missed-${row.key}`,
        severity: overdueMin >= 90 ? 'critical' : 'high',
        category: 'Missed loop',
        title: `Missed ${row.loopTypeLabel}`,
        detail: `${row.patientName} (Rm ${row.room}) · ${overdueMin} min past due`,
      })
    }

    const streak = row.overdueStreak ?? Math.min(5, Math.ceil(overdueMin / Math.max(1, row.intervalMinutes)))
    if (row.status === 'overdue' && overdueMin >= row.intervalMinutes && streak >= 2) {
      alerts.push({
        id: `repeat-${row.key}`,
        severity: 'high',
        category: 'Repeated overdue',
        title: `Repeated overdue: ${row.loopTypeLabel}`,
        detail: `${row.patientName} · ~${streak} cycles behind`,
      })
    }

    const pressure = patient.pressureSoreRisk || row.pressureRisk || 'Low'
    if (
      (pressure === 'High' || pressure === 'Moderate') &&
      row.loopTypeId === 'side_turning' &&
      (row.status === 'overdue' || row.status === 'due')
    ) {
      alerts.push({
        id: `pressure-${row.key}`,
        severity: pressure === 'High' ? 'high' : 'medium',
        category: 'Pressure sore risk',
        title: 'Turning cadence risk',
        detail: `${row.patientName} (${pressure} pressure risk) · ${row.loopTypeLabel}`,
      })
    }

    const fall = patient.fallRisk || row.fallRisk || 'Low'
    if (
      (fall === 'High' || fall === 'Moderate') &&
      (row.loopTypeId === 'fall_risk' || row.loopTypeId === 'night_obs' || row.loopTypeId === 'toileting') &&
      (row.status === 'due' || row.status === 'overdue')
    ) {
      alerts.push({
        id: `fall-${row.key}`,
        severity: fall === 'High' ? 'high' : 'medium',
        category: 'Fall risk',
        title: 'Mobility / surveillance gap',
        detail: `${row.patientName} (${fall} fall risk) · ${row.loopTypeLabel}`,
      })
    }
  }

  const seen = new Set()
  return alerts.filter((a) => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })
}

export function getDashboardCareLoopsSummary(patients) {
  if (!patients?.length) {
    return { dueNow: 0, overdue: 0, preview: [] }
  }
  const rows = listCareLoopRows(patients)
  const dueNow = rows.filter((r) => r.status === 'due' || r.status === 'overdue')
  const overdue = rows.filter((r) => r.status === 'overdue')
  const preview = dueNow.slice(0, 5).map((r) => ({
    key: r.key,
    patientName: r.patientName,
    room: r.room,
    loopTypeLabel: r.loopTypeLabel,
    status: r.status,
    nurseInCharge: r.nurseInCharge,
  }))
  return {
    dueNow: dueNow.length,
    overdue: overdue.length,
    preview,
  }
}

export { CARE_LOOP_TYPES }
