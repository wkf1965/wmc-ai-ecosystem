import {
  mergeRehabilitationLoopRows,
  readRehabilitationLoopRaw,
  ensureRehabilitationBaseline,
} from '../db/rehabLoopStorage.js'

const DUE_BEFORE_MS = 28 * 60 * 1000
const DUE_AFTER_MS = 90 * 60 * 1000
const COMPLETE_RECENCY_MS = 5 * 60 * 60 * 1000

export function rehabTypeDisplayLabel(type) {
  if (type === 'physiotherapy') return 'Physiotherapy'
  if (type === 'occupational_therapy') return 'Occupational therapy'
  if (type === 'speech_therapy') return 'Speech therapy'
  return String(type)
}

export function formatRehabTime(iso) {
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

export function nextRehabSessionIso(fromMs = Date.now()) {
  const d = new Date(fromMs)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const slots = [9, 13.5, 16].map((hr) => {
    const h = Math.floor(hr)
    const m = Math.round((hr - h) * 60)
    return dayStart + (h * 60 + m) * 60 * 1000
  })
  for (const t of slots) {
    if (t > fromMs + 8 * 60000) return new Date(t).toISOString()
  }
  return new Date(dayStart + 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString()
}

/**
 * @returns {'session_due_now'|'completed_sessions'|'missed_rehab'|'declining_progress'|'high_recovery_potential'}
 */
export function rehabilitationBoardBucket(row, nowMs = Date.now()) {
  const due = new Date(row.nextSessionDueAt).getTime()
  const inDueWindow = nowMs >= due - DUE_BEFORE_MS && nowMs <= due + DUE_AFTER_MS
  const lastMs = row.lastSessionAt ? new Date(row.lastSessionAt).getTime() : 0
  const recentComplete =
    Boolean(row.lastSessionCompleted) && nowMs - lastMs < COMPLETE_RECENCY_MS && lastMs <= nowMs

  if (recentComplete) return 'completed_sessions'

  const overdueMiss = nowMs > due + DUE_AFTER_MS && !recentComplete
  if (row.missedSessionsWeek >= 2 || overdueMiss) return 'missed_rehab'

  if (row.progressTrend === 'declining' || row.rehabPlateau) return 'declining_progress'

  if (row.recoveryPotential === 'high' && row.progressTrend === 'improving') return 'high_recovery_potential'

  if (inDueWindow || nowMs < due + DUE_AFTER_MS) return 'session_due_now'

  if (row.recoveryPotential === 'high') return 'high_recovery_potential'

  return 'session_due_now'
}

export function listRehabilitationLoopRows(patients, nowMs = Date.now()) {
  const merged = mergeRehabilitationLoopRows(patients, nowMs)
  return merged.map((row) => ({
    ...row,
    bucket: rehabilitationBoardBucket(row, nowMs),
  }))
}

function hashPid(id) {
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function buildAggregateWeeklyProgress(rows) {
  const labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']
  if (!rows.length) {
    return labels.map((week) => ({ week, functional: 0, minutes: 0 }))
  }
  return labels.map((week, i) => ({
    week,
    functional: Math.round(
      rows.reduce((sum, r) => sum + (r.functionalSeries[i] ?? 0), 0) / rows.length,
    ),
    minutes: Math.round(
      rows.reduce((sum, r) => sum + (r.therapyMinutesLastSession ?? 0), 0) / rows.length,
    ),
  }))
}

/** Simulated aggregate therapy minutes by week (roster average). */
export function buildWeeklyTherapyMinutesSeries(rows) {
  const labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']
  if (!rows.length) return labels.map((week) => ({ week, minutes: 0 }))
  return labels.map((week, wi) => ({
    week,
    minutes: Math.round(
      rows.reduce((sum, r) => {
        const base = r.therapyMinutesLastSession ?? 30
        const swing = Math.sin((wi + (hashPid(r.patientId) % 5)) * 0.45) * 8
        const trend =
          r.progressTrend === 'improving' ? wi * 1.2 : r.progressTrend === 'declining' ? -wi * 0.9 : wi * 0.25
        return sum + Math.max(12, base + swing + trend)
      }, 0) / rows.length,
    ),
  }))
}

/** Simulated walking distance trend (meters, roster average). */
export function buildWalkingDistanceWeeklyTrend(rows) {
  const labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']
  if (!rows.length) return labels.map((week) => ({ week, meters: 0 }))
  return labels.map((week, wi) => ({
    week,
    meters: Math.round(
      rows.reduce((sum, r) => {
        const current = r.walkingDistanceM ?? 0
        const weeksBack = 7 - wi
        const step =
          r.progressTrend === 'improving' ? 3.2 : r.progressTrend === 'declining' ? -2.8 : 0.85
        const noise = (hashPid(r.patientId) >> wi) % 5
        const v = current - weeksBack * step + noise
        return sum + Math.max(0, v)
      }, 0) / rows.length,
    ),
  }))
}

/** Simulated ADL independence index trend (0–100, roster average). */
export function buildAdlIndependenceWeeklyTrend(rows) {
  const labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']
  if (!rows.length) return labels.map((week) => ({ week, adl: 0 }))
  return labels.map((week, wi) => ({
    week,
    adl: Math.round(
      rows.reduce((sum, r) => {
        const current = r.adlIndependence ?? 50
        const weeksBack = 7 - wi
        const step =
          r.progressTrend === 'improving' ? 2.1 : r.progressTrend === 'declining' ? -1.85 : 0.35
        const v = current - weeksBack * step
        return sum + Math.max(12, Math.min(100, v))
      }, 0) / rows.length,
    ),
  }))
}

/** Historical weekly functional average plus AI-style linear projection. */
export function buildRecoveryPredictionSeries(rows) {
  const weekly = buildAggregateWeeklyProgress(rows)
  const ys = weekly.map((w) => w.functional)
  const n = ys.length
  let slope = 0
  let intercept = ys[0] ?? 50
  if (n >= 2) {
    const xs = [...Array(n).keys()]
    const sumX = xs.reduce((a, b) => a + b, 0)
    const sumY = ys.reduce((a, b) => a + b, 0)
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
    const sumXX = xs.reduce((s, x) => s + x * x, 0)
    const den = n * sumXX - sumX * sumX
    if (Math.abs(den) > 1e-6) {
      slope = (n * sumXY - sumX * sumY) / den
      intercept = (sumY - slope * sumX) / n
    }
  }

  const hist = weekly.map((row) => ({
    label: row.week,
    functional: row.functional,
    predicted: null,
  }))
  const pred = [1, 2, 3, 4].map((k) => {
    const x = n + k - 1
    const val = Math.round(Math.max(15, Math.min(100, slope * x + intercept)))
    return { label: `AI +${k}wk`, functional: null, predicted: val }
  })
  return [...hist, ...pred]
}

function noteTextBlob(n) {
  return [
    n.abnormalEvents,
    n.nurseRemarks,
    n.mood,
    n.appetite,
    n.skinCondition,
  ]
    .filter(Boolean)
    .join(' ')
}

function cognitiveDeclineSignal(notes, patientId, mentalStatusSnap) {
  const ms = String(mentalStatusSnap || '')
  if (/oriented\s*[×x]\s*2|confusion|forgetful|disorient|impaired cognition/i.test(ms)) return true
  return notes.some((n) => {
    if (n.patientId !== patientId) return false
    const blob = noteTextBlob(n)
    return /\b(confusion|memory\s*loss|disorient|sundown|letharg|cognition)\b/i.test(blob)
  })
}

export function buildRehabilitationLoopAiAlerts(rows, nursingNotes = []) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of rows) {
    const tag = `${row.patientName} · Rm ${row.room}`

    if (row.progressTrend === 'declining') {
      add(
        `mob-${row.patientId}`,
        'high',
        'Declining mobility',
        `Functional trend down · ${rehabTypeDisplayLabel(row.rehabType)}`,
        `${tag} — reassess dosage and tolerance before progressing load.`,
      )
    }

    if (/high/i.test(row.fallRiskSnap || '') && row.balanceScore <= 5) {
      add(`fall-${row.patientId}`, 'high', 'Fall risk increase', `Fall risk increase · balance ${row.balanceScore}/10 with high-risk flag`, tag)
    }

    if (row.painScore >= 7) {
      add(`pain-${row.patientId}`, 'medium', 'Pain worsening', `Pain worsening (${row.painScore}/10) — review tolerance before progressing therapy`, tag)
    }

    if (row.rehabPlateau && row.progressTrend !== 'declining') {
      add(`plat-${row.patientId}`, 'medium', 'Rehab plateau', `Rehab plateau — consider goal revision or IDT review (sim)`, tag)
    }

    if (row.bucket === 'missed_rehab') {
      add(
        `miss-${row.patientId}`,
        'high',
        'Missed rehab session',
        `Missed rehab session pattern (${row.missedSessionsWeek} in window) · reschedule + barrier assessment`,
        tag,
      )
    }

    if (cognitiveDeclineSignal(nursingNotes, row.patientId, row.mentalStatusSnap)) {
      add(`cog-${row.patientId}`, 'medium', 'Cognitive decline', `Cognitive decline signal — coordinate OT / ST and nursing cues`, tag)
    }

    if (row.escalatedDoctorReview || (row.painScore >= 8 && row.progressTrend === 'declining')) {
      add(`doc-${row.patientId}`, 'critical', 'Doctor review needed', `Doctor review needed — escalated or high-risk rehab flags`, tag)
    }
  }

  return alerts
}

export function rehabilitationScoreTotalsDisplay() {
  const raw = readRehabilitationLoopRaw()
  ensureRehabilitationBaseline()
  const b = raw.baseline || {
    improving: 0,
    stable: 0,
    declining: 0,
    highRecoveryPotential: 0,
    doctorReviewNeeded: 0,
  }
  const s = raw.scores || {}
  return {
    improving: b.improving + (s.improving ?? 0),
    stable: b.stable + (s.stable ?? 0),
    declining: b.declining + (s.declining ?? 0),
    highRecoveryPotential: b.highRecoveryPotential + (s.highRecoveryPotential ?? 0),
    doctorReviewNeeded: (b.doctorReviewNeeded ?? 0) + (s.doctorReviewNeeded ?? 0),
  }
}

export function rehabilitationLoopAiSummary(rows) {
  const improvingN = rows.filter((r) => r.progressTrend === 'improving').length
  const decliningN = rows.filter((r) => r.progressTrend === 'declining').length
  const plateauN = rows.filter((r) => r.rehabPlateau).length

  const dominant = ['physiotherapy', 'occupational_therapy', 'speech_therapy'].map((t) => ({
    t,
    n: rows.filter((r) => r.rehabType === t).length,
  }))
  dominant.sort((a, b) => b.n - a.n)
  const top = dominant[0]?.t || 'physiotherapy'
  const focus =
    top === 'speech_therapy'
      ? 'Prioritize communication journals, swallow-safe strategies, and joint SLP–nursing cues.'
      : top === 'occupational_therapy'
        ? 'Emphasize ADL re-training, energy conservation, and home simulation tasks.'
        : 'Prioritize gait endurance, transfer drills, and strength dosing within pain limits.'

  const functionalImprovement = `Roster snapshot: ${improvingN} improving / ${decliningN} declining trends · ${plateauN} on plateau watch (simulation).`

  const familyEncouragement =
    improvingN >= decliningN
      ? 'Celebrate small wins (distance, pain control, speech clarity). Reinforce home exercise consistency without over-promising timelines.'
      : 'Acknowledge fatigue and discomfort; highlight supervised safety milestones and therapist partnership — avoid comparing to other residents.'

  const therapistChecklist = [
    'Reconcile tolerance metrics before progressing dosage; document vitals if protocols require.',
    'Update functional scores after each session; flag plateau >10 visits for IDT review.',
    'Cross-check fall-risk notes before ambulation trials; ensure gait belt + second staff when indicated.',
    'Pair OT cognitive tasks when nursing notes show orientation fluctuations.',
  ].join(' ')

  const mdFlags = rows.filter(
    (r) =>
      r.escalatedDoctorReview ||
      (r.painScore >= 8 && r.progressTrend === 'declining') ||
      (r.bucket === 'missed_rehab' && r.missedSessionsWeek >= 2),
  ).length
  const doctorReviewRecommendation =
    mdFlags > 0
      ? `${mdFlags} patient(s) need physician visibility this cycle — review pain trajectory, attendance, or explicit escalations before IDT sign-off (simulation).`
      : 'No mandatory physician queue items on this roster snapshot; continue routine surveillance and document stable tolerance (simulation).'

  return {
    functionalImprovement,
    rehabFocusRecommendation: focus,
    familyEncouragementSuggestion: familyEncouragement,
    therapistActionChecklist: therapistChecklist,
    doctorReviewRecommendation,
  }
}

/** CSV export for simulation rehab roster */
export function buildRehabilitationReportCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const headers = [
    'patientName',
    'room',
    'diagnosis',
    'rehabType',
    'therapyMinutesLastSession',
    'walkingDistanceM',
    'transferAbility',
    'balanceScore',
    'muscleStrength',
    'painScore',
    'adlIndependence',
    'speechProgress',
    'therapistAssigned',
    'lastSessionAt',
    'nextSessionDueAt',
    'progressTrend',
    'recoveryPotential',
    'bucket',
    'escalatedDoctorReview',
  ]
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        esc(r.patientName),
        esc(r.room),
        esc(r.diagnosis),
        esc(rehabTypeDisplayLabel(r.rehabType)),
        r.therapyMinutesLastSession,
        r.walkingDistanceM,
        esc(r.transferAbility),
        r.balanceScore,
        esc(r.muscleStrength),
        r.painScore,
        r.adlIndependence,
        r.speechProgress,
        esc(r.therapistAssigned),
        esc(r.lastSessionAt),
        esc(r.nextSessionDueAt),
        esc(r.progressTrend),
        esc(r.recoveryPotential),
        esc(r.bucket),
        r.escalatedDoctorReview ? 'yes' : 'no',
      ].join(','),
    ),
  ]
  return `\uFEFF${lines.join('\n')}\n`
}
