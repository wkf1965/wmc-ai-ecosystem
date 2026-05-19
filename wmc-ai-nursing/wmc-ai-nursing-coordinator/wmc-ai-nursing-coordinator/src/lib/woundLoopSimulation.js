import {
  mergeWoundCareLoopRows,
  readWoundCareLoopRaw,
  ensureWoundCareBaseline,
} from '../db/woundLoopStorage.js'

const DUE_BEFORE_MS = 22 * 60 * 1000
const DUE_AFTER_MS = 65 * 60 * 1000
const OVERDUE_MS = 75 * 60 * 1000

export function formatWoundTime(iso) {
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

export function nextDressingDueIso(fromMs = Date.now()) {
  const d = new Date(fromMs)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const slots = [7, 11, 14.5, 18, 21].map((hr) => {
    const h = Math.floor(hr)
    const m = Math.round((hr - h) * 60)
    return dayStart + (h * 60 + m) * 60 * 1000
  })
  for (const t of slots) {
    if (t > fromMs + 12 * 60000) return new Date(t).toISOString()
  }
  return new Date(dayStart + 26 * 60 * 60 * 1000).toISOString()
}

export function infectionRiskPoints(row) {
  let s = 0
  const red = String(row.redness || '').toLowerCase()
  if (red.includes('severe')) s += 3
  else if (red.includes('moderate')) s += 2
  else if (red.includes('mild')) s += 1

  const sw = String(row.swelling || '').toLowerCase()
  if (sw.includes('moderate') || sw.includes('severe')) s += 2
  else if (sw.includes('mild')) s += 1

  const disc = String(row.discharge || '').toLowerCase()
  if (disc.includes('purulent')) s += 4
  else if (disc.includes('serosanguin')) s += 1
  else if (disc && !disc.includes('minimal') && !disc.includes('none')) s += 2

  const od = String(row.odor || '').toLowerCase()
  if (od.includes('foul')) s += 3
  else if (od.includes('mild')) s += 1

  if ((row.painScore ?? 0) >= 8) s += 3
  else if ((row.painScore ?? 0) >= 5) s += 1

  if (row.healingTrend === 'worsening') s += 2
  return s
}

/**
 * @returns {'dressing_due_now'|'overdue_dressing'|'infection_risk'|'healing_progress'|'doctor_review_needed'}
 */
export function woundCareBoardBucket(row, nowMs = Date.now()) {
  const due = new Date(row.dressingDueAt).getTime()
  const inDueWindow = nowMs >= due - DUE_BEFORE_MS && nowMs <= due + DUE_AFTER_MS
  const overdue = nowMs > due + OVERDUE_MS
  const inf = infectionRiskPoints(row)

  if (row.doctorReviewNeeded || row.escalatedInfection || (inf >= 9 && row.painScore >= 7)) {
    return 'doctor_review_needed'
  }

  if (overdue) return 'overdue_dressing'

  if (inf >= 6) return 'infection_risk'

  if (inDueWindow) return 'dressing_due_now'

  if (row.healingTrend === 'improving' && inf <= 4 && !overdue) return 'healing_progress'

  if (inf <= 3 && row.healingTrend !== 'worsening') return 'healing_progress'

  return 'dressing_due_now'
}

export function listWoundCareLoopRows(patients, nowMs = Date.now()) {
  const merged = mergeWoundCareLoopRows(patients, nowMs)
  return merged.map((row) => ({
    ...row,
    bucket: woundCareBoardBucket(row, nowMs),
    infectionScore: infectionRiskPoints(row),
  }))
}

export function buildWoundCareLoopAiAlerts(rows) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of rows) {
    const tag = `${row.patientName} · Rm ${row.room}`
    const inf = row.infectionScore ?? infectionRiskPoints(row)

    if (inf >= 7 || /purulent|foul/i.test(`${row.discharge} ${row.odor}`)) {
      add(`inf-${row.patientId}`, 'critical', 'Possible infection', `Risk score ${inf} · ${row.woundLocation}`, tag)
    }

    if (row.healingTrend === 'worsening') {
      add(`wor-${row.patientId}`, 'high', 'Wound worsening', `Trend declining · monitor edges & drainage`, tag)
    }

    if (row.bucket === 'overdue_dressing') {
      add(`due-${row.patientId}`, 'high', 'Dressing overdue', `Past scheduled window · ${row.woundType}`, tag)
    }

    if (
      /pressure|sacrum|heel|malleolus/i.test(`${row.woundLocation} ${row.woundType}`) &&
      /high/i.test(row.pressureRiskSnap || '')
    ) {
      add(`pr-${row.patientId}`, 'medium', 'Pressure sore risk', `High pressure risk + vulnerable site`, tag)
    }

    if ((row.painScore ?? 0) >= 7) {
      add(`pain-${row.patientId}`, 'medium', 'Pain increased', `Pain ${row.painScore}/10 reported`, tag)
    }

    if (row.doctorReviewNeeded || row.escalatedInfection) {
      add(`doc-${row.patientId}`, 'critical', 'Doctor review needed', `Escalated wound concern (sim)`, tag)
    }
  }

  return alerts
}

export function woundCareScoreTotalsDisplay() {
  const raw = readWoundCareLoopRaw()
  ensureWoundCareBaseline()
  const b = raw.baseline || {
    improving: 0,
    stable: 0,
    worsening: 0,
    infectionRisk: 0,
    urgentReview: 0,
  }
  const s = raw.scores || {}
  return {
    improving: b.improving + (s.improving ?? 0),
    stable: b.stable + (s.stable ?? 0),
    worsening: b.worsening + (s.worsening ?? 0),
    infectionRisk: b.infectionRisk + (s.infectionRisk ?? 0),
    urgentReview: b.urgentReview + (s.urgentReview ?? 0),
  }
}

export function woundCareLoopAiSummary(rows) {
  const highRisk = rows.filter((r) => (r.infectionScore ?? 0) >= 6 || r.healingTrend === 'worsening')
  const overdueN = rows.filter((r) => r.bucket === 'overdue_dressing').length
  const improvingN = rows.filter((r) => r.healingTrend === 'improving').length
  const worseningN = rows.filter((r) => r.healingTrend === 'worsening').length

  const dressingCompliance = `Dressing windows: ${rows.length - overdueN}/${rows.length} not overdue on this snapshot (${overdueN} overdue). Demo counters only.`

  const healingTrend = `Healing trend mix — improving ${improvingN}, worsening ${worseningN}, remainder stable (simulation labels).`

  const nurseChecklist = [
    'Measure & sketch wound weekly; photograph per policy with consent sticker.',
    'Align dressing frequency with order set; document peri-wound skin.',
    'Contact provider for spreading erythema, new odor, fever, or unexpected pain jump.',
    'Reposition q2h when pressure injury suspected; offload heels.',
  ].join(' ')

  const doctorReviewRecommendation =
    highRisk.length > 0
      ? `Consider formal review for: ${highRisk
          .slice(0, 4)
          .map((r) => r.patientName)
          .join(', ')} — infection-risk clustering or worsening trend.`
      : 'No mandatory wound MD queue from current simulated scoring.'

  return {
    highRiskWoundsCount: highRisk.length,
    dressingComplianceSummary: dressingCompliance,
    healingTrendSummary: healingTrend,
    nurseActionChecklist: nurseChecklist,
    doctorReviewRecommendation,
  }
}
