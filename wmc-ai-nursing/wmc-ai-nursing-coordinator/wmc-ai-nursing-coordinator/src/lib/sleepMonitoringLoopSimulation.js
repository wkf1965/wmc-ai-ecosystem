import {
  mergeSleepMonitoringInstances,
  readSleepMonitoringLoopRaw,
  ensureSleepMonitoringBaseline,
} from '../db/sleepMonitoringLoopStorage.js'

/** @typedef {'poor_sleep'|'night_wandering'|'agitation'|'confusion_risk'|'stable_sleep'} SleepBoardBucket */

/**
 * Mutually exclusive board columns (simulation triage).
 * @returns {SleepBoardBucket}
 */
export function sleepMonitoringBucket(row) {
  if (row.wanderingBehavior) return 'night_wandering'
  if (row.agitationAtNight) return 'agitation'
  if (row.confusionAtNight) return 'confusion_risk'
  const h = Number(row.totalSleepHours) || 0
  const w = Number(row.nightWakingEpisodes) || 0
  if (h < 6 || w >= 3 || row.painComplaint) return 'poor_sleep'
  return 'stable_sleep'
}

/** AI / nurse-facing band aligned with scoring categories */
export function deriveSleepRiskBand(row) {
  const h = Number(row.totalSleepHours) || 0
  const w = Number(row.nightWakingEpisodes) || 0
  if (
    (row.behaviorEscalated && (row.confusionAtNight || row.wanderingBehavior)) ||
    h < 4 ||
    w >= 6
  ) {
    return { label: 'Urgent review', variant: 'danger', field: 'urgentReview' }
  }
  if (
    row.wanderingBehavior ||
    row.confusionAtNight ||
    row.agitationAtNight ||
    w >= 4 ||
    h < 5
  ) {
    return { label: 'High risk', variant: 'danger', field: 'highRisk' }
  }
  if (w >= 3 || h < 6 || row.painComplaint) {
    return { label: 'Disturbed', variant: 'warning', field: 'disturbed' }
  }
  if (w === 2 || (h >= 5.5 && h < 6.5)) {
    return { label: 'Monitor', variant: 'info', field: 'monitor' }
  }
  return { label: 'Good', variant: 'success', field: 'good' }
}

export function listSleepMonitoringRows(patients) {
  const merged = mergeSleepMonitoringInstances(patients)
  return merged.map((r) => ({
    ...r,
    bucket: sleepMonitoringBucket(r),
    riskBand: deriveSleepRiskBand(r),
  }))
}

export function formatObsTime(iso) {
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

export function buildSleepLoopAiAlerts(rows) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of rows) {
    const tag = `${row.patientName} · Rm ${row.roomNumber}`
    const h = Number(row.totalSleepHours) || 0
    const w = Number(row.nightWakingEpisodes) || 0

    if (h < 5 || w >= 4) {
      add(`dist-${row.patientId}`, 'medium', 'Sleep disturbance', `Short sleep (${h}h) / frequent wakings (${w})`, tag)
    }

    if (row.wanderingBehavior) {
      add(`wand-${row.patientId}`, 'high', 'Dementia wandering risk', 'Night wandering logged · egress precautions', tag)
    }

    if (row.confusionAtNight || (row.agitationAtNight && w >= 3)) {
      add(`del-${row.patientId}`, 'high', 'Delirium risk', 'Nocturnal confusion/agitation pattern · sensory cues', tag)
    }

    if (row.wanderingBehavior || (row.confusionAtNight && h < 6)) {
      add(`fall-${row.patientId}`, 'high', 'Fall risk at night', 'Mobility checks · lighting · bed alarms per protocol', tag)
    }

    if (row.painComplaint && h < 7) {
      add(`pain-${row.patientId}`, 'medium', 'Pain-related poor sleep', 'Pain narrative ties to fragmented sleep', tag)
    }

    const criticalCombo =
      row.behaviorEscalated &&
      (row.confusionAtNight || row.wanderingBehavior || row.agitationAtNight) &&
      (h < 5 || w >= 5)
    if (criticalCombo || (row.confusionAtNight && row.wanderingBehavior)) {
      add(`md-${row.patientId}`, 'high', 'Doctor review needed', 'Complex neurobehavioral picture overnight', tag)
    }
  }

  return alerts
}

export function sleepScoreTotalsDisplay() {
  const raw = readSleepMonitoringLoopRaw()
  ensureSleepMonitoringBaseline()
  const b = raw.baseline || { good: 0, monitor: 0, disturbed: 0, highRisk: 0, urgentReview: 0 }
  const s = raw.scores || {}
  return {
    good: b.good + (s.good ?? 0),
    monitor: b.monitor + (s.monitor ?? 0),
    disturbed: b.disturbed + (s.disturbed ?? 0),
    highRisk: b.highRisk + (s.highRisk ?? 0),
    urgentReview: b.urgentReview + (s.urgentReview ?? 0),
  }
}

export function sleepLoopAiSummary(rows) {
  const poor = rows.filter((r) => Number(r.totalSleepHours) < 6 || Number(r.nightWakingEpisodes) >= 3 || r.painComplaint)
  const wander = rows.filter((r) => r.wanderingBehavior)
  const nightFall = rows.filter((r) => r.wanderingBehavior || (r.confusionAtNight && Number(r.totalSleepHours) < 6))

  const mdCandidates = rows.filter(
    (r) =>
      r.behaviorEscalated &&
      (r.confusionAtNight || r.wanderingBehavior || r.agitationAtNight),
  )

  const nurseChecklist =
    poor.length || wander.length
      ? `Prioritize ${poor.length} fragmented sleeper(s); confirm fluid/toilet plan · redirect wandering · dim excess noise · repeat orientation cues · document vitals if protocol triggers.`
      : 'No urgent clustering — maintain q-shift rounding & sleep hygiene cues.'

  const doctorCounsellor =
    mdCandidates.length > 0
      ? `${mdCandidates.length} resident(s) merit physician review for delirium/risk meds; consider behavioural health consult if agitation persists (demo).`
      : 'No mandatory MD escalation on current snapshot — continue surveillance.'

  const familySuggestion =
    wander.length > 0
      ? `Family script: ${wander.length} loved one(s) showed night wandering; we increased supervision and safety checks and will update you after rounds.`
      : poor.length > 0
        ? `Family script: ${poor.length} resident(s) had restless sleep; care team adjusted checks and will share daytime tolerance.`
        : 'Family script: overnight period remained settled overall; happy to discuss routines anytime.'

  return {
    patientsWithPoorSleep:
      poor.length === 0
        ? 'No residents flagged for fragmented sleep on this board.'
        : `${poor.length}: ${poor
            .slice(0, 5)
            .map((r) => `${r.patientName} (${Number(r.totalSleepHours).toFixed(1)}h)`)
            .join('; ')}${poor.length > 5 ? '…' : ''}`,
    nightFallRisk:
      nightFall.length === 0
        ? 'Low simulated night-fall clustering.'
        : `${nightFall.length} elevated fall-risk overnight profile(s) — lighting, footwear, bed height checks.`,
    wanderingBehavior:
      wander.length === 0
        ? 'No active wandering flags.'
        : `${wander.length} wandering narrative(s): ${wander.map((r) => r.patientName).join(', ')}`,
    nurseActionChecklist: nurseChecklist,
    doctorCounsellorReview: doctorCounsellor,
    familyUpdateSuggestion: familySuggestion,
  }
}

export function escapeCsvCell(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildSleepReportCsv(rows) {
  const headers = [
    'Patient',
    'Room',
    'Sleep start',
    'Wake',
    'Total sleep hours',
    'Night wakings',
    'Wandering',
    'Agitation',
    'Confusion',
    'Pain',
    'Toilet visits',
    'Nurse',
    'Last observation',
    'Next due',
    'Board bucket',
    'Risk band',
    'Escalated',
  ]
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const r of rows) {
    const bucket = sleepMonitoringBucket(r)
    const band = deriveSleepRiskBand(r)
    lines.push(
      [
        r.patientName,
        r.roomNumber,
        r.sleepStartTime,
        r.wakeTime,
        r.totalSleepHours,
        r.nightWakingEpisodes,
        r.wanderingBehavior ? 'yes' : 'no',
        r.agitationAtNight ? 'yes' : 'no',
        r.confusionAtNight ? 'yes' : 'no',
        r.painComplaint ? 'yes' : 'no',
        r.toiletVisits,
        r.nurseAssigned,
        r.lastNightObservationTime,
        r.nextObservationDueTime,
        bucket,
        band.label,
        r.behaviorEscalated ? 'yes' : 'no',
      ]
        .map(escapeCsvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
