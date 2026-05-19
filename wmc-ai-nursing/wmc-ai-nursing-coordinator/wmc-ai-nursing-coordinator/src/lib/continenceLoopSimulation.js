import {
  mergeContinenceLoopRows,
  readContinenceLoopRaw,
  ensureContinenceBaseline,
} from '../db/continenceLoopStorage.js'

const CHECK_OVERDUE_MS = 92 * 60 * 1000
const DIAPER_BEFORE_MS = 24 * 60 * 1000
const DIAPER_AFTER_MS = 68 * 60 * 1000

export function formatContinenceTime(iso) {
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

export function nextContinenceRoundIso(fromMs = Date.now()) {
  const d = new Date(fromMs)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const slots = [7.5, 11, 14, 17.5, 20.5].map((hr) => {
    const h = Math.floor(hr)
    const m = Math.round((hr - h) * 60)
    return dayStart + (h * 60 + m) * 60 * 1000
  })
  for (const t of slots) {
    if (t > fromMs + 12 * 60000) return new Date(t).toISOString()
  }
  return new Date(dayStart + 27 * 60 * 60 * 1000).toISOString()
}

export function nextDiaperChangeIso(fromMs = Date.now()) {
  return new Date(fromMs + 3 * 3600000 + 20 * 60000).toISOString()
}

/**
 * @returns {'diaper_change_due'|'constipation_concern'|'frequent_urination'|'skin_irritation_risk'|'overdue_continence_check'}
 */
export function continenceBoardBucket(row, nowMs = Date.now()) {
  const checkDue = new Date(row.nextDueAt).getTime()
  if (nowMs > checkDue + CHECK_OVERDUE_MS) {
    return 'overdue_continence_check'
  }

  const skin = String(row.skinIrritation || '').toLowerCase()
  if (skin.includes('severe') || skin.includes('moderate')) return 'skin_irritation_risk'

  const cr = String(row.constipationRisk || '')
  const stool = String(row.stoolConsistency || '').toLowerCase()
  const bowel = String(row.bowelMovementStatus || '').toLowerCase()
  if (
    cr === 'High' ||
    stool.includes('hard') ||
    bowel.includes('none documented') ||
    row.escalatedConstipation
  ) {
    return 'constipation_concern'
  }
  if (cr === 'Moderate' && (stool.includes('hard') || bowel.includes('irregular'))) {
    return 'constipation_concern'
  }

  const freq = String(row.urinationFrequency || '').toLowerCase()
  if (freq.includes('hourly') || freq.includes('frequent')) return 'frequent_urination'

  const diaperDue = new Date(row.nextDiaperChangeDueAt).getTime()
  const diaperWindow =
    nowMs >= diaperDue - DIAPER_BEFORE_MS && nowMs <= diaperDue + DIAPER_AFTER_MS
  if (diaperWindow || nowMs >= diaperDue - 12 * 60000) return 'diaper_change_due'

  return 'diaper_change_due'
}

export function listContinenceLoopRows(patients, nowMs = Date.now()) {
  const merged = mergeContinenceLoopRows(patients, nowMs)
  return merged.map((row) => ({
    ...row,
    bucket: continenceBoardBucket(row, nowMs),
  }))
}

export function buildContinenceLoopAiAlerts(rows) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of rows) {
    const tag = `${row.patientName} · Rm ${row.room}`

    if (row.constipationRisk === 'High' || /hard/i.test(row.stoolConsistency || '')) {
      add(`const-${row.patientId}`, 'high', 'Constipation risk', `${row.constipationRisk} · ${row.stoolConsistency}`, tag)
    }

    if (/watery|loose/i.test(row.stoolConsistency || '') || /loose|diarr/i.test(row.bowelMovementStatus || '')) {
      add(`dia-${row.patientId}`, 'high', 'Diarrhea concern', `Stool ${row.stoolConsistency}`, tag)
    }

    const urine = String(row.urineColorObservation || '').toLowerCase()
    if (urine.includes('dark amber') || urine.includes('cloudy')) {
      add(`dehyd-${row.patientId}`, 'medium', 'Dehydration signs', `Urine: ${row.urineColorObservation}`, tag)
    }

    const skin = String(row.skinIrritation || '').toLowerCase()
    if (skin.includes('severe') || skin.includes('moderate')) {
      add(`skin-${row.patientId}`, 'high', 'Skin breakdown risk', `Perineal/skin: ${row.skinIrritation}`, tag)
    }

    if ((row.incontinenceEpisodes ?? 0) >= 3) {
      add(`inc-${row.patientId}`, 'medium', 'Repeated incontinence', `${row.incontinenceEpisodes} episodes (demo counter)`, tag)
    }

    if (row.doctorReviewNeeded || row.escalatedConstipation) {
      add(`doc-${row.patientId}`, 'critical', 'Doctor review needed', `Continence escalation (sim)`, tag)
    }
  }

  return alerts
}

export function continenceScoreTotalsDisplay() {
  const raw = readContinenceLoopRaw()
  ensureContinenceBaseline()
  const b = raw.baseline || {
    stable: 0,
    monitor: 0,
    moderateConcern: 0,
    highRisk: 0,
    urgentReview: 0,
  }
  const s = raw.scores || {}
  return {
    stable: b.stable + (s.stable ?? 0),
    monitor: b.monitor + (s.monitor ?? 0),
    moderateConcern: b.moderateConcern + (s.moderateConcern ?? 0),
    highRisk: b.highRisk + (s.highRisk ?? 0),
    urgentReview: b.urgentReview + (s.urgentReview ?? 0),
  }
}

export function continenceLoopAiSummary(rows) {
  const constipationPatients = rows.filter(
    (r) =>
      r.bucket === 'constipation_concern' ||
      r.constipationRisk === 'High' ||
      r.constipationRisk === 'Moderate',
  )

  const diaperHeavy = rows.filter(
    (r) =>
      /diaper|incontinent/i.test(r.toiletAssistanceNeeded || '') ||
      (r.incontinenceEpisodes ?? 0) >= 2,
  )

  const skinRec =
    'Barrier cream per protocol after each episode; gentle cleanser; dry thoroughly; consider breathable brief checks q2h high-risk.'

  const nurseChecklist = [
    'Compare intake/output narrative with hydration loop when urine concentrates.',
    'Trend stool calendar + Bristol descriptors; notify provider for impaction signs.',
    'Rotate off breakdown-prone areas; photo/document peri-wound erythema when policy allows.',
    'Reconcile laxative/stool softener orders before escalating constipation.',
  ].join(' ')

  const mdNeed = rows.filter((r) => r.doctorReviewNeeded || r.escalatedConstipation)
  const doctorReviewRecommendation =
    mdNeed.length > 0
      ? `Provider visibility suggested for: ${mdNeed
          .slice(0, 4)
          .map((r) => r.patientName)
          .join(', ')} — constipation protocol / diarrhea work-up per chart (sim).`
      : 'No mandatory continence MD queue from current simulated flags.'

  return {
    constipationConcernCount: constipationPatients.length,
    frequentDiaperChangeCount: diaperHeavy.length,
    skinCareRecommendations: skinRec,
    nurseActionChecklist: nurseChecklist,
    doctorReviewRecommendation,
  }
}
