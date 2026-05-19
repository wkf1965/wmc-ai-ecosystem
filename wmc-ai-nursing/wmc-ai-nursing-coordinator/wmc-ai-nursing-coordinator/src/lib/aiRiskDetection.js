/**
 * Rule-based clinical risk signals from nursing note text + patient context.
 * Demo only — not a regulated medical device; always verify at the bedside.
 */

const MAX_RECENT_NOTES = 12

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\u2080/g, '0')
    .replace(/\u2081/g, '1')
    .replace(/\u2082/g, '2')
    .replace(/\u2083/g, '3')
    .replace(/\u2084/g, '4')
    .replace(/\u2085/g, '5')
    .replace(/\u2086/g, '6')
    .replace(/\u2087/g, '7')
    .replace(/\u2088/g, '8')
    .replace(/\u2089/g, '9')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Concatenate all narrative fields from one or more notes for analysis. */
export function aggregateNotesText(notes) {
  const parts = []
  for (const n of notes) {
    parts.push(
      n.appetite,
      n.sleep,
      n.mood,
      n.bloodPressure,
      n.bloodSugar,
      n.urination,
      n.bowelMovement,
      n.skinCondition,
      n.abnormalEvents,
      n.nurseRemarks,
      typeof n.painScore === 'number' ? `pain ${n.painScore}` : '',
    )
  }
  return norm(parts.join('\n'))
}

export function scoreToLevel(score) {
  if (score >= 75) return { level: 'critical', label: 'Critical', badge: 'danger' }
  if (score >= 55) return { level: 'high', label: 'High', badge: 'danger' }
  if (score >= 35) return { level: 'moderate', label: 'Moderate', badge: 'warning' }
  if (score >= 15) return { level: 'low', label: 'Low', badge: 'success' }
  return { level: 'minimal', label: 'Minimal', badge: 'default' }
}

function clampScore(n) {
  return Math.min(100, Math.max(0, Math.round(n)))
}

function matchPatterns(text, patterns) {
  let score = 0
  const signals = []
  for (const p of patterns) {
    const hit = p.terms.some((t) => text.includes(t.toLowerCase()))
    if (hit) {
      score += p.add
      signals.push(p.signal)
    }
  }
  return { score: clampScore(score), signals: [...new Set(signals)] }
}

function patientFallPressureBoost(patient) {
  if (!patient) return { fall: 0, pressure: 0 }
  const fr = String(patient.fallRisk || '').toLowerCase()
  const pr = String(patient.pressureSoreRisk || '').toLowerCase()
  const bump = (v) => (v.includes('high') ? 22 : v.includes('moderate') ? 12 : 0)
  return { fall: bump(fr), pressure: bump(pr) }
}

function patientDiagnosisContext(patient) {
  if (!patient?.diagnosis) return ''
  return norm(patient.diagnosis)
}

/**
 * @param {object[]} notesSortedNewestFirst
 * @param {object|null} patient
 */
export function analyzePatientNotes(notesSortedNewestFirst, patient) {
  const recent = notesSortedNewestFirst.slice(0, MAX_RECENT_NOTES)
  const text = aggregateNotesText(recent)
  const dx = patientDiagnosisContext(patient)
  const combined = `${text} ${dx}`
  const { fall: fallBump, pressure: pressureBump } = patientFallPressureBoost(patient)

  const categories = []

  const fallPatterns = [
    { terms: ['unsteady', 'near fall', 'stumble', 'caught balance', 'dizzy', 'syncope', 'lightheaded'], add: 28, signal: 'Balance / dizziness language' },
    { terms: ['walker', 'cane', 'transfer', 'assist x2', 'two person', 'slide board'], add: 18, signal: 'Mobility / assist device context' },
    { terms: ['orthostatic', 'postural', 'lower extremity weakness', 'legs gave way'], add: 32, signal: 'Orthostatic / leg weakness' },
    { terms: ['pain post-pt', 'post-pt', 'after pt', 'stairs with'], add: 12, signal: 'Post-therapy mobility load' },
  ]
  const fallBase = matchPatterns(combined, fallPatterns)
  const fallScore = clampScore(fallBase.score + fallBump + (recent.some((n) => n.painScore >= 6) ? 10 : 0))
  categories.push(buildCategory('fall_risk', 'Fall risk', fallScore, fallBase.signals, ACTIONS.fall))

  const infPatterns = [
    { terms: ['productive cough', 'purulent', 'green sputum', 'yellow sputum', 'fever', 'temp 38', '38.', 'chills', 'rigors'], add: 32, signal: 'Respiratory / systemic infection cues' },
    { terms: ['spo2 9', 'spo₂ 9', 'oxygen', '2l nc', 'desat', 'wheez', '93%', '92%', '91%'], add: 22, signal: 'Respiratory compromise / oxygen therapy' },
    { terms: ['erythema', 'spreading redness', 'warmth at site', 'purulent drainage', 'wound odor'], add: 30, signal: 'Skin / wound infection language' },
    { terms: ['uti', 'dysuria', 'cloudy urine', 'burning with void'], add: 24, signal: 'Genitourinary infection cues' },
    { terms: ['copd', 'pneumonia', 'exacerbation'], add: 12, signal: 'High-risk diagnosis context' },
  ]
  const inf = matchPatterns(combined, infPatterns)
  categories.push(buildCategory('infection_risk', 'Infection risk', inf.score, inf.signals, ACTIONS.infection))

  const appPatterns = [
    { terms: ['25%', '50%', 'refused', 'poor appetite', 'npo concern', 'skipped meal', 'one bite', 'minimal intake'], add: 35, signal: 'Reduced oral intake' },
    { terms: ['75% breakfast', '50% hs', '50% snack'], add: 15, signal: 'Partial meal completion' },
    { terms: ['nausea', 'vomiting', 'early satiety'], add: 22, signal: 'GI symptoms affecting intake' },
  ]
  const app = matchPatterns(combined, appPatterns)
  categories.push(buildCategory('poor_appetite', 'Poor appetite', app.score, app.signals, ACTIONS.appetite))

  const dehydPatterns = [
    { terms: ['dry mouth', 'mucous membranes dry', 'concentrated urine', 'dark urine', 'low intake', 'poor po', 'encouraged fluids'], add: 26, signal: 'Fluid deficit cues' },
    { terms: ['hypotension', 'orthostatic', 'bp drop', 'dizzy when standing'], add: 28, signal: 'Hemodynamic / orthostasis' },
    { terms: ['chf', 'heart failure', 'diuretic', 'lasix', 'furosemide'], add: 14, signal: 'Volume-sensitive condition / diuresis' },
  ]
  const dehyd = matchPatterns(combined, dehydPatterns)
  categories.push(buildCategory('dehydration', 'Dehydration', dehyd.score, dehyd.signals, ACTIONS.dehydration))

  const emoPatterns = [
    { terms: ['tearful', 'crying', 'sobbing', 'anxious', 'panic', 'fear', 'agitated', 'combative', 'yelling'], add: 32, signal: 'Acute distress / agitation' },
    { terms: ['withdrawn', 'flat affect', 'hopeless', 'depressed mood', 'not participating', 'isolating'], add: 26, signal: 'Withdrawal / mood suppression' },
    { terms: ['word-finding', 'confusion', 'disoriented', 'sun downing', 'sundowning'], add: 18, signal: 'Cognitive / communication change' },
    { terms: ['tired but cooperative', 'fatigue', 'exhausted'], add: 8, signal: 'Fatigue / low energy' },
  ]
  const emo = matchPatterns(combined, emoPatterns)
  categories.push(buildCategory('emotional_distress', 'Emotional distress', emo.score, emo.signals, ACTIONS.emotional))

  const pressPatterns = [
    { terms: ['sacrum', 'heel', 'ischial', 'coccyx', 'non-blanching', 'redness', 'stage 1', 'stage 2', 'breakdown'], add: 30, signal: 'Pressure area / early injury language' },
    { terms: ['reposition', 'float heels', 'boots', 'offloading', 'q2h turns'], add: 16, signal: 'Prevention intensity (risk context)' },
    { terms: ['incontinence', 'moisture', 'diarrhea'], add: 14, signal: 'Moisture / shear risk' },
  ]
  const pressBase = matchPatterns(combined, pressPatterns)
  const pressScore = clampScore(pressBase.score + pressureBump)
  categories.push(buildCategory('pressure_sore_risk', 'Pressure sore risk', pressScore, pressBase.signals, ACTIONS.pressure))

  const weakPatterns = [
    { terms: ['sudden weakness', 'acute weakness', 'new weakness', 'cannot lift', 'collapsed', 'slump', 'facial droop', 'one-sided'], add: 45, signal: 'Acute focal / sudden motor change' },
    { terms: ['difficulty standing', 'unable to bear weight', 'buckled', 'legs gave out'], add: 28, signal: 'Ambulatory collapse pattern' },
    { terms: ['fatigue post-pt', 'post-pt'], add: 6, signal: 'Expected therapy fatigue (lower acuity)' },
  ]
  const weak = matchPatterns(combined, weakPatterns)
  categories.push(buildCategory('sudden_weakness', 'Sudden weakness', weak.score, weak.signals, ACTIONS.weakness))

  const overallScore = clampScore(Math.max(...categories.map((c) => c.score), 0))
  const anyEscalation = categories.some((c) => c.escalation)

  return {
    patientId: patient?.id ?? recent[0]?.patientId ?? null,
    patientName: patient?.fullName ?? recent[0]?.patientNameSnapshot ?? 'Unknown',
    noteCount: recent.length,
    lastNoteDate: recent[0]?.date ?? null,
    overallScore,
    anyEscalation,
    categories,
  }
}

const ACTIONS = {
  fall: {
    minimal: 'Continue mobility plan; reinforce call light use.',
    low: 'Reinforce footwear, lighting, and rounding after transfers.',
    moderate: 'Increase supervision with toileting; review PT/OT same day.',
    high: 'Notify charge RN; consider low-low bed and falls bundle audit.',
    critical: 'Immediate bedside assessment; notify provider; hold high-risk ambulation until evaluated.',
  },
  infection: {
    minimal: 'Routine monitoring per protocol.',
    low: 'Trend vitals; encourage pulmonary toilet if applicable.',
    moderate: 'Notify provider within shift; obtain orders for cultures/labs if indicated.',
    high: 'Urgent provider notification; consider sepsis screen and isolation precautions per policy.',
    critical: 'Escalate to rapid response / MD immediately per facility sepsis protocol.',
  },
  appetite: {
    minimal: 'Maintain nutrition care plan.',
    low: 'Offer preferred items; document % intake next meal.',
    moderate: 'Notify RD and provider; consider calorie counts / supplements.',
    high: 'Provider same day; assess swallow and aspiration risk if applicable.',
    critical: 'Immediate clinical evaluation for refusal / risk of malnutrition.',
  },
  dehydration: {
    minimal: 'Maintain fluid schedule.',
    low: 'Offer fluids q1–2h; review diuretic timing with pharmacy/MD.',
    moderate: 'Strict I&O; notify provider for orthostasis or sustained low intake.',
    high: 'Provider notification; consider labs (BMP) and IV access evaluation per order.',
    critical: 'Urgent evaluation for hemodynamic instability or acute change.',
  },
  emotional: {
    minimal: 'Continue therapeutic engagement.',
    low: 'Increase rounding; involve recreation / chaplain as appropriate.',
    moderate: 'Notify social work / psychiatry per protocol; safety check environment.',
    high: 'Provider contact; implement non-pharmacologic de-escalation; consider 1:1 if unsafe.',
    critical: 'Immediate safety risk assessment; activate behavioral response per policy.',
  },
  pressure: {
    minimal: 'Continue turning schedule.',
    low: 'Verify surface appropriateness; photo-document skin q shift.',
    moderate: 'Wound/skin RN consult; update prevention plan.',
    high: 'Provider notification; consider wound care referral and nutrition optimization.',
    critical: 'Immediate skin integrity assessment; hold pressure on affected area.',
  },
  weakness: {
    minimal: 'Continue monitoring.',
    low: 'Neuro checks per unit protocol; document strength comparison.',
    moderate: 'Notify provider promptly for new focal deficits.',
    high: 'Urgent provider evaluation; consider stroke code if focal neuro signs.',
    critical: 'Activate emergency response for acute neuro / cardiovascular symptoms.',
  },
}

function pickAction(map, level) {
  if (level === 'minimal') return map.minimal
  if (level === 'low') return map.low
  if (level === 'moderate') return map.moderate
  if (level === 'high') return map.high
  return map.critical
}

function buildCategory(id, label, score, signals, actionMap) {
  const { level, label: levelLabel, badge } = scoreToLevel(score)
  const escalation = score >= 60
  const recommendedAction = pickAction(actionMap, level)

  return {
    id,
    label,
    score,
    level,
    levelLabel,
    badge,
    signals,
    recommendedAction,
    escalation,
    escalationAlert: escalation,
  }
}

/**
 * @param {object[]} patients from roster
 * @param {object[]} notes all nursing notes
 * @param {(id: string) => object|null} getPatientById
 */
export function analyzeAllPatientsFromNotes(patients, notes, getPatientById) {
  const byId = {}
  for (const n of notes) {
    if (!n.patientId) continue
    if (!byId[n.patientId]) byId[n.patientId] = []
    byId[n.patientId].push(n)
  }

  for (const id of Object.keys(byId)) {
    byId[id].sort((a, b) => {
      const da = a.date || ''
      const db = b.date || ''
      if (da !== db) return db.localeCompare(da)
      return (b.createdAt || '').localeCompare(a.createdAt || '')
    })
  }

  const results = []

  for (const p of patients) {
    const list = byId[p.id] || []
    if (list.length === 0) {
      results.push({
        patientId: p.id,
        patientName: p.fullName,
        noteCount: 0,
        lastNoteDate: null,
        overallScore: 0,
        anyEscalation: false,
        categories: [],
        insufficientData: true,
      })
      continue
    }
    const analysis = analyzePatientNotes(list, getPatientById(p.id))
    results.push({ ...analysis, insufficientData: false })
  }

  results.sort((a, b) => {
    if (Boolean(b.anyEscalation) !== Boolean(a.anyEscalation)) return Number(b.anyEscalation) - Number(a.anyEscalation)
    if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore
    return a.patientName.localeCompare(b.patientName)
  })

  return results
}
