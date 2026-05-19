import {
  mergeMentalHealthLoopRows,
  readMentalHealthLoopRaw,
  ensureMentalHealthBaseline,
} from '../db/mentalHealthLoopStorage.js'

const DUE_BEFORE_MS = 26 * 60 * 1000
const DUE_AFTER_MS = 70 * 60 * 1000

export function formatMentalHealthTime(iso) {
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

export function nextMentalHealthDueIso(fromMs = Date.now()) {
  const d = new Date(fromMs)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const slots = [8, 12, 16, 20].map((hr) => dayStart + hr * 60 * 60 * 1000)
  for (const t of slots) {
    if (t > fromMs + 15 * 60000) return new Date(t).toISOString()
  }
  return new Date(dayStart + 28 * 60 * 60 * 1000).toISOString()
}

/**
 * @returns {'due_now'|'agitated_patients'|'confusion_delirium_risk'|'depression_concern'|'sleep_disturbance'|'doctor_counsellor_review_needed'}
 */
export function mentalHealthBoardBucket(row, nowMs = Date.now()) {
  const shr = String(row.selfHarmRiskObs || '').toLowerCase()
  if (row.escalatedDoctor || row.escalatedCounsellor || shr === 'high' || shr === 'moderate') {
    return 'doctor_counsellor_review_needed'
  }

  const ag = String(row.agitationLevel || '').toLowerCase()
  if (ag.includes('severe') || ag.includes('moderate')) return 'agitated_patients'

  const wand = String(row.wanderingBehavior || '').toLowerCase()
  if (wand.includes('frequent')) return 'confusion_delirium_risk'

  const hall = String(row.hallucinationDelusionObs || '')
  const conf = String(row.confusionLevel || '').toLowerCase()
  if ((hall && hall !== 'None') || conf.includes('severe') || conf.includes('moderate')) {
    return 'confusion_delirium_risk'
  }

  const mood = String(row.moodStatus || '').toLowerCase()
  if (
    mood.includes('tearful') ||
    mood.includes('low') ||
    mood.includes('flat') ||
    mood.includes('hopeless')
  ) {
    return 'depression_concern'
  }

  const soc = String(row.socialInteraction || '').toLowerCase()
  if (soc.includes('withdraw') || soc.includes('refuses')) {
    return 'depression_concern'
  }

  const appetite = String(row.appetiteChange || '').toLowerCase()
  if (appetite.includes('poor') && (mood.includes('low') || mood.includes('tearful'))) {
    return 'depression_concern'
  }

  const sleep = String(row.sleepQuality || '').toLowerCase()
  if (sleep.includes('poor') || sleep.includes('minimal')) return 'sleep_disturbance'

  const due = new Date(row.nextDueAt).getTime()
  const inDue = nowMs >= due - DUE_BEFORE_MS && nowMs <= due + DUE_AFTER_MS
  if (inDue || nowMs > due + 40 * 60000) return 'due_now'

  return 'due_now'
}

export function listMentalHealthLoopRows(patients, nowMs = Date.now()) {
  const merged = mergeMentalHealthLoopRows(patients, nowMs)
  return merged.map((row) => ({
    ...row,
    bucket: mentalHealthBoardBucket(row, nowMs),
  }))
}

export function buildMentalHealthLoopAiAlerts(rows) {
  const alerts = []
  const seen = new Set()
  function add(id, severity, category, title, detail) {
    if (seen.has(id)) return
    seen.add(id)
    alerts.push({ id, severity, category, title, detail })
  }

  for (const row of rows) {
    const tag = `${row.patientName} · Rm ${row.room}`
    const conf = String(row.confusionLevel || '').toLowerCase()

    if (conf.includes('moderate') || conf.includes('severe')) {
      add(`conf-${row.patientId}`, 'high', 'Increased confusion', `${row.confusionLevel} · monitor orientation`, tag)
    }

    const ag = String(row.agitationLevel || '').toLowerCase()
    if (ag.includes('moderate') || ag.includes('severe')) {
      add(`ag-${row.patientId}`, 'high', 'Agitation episode', `${row.agitationLevel} reported`, tag)
    }

    const mood = String(row.moodStatus || '').toLowerCase()
    if (mood.includes('tearful') || mood.includes('low') || mood.includes('hopeless')) {
      add(`dep-${row.patientId}`, 'medium', 'Depression signs', `Mood: ${row.moodStatus}`, tag)
    }

    const sleep = String(row.sleepQuality || '').toLowerCase()
    if (sleep.includes('poor') || sleep.includes('minimal')) {
      add(`sleep-${row.patientId}`, 'medium', 'Sleep disturbance', `Sleep: ${row.sleepQuality}`, tag)
    }

    const wand = String(row.wanderingBehavior || '').toLowerCase()
    if (wand.includes('frequent') || wand.includes('occasional')) {
      add(`wand-${row.patientId}`, wand.includes('frequent') ? 'high' : 'medium', 'Wandering risk', `${row.wanderingBehavior}`, tag)
    }

    const hall = String(row.hallucinationDelusionObs || '')
    if (hall === 'Suspected' || hall === 'Observed') {
      add(`del-${row.patientId}`, 'critical', 'Delirium risk', `${hall} — ${row.hallucinationDelusionObs}`, tag)
    }

    const shr = String(row.selfHarmRiskObs || '').toLowerCase()
    if (shr === 'moderate' || shr === 'high') {
      add(`sh-${row.patientId}`, 'critical', 'Self-harm concern', `Risk level: ${row.selfHarmRiskObs}`, tag)
    }

    if (row.escalatedDoctor) {
      add(`doc-${row.patientId}`, 'critical', 'Doctor review needed', `Physician escalation flag (sim)`, tag)
    }
  }

  return alerts
}

export function mentalHealthScoreTotalsDisplay() {
  const raw = readMentalHealthLoopRaw()
  ensureMentalHealthBaseline()
  const b = raw.baseline || {
    stable: 0,
    monitor: 0,
    moderateRisk: 0,
    highRisk: 0,
    urgentReview: 0,
  }
  const s = raw.scores || {}
  return {
    stable: b.stable + (s.stable ?? 0),
    monitor: b.monitor + (s.monitor ?? 0),
    moderateRisk: b.moderateRisk + (s.moderateRisk ?? 0),
    highRisk: b.highRisk + (s.highRisk ?? 0),
    urgentReview: b.urgentReview + (s.urgentReview ?? 0),
  }
}

export function mentalHealthLoopAiSummary(rows) {
  const emotional = rows.filter((r) => {
    const m = String(r.moodStatus || '').toLowerCase()
    const s = String(r.socialInteraction || '').toLowerCase()
    return m.includes('tearful') || m.includes('low') || s.includes('withdraw')
  })

  const behavioral = rows.filter((r) => {
    const a = String(r.agitationLevel || '').toLowerCase()
    const c = String(r.confusionLevel || '').toLowerCase()
    return a.includes('moderate') || a.includes('severe') || c.includes('moderate') || c.includes('severe')
  })

  const poorSleep = rows.filter((r) => /poor|minimal/i.test(String(r.sleepQuality || '')))
  const lowMood = rows.filter((r) => /tearful|low|flat/i.test(String(r.moodStatus || '')))

  const sleepMoodTrend = `Sleep issues on ${poorSleep.length} snapshot(s); low/flat mood flags on ${lowMood.length}. Demo aggregate only.`

  const nurseChecklist = [
    'Validate feelings briefly; avoid arguing with fixed false beliefs — redirect & ensure safety.',
    'Offer daylight routine, hydration, and pain assessment before labeling behaviors.',
    'Involve family for comforting items; document triggers/antecedents for behaviours.',
    'Use lowest effective stimulus; escalate per policy if self-harm ideation expressed.',
  ].join(' ')

  const counsellorN = rows.filter((r) => r.escalatedCounsellor).length
  const counsellorReviewRecommendation =
    counsellorN > 0
      ? `${counsellorN} patient(s) flagged for counsellor outreach — schedule therapeutic check-ins per facility workflow (sim).`
      : 'No mandatory counsellor queue from current flags — continue rounding awareness.'

  const familyCommunicationSuggestion =
    emotional.length > 0
      ? `For ${emotional
          .slice(0, 3)
          .map((r) => r.patientName)
          .join(', ')}: share supportive, non-diagnostic updates ("resting now", "engaged in activities") unless clinician authorizes detail.`
      : 'Routine reassurance texts appropriate — highlight structured activities and sleep hygiene wins.'

  return {
    emotionalSupportCount: emotional.length,
    behavioralChangeCount: behavioral.length,
    sleepMoodTrendSummary: sleepMoodTrend,
    nurseActionChecklist: nurseChecklist,
    counsellorReviewRecommendation,
    familyCommunicationSuggestion,
  }
}
