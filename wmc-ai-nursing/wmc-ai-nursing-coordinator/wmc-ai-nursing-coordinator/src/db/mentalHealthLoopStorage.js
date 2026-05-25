import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'

export const MENTAL_HEALTH_LOOP_STORAGE_KEY = 'wmc_mental_health_loop_v1'

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(MENTAL_HEALTH_LOOP_STORAGE_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: {
          stable: 0,
          monitor: 0,
          moderateRisk: 0,
          highRisk: 0,
          urgentReview: 0,
        },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      instances: p.instances && typeof p.instances === 'object' ? p.instances : {},
      scores: {
        stable: p.scores?.stable ?? 0,
        monitor: p.scores?.monitor ?? 0,
        moderateRisk: p.scores?.moderateRisk ?? 0,
        highRisk: p.scores?.highRisk ?? 0,
        urgentReview: p.scores?.urgentReview ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: {
        stable: 0,
        monitor: 0,
        moderateRisk: 0,
        highRisk: 0,
        urgentReview: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(MENTAL_HEALTH_LOOP_STORAGE_KEY, JSON.stringify(data))
}

export function emitMentalHealthLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-mental-health-loop-updated'))
}

export function ensureMentalHealthBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { stable: 52, monitor: 28, moderateRisk: 14, highRisk: 7, urgentReview: 4 }
  saveRaw(raw)
  return raw.baseline
}

export function readMentalHealthLoopRaw() {
  return loadRaw()
}

export function bumpMentalHealthScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitMentalHealthLoopUpdate()
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

function seedFromMentalStatus(ms, h) {
  const m = String(ms || '').toLowerCase()
  let confusion = 'None'
  if (/disorient|confusion|oriented\s*[×x]\s*2|\bx2\b/i.test(m)) confusion = 'Moderate'
  if (/severe confusion|combative|hallucinat/i.test(m)) confusion = 'Severe'

  let mood = ['Cheerful', 'Neutral', 'Low', 'Irritable', 'Tearful'][h % 5]
  if (/depress|tearful|withdraw/i.test(m)) mood = 'Tearful'
  if (/agitat|combative/i.test(m)) mood = 'Irritable'

  return { confusionHint: confusion, moodHint: mood }
}

export function mergeMentalHealthLoopRows(patients, nowMs = Date.now()) {
  ensureMentalHealthBaseline()
  const raw = loadRaw()

  if (!patients?.length) return []

  return patients.map((patient, idx) => {
    const id = patient.id
    const h = hashStr(`${id}|mh`)
    const over = raw.instances[id] || {}
    const seed = seedFromMentalStatus(patient.mentalStatus, h)

    const nurse =
      over.nurseAssigned?.trim() ||
      patient.assignedNurse?.trim() ||
      ['R.N. Patel', 'LPN Santos', 'R.N. Kim', 'R.N. Nguyen'][idx % 4]

    const confusionLevel =
      over.confusionLevel ||
      (seed.confusionHint !== 'None'
        ? seed.confusionHint
        : ['None', 'None', 'Mild', 'Moderate'][h % 4])

    const moodStatus = over.moodStatus || seed.moodHint

    const anxietyLevel =
      over.anxietyLevel || ['None', 'Mild', 'Moderate', 'Severe'][h % 6 === 0 ? 3 : h % 4]

    const sleepQuality =
      over.sleepQuality || (h % 13 === 0 ? 'Poor' : h % 11 === 0 ? 'Minimal' : 'Fair')

    const appetiteChange =
      over.appetiteChange || ['Stable', 'Decreased', 'Poor', 'Increased'][h % 7 === 0 ? 2 : h % 4]

    const agitationLevel =
      over.agitationLevel || (h % 17 === 0 ? 'Moderate' : h % 23 === 0 ? 'Severe' : 'None')

    const socialInteraction =
      over.socialInteraction ||
      ['Active', 'Limited', 'Withdrawn', 'Refuses'][h % 11 === 0 ? 2 : h % 4]

    const hallucinationDelusionObs =
      over.hallucinationDelusionObs || (h % 29 === 0 ? 'Suspected' : h % 31 === 0 ? 'Observed' : 'None')

    const wanderingBehavior =
      over.wanderingBehavior || (h % 19 === 0 ? 'Frequent' : h % 21 === 0 ? 'Occasional' : 'None')

    const selfHarmRiskObs =
      over.selfHarmRiskObs ||
      (h % 41 === 0 ? 'Low' : h % 43 === 0 ? 'Moderate' : h % 47 === 0 ? 'High' : 'None')

    return {
      patientId: id,
      patientName: patient.fullName || 'Unknown',
      room: over.room || roomForPatient(id, idx + 1),
      moodStatus,
      anxietyLevel,
      sleepQuality,
      appetiteChange,
      confusionLevel,
      agitationLevel,
      socialInteraction,
      hallucinationDelusionObs,
      wanderingBehavior,
      selfHarmRiskObs,
      nurseAssigned: nurse,
      lastMentalHealthCheckAt:
        over.lastMentalHealthCheckAt ||
        new Date(nowMs - ((h % 28) + 2) * 3600000).toISOString(),
      nextDueAt:
        over.nextDueAt || new Date(nowMs + ((h % 45) - 5) * 60000).toISOString(),
      notes: Array.isArray(over.notes) ? over.notes : [],
      escalatedDoctor: Boolean(over.escalatedDoctor),
      escalatedCounsellor: Boolean(over.escalatedCounsellor),
    }
  })
}

export function upsertMentalHealthPatient(patientId, patch) {
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  raw.instances[patientId] = { ...prev, ...patch }
  saveRaw(raw)
  emitMentalHealthLoopUpdate()
}

export function appendMentalHealthNote(patientId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  const notes = Array.isArray(prev.notes) ? [...prev.notes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  raw.instances[patientId] = { ...prev, notes: notes.slice(-18) }
  saveRaw(raw)
  emitMentalHealthLoopUpdate()
}
