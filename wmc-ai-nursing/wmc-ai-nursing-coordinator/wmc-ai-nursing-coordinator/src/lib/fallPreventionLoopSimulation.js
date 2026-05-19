import {
  mergeFallPreventionInstances,
  readFallPreventionLoopRaw,
  ensureFallPreventionBaseline,
} from '../db/fallPreventionLoopStorage.js'

/** @typedef {'high_fall_risk'|'check_due_now'|'overdue_checks'|'night_monitoring'|'stable_patients'} FallBoardBucket */

const OVERDUE_MS = 25 * 60 * 1000
const DUE_SOON_AHEAD_MS = 70 * 60 * 1000

export function fallRiskDisplay(tier) {
  const t = String(tier || '').toLowerCase()
  if (t === 'very_high') return 'Very high'
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'
}

export function isHighFallRiskTier(row) {
  return (
    row.fallRiskLevel === 'high' ||
    row.fallRiskLevel === 'very_high' ||
    row.escalatedFallRisk ||
    (row.fallRiskLevel === 'moderate' &&
      row.previousFallHistory &&
      (!row.callBellWithinReach || !row.nonSlipSocks || !row.environmentMarkedSafe))
  )
}

/**
 * @returns {FallBoardBucket}
 */
export function fallPreventionBucket(row, nowMs = Date.now()) {
  const due = new Date(row.nextFallCheckDueTime).getTime()
  if (!Number.isFinite(due)) return 'stable_patients'

  if (due < nowMs - OVERDUE_MS) return 'overdue_checks'

  if (due <= nowMs + DUE_SOON_AHEAD_MS && due >= nowMs - OVERDUE_MS) return 'check_due_now'

  if (isHighFallRiskTier(row)) return 'high_fall_risk'

  if (row.nightWanderingRisk && row.fallRiskLevel !== 'low') return 'night_monitoring'

  return 'stable_patients'
}

export function listFallPreventionRows(patients, nowMs = Date.now()) {
  const merged = mergeFallPreventionInstances(patients)
  return merged.map((r) => ({
    ...r,
    bucket: fallPreventionBucket(r, nowMs),
  }))
}

export function formatFallTime(iso) {
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

/** Band aligned with scoring categories */
export function deriveFallPreventionBand(row) {
  if (row.escalatedFallRisk || row.fallRiskLevel === 'very_high') {
    return { label: 'Urgent supervision', variant: 'danger', field: 'urgentSupervision' }
  }
  if (row.fallRiskLevel === 'high' || (row.previousFallHistory && row.fallRiskLevel === 'moderate')) {
    return { label: 'High risk', variant: 'danger', field: 'highRisk' }
  }
  if (row.fallRiskLevel === 'moderate' || row.nightWanderingRisk || !row.environmentMarkedSafe) {
    return { label: 'Moderate risk', variant: 'warning', field: 'moderateRisk' }
  }
  if (!row.callBellWithinReach || !row.nonSlipSocks) {
    return { label: 'Monitor', variant: 'info', field: 'monitor' }
  }
  return { label: 'Safe', variant: 'success', field: 'safe' }
}

export function buildFallPreventionAiAlerts(rows, nowMs = Date.now()) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of rows) {
    const tag = `${row.patientName} · Rm ${row.roomNumber}`
    const due = new Date(row.nextFallCheckDueTime).getTime()

    if (row.fallRiskLevel === 'high' || row.fallRiskLevel === 'very_high') {
      add(`hi-${row.patientId}`, 'high', 'High fall risk', `${fallRiskDisplay(row.fallRiskLevel)} tier on board`, tag)
    }

    if (row.repeatedWanderingFlag || (row.nightWanderingRisk && row.previousFallHistory)) {
      add(`wand-${row.patientId}`, 'medium', 'Repeated wandering', 'Night egress pattern · redirect & supervise', tag)
    }

    if (/assist|wheelchair|limited|weight-bearing/i.test(String(row.mobilityStatus))) {
      add(`mob-${row.patientId}`, 'medium', 'Weak mobility', 'Equipment check · slow pivot cues', tag)
    }

    if (row.confusionWalkingAttempt) {
      add(`conf-${row.patientId}`, 'high', 'Confusion + walking attempt', 'Orient · minimize unattended transfers', tag)
    }

    if (
      (!row.callBellWithinReach || !row.nonSlipSocks || !row.environmentMarkedSafe) &&
      row.fallRiskLevel !== 'low'
    ) {
      add(`miss-${row.patientId}`, 'high', 'Missing safety checks', 'Call bell / footwear / room sweep', tag)
    }

    const mdNeed =
      row.escalatedFallRisk &&
      (row.fallRiskLevel === 'high' || row.fallRiskLevel === 'very_high' || row.confusionWalkingAttempt)
    if (mdNeed) {
      add(`md-${row.patientId}`, 'high', 'Doctor review needed', 'Escalated multifactorial risk (sim)', tag)
    }

    if (Number.isFinite(due) && due < nowMs - OVERDUE_MS) {
      add(`due-${row.patientId}`, 'high', 'Fall check overdue', 'Past scheduled rounding vs policy clock (sim)', tag)
    }
  }

  return alerts
}

export function fallPreventionScoreTotalsDisplay() {
  const raw = readFallPreventionLoopRaw()
  ensureFallPreventionBaseline()
  const b = raw.baseline || { safe: 0, monitor: 0, moderateRisk: 0, highRisk: 0, urgentSupervision: 0 }
  const s = raw.scores || {}
  return {
    safe: b.safe + (s.safe ?? 0),
    monitor: b.monitor + (s.monitor ?? 0),
    moderateRisk: b.moderateRisk + (s.moderateRisk ?? 0),
    highRisk: b.highRisk + (s.highRisk ?? 0),
    urgentSupervision: b.urgentSupervision + (s.urgentSupervision ?? 0),
  }
}

export function fallPreventionAiSummary(rows, nowMs = Date.now()) {
  const closeSupervision = rows.filter((r) => isHighFallRiskTier(r) || r.escalatedFallRisk || r.confusionWalkingAttempt)

  const nightFall = rows.filter(
    (r) =>
      r.nightWanderingRisk &&
      (r.fallRiskLevel === 'moderate' || r.fallRiskLevel === 'high' || r.fallRiskLevel === 'very_high'),
  )

  const overdue = rows.filter((r) => {
    const due = new Date(r.nextFallCheckDueTime).getTime()
    return Number.isFinite(due) && due < nowMs - OVERDUE_MS
  })

  const envChecklist =
    'Lighting path · clutter cleared · bed height locked · brakes on equipment · fluids reachable · footwear appropriate · toileting schedule aligned · glasses/hearing aids as ordered.'

  const nurseChecklist =
    overdue.length > 0
      ? `${overdue.length} overdue fall round(s) — complete checks now, document mobility aids & bell reach.`
      : `${closeSupervision.length} resident(s) need heightened supervision — offer ROM-safe pivots, verify alarms per protocol.`

  const familySuggestion =
    closeSupervision.length > 0
      ? `We have increased rounding on ${closeSupervision.length} loved one(s) due to mobility/history factors and will share changes after shift leadership review.`
      : 'Overnight fall precautions remained routine; happy to discuss room setup anytime.'

  return {
    patientsNeedingCloseSupervision:
      closeSupervision.length === 0
        ? 'No urgent supervision clustering on this snapshot.'
        : `${closeSupervision.length}: ${closeSupervision
            .slice(0, 6)
            .map((r) => `${r.patientName} (${fallRiskDisplay(r.fallRiskLevel)})`)
            .join('; ')}${closeSupervision.length > 6 ? '…' : ''}`,
    nightFallRiskList:
      nightFall.length === 0
        ? 'No simulated night wandering + elevated tier pairing.'
        : `${nightFall.length}: ${nightFall.map((r) => r.patientName).join(', ')}`,
    environmentalSafetyChecklist: envChecklist,
    nurseActionChecklist: nurseChecklist,
    familyUpdateSuggestion: familySuggestion,
  }
}

export function escapeCsvCell(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildFallPreventionReportCsv(rows, nowMs = Date.now()) {
  const headers = [
    'Patient',
    'Room',
    'Fall risk level',
    'Mobility',
    'Walking aid',
    'Bed rails',
    'Call bell reach',
    'Non-slip socks',
    'Night wandering risk',
    'Prior falls',
    'Last fall check',
    'Next due',
    'Nurse',
    'Env safe',
    'Escalated',
    'Board bucket',
    'Risk band',
  ]
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const r of rows) {
    const bucket = fallPreventionBucket(r, nowMs)
    const band = deriveFallPreventionBand(r)
    lines.push(
      [
        r.patientName,
        r.roomNumber,
        r.fallRiskLevel,
        r.mobilityStatus,
        r.walkingAid,
        r.bedRailStatus,
        r.callBellWithinReach ? 'yes' : 'no',
        r.nonSlipSocks ? 'yes' : 'no',
        r.nightWanderingRisk ? 'yes' : 'no',
        r.previousFallHistory ? 'yes' : 'no',
        r.lastFallCheckTime,
        r.nextFallCheckDueTime,
        r.nurseAssigned,
        r.environmentMarkedSafe ? 'yes' : 'no',
        r.escalatedFallRisk ? 'yes' : 'no',
        bucket,
        band.label,
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
