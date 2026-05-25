import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'

export const CONTINENCE_LOOP_STORAGE_KEY = 'wmc_continence_loop_v1'

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(CONTINENCE_LOOP_STORAGE_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: {
          stable: 0,
          monitor: 0,
          moderateConcern: 0,
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
        moderateConcern: p.scores?.moderateConcern ?? 0,
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
        moderateConcern: 0,
        highRisk: 0,
        urgentReview: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(CONTINENCE_LOOP_STORAGE_KEY, JSON.stringify(data))
}

export function emitContinenceLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-continence-loop-updated'))
}

export function ensureContinenceBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { stable: 48, monitor: 26, moderateConcern: 13, highRisk: 8, urgentReview: 4 }
  saveRaw(raw)
  return raw.baseline
}

export function readContinenceLoopRaw() {
  return loadRaw()
}

export function bumpContinenceScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitContinenceLoopUpdate()
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

export function mergeContinenceLoopRows(patients, nowMs = Date.now()) {
  ensureContinenceBaseline()
  const raw = loadRaw()

  if (!patients?.length) return []

  return patients.map((patient, idx) => {
    const id = patient.id
    const h = hashStr(`${id}|cont`)
    const over = raw.instances[id] || {}

    const nurse =
      over.nurseAssigned?.trim() ||
      patient.assignedNurse?.trim() ||
      ['R.N. Patel', 'LPN Santos', 'R.N. Kim', 'R.N. Nguyen'][idx % 4]

    const toiletAssistanceNeeded =
      over.toiletAssistanceNeeded ||
      patient.toiletAssistance ||
      ['Independent', 'Stand-by assist', 'Full assist', 'Incontinent — diaper'][h % 4]

    const urinationFrequency =
      over.urinationFrequency ||
      (h % 17 === 0 ? 'Hourly' : h % 11 === 0 ? 'Frequent' : h % 9 === 0 ? 'Increased' : 'Normal')

    const bowelMovementStatus =
      over.bowelMovementStatus ||
      (h % 23 === 0 ? 'None documented ×48h' : h % 19 === 0 ? 'Irregular' : 'Regular')

    const stoolConsistency =
      over.stoolConsistency ||
      (h % 29 === 0 ? 'Hard' : h % 21 === 0 ? 'Watery' : h % 13 === 0 ? 'Loose' : 'Formed')

    const urineColorObservation =
      over.urineColorObservation ||
      (h % 31 === 0 ? 'Dark amber' : h % 27 === 0 ? 'Cloudy' : h % 33 === 0 ? 'Pink tinge' : 'Yellow')

    const constipationRisk =
      over.constipationRisk ||
      (stoolConsistency === 'Hard' || /none documented/i.test(bowelMovementStatus)
        ? 'High'
        : h % 14 === 0
          ? 'Moderate'
          : 'Low')

    const skinIrritation =
      over.skinIrritation ||
      (/diaper|incontinent/i.test(toiletAssistanceNeeded) && h % 7 === 0
        ? 'Mild'
        : h % 37 === 0
          ? 'Moderate'
          : 'None')

    return {
      patientId: id,
      patientName: patient.fullName || 'Unknown',
      room: over.room || roomForPatient(id, idx + 1),
      toiletAssistanceNeeded,
      urinationFrequency,
      bowelMovementStatus,
      nextDiaperChangeDueAt:
        over.nextDiaperChangeDueAt ||
        new Date(nowMs + ((h % 55) - 5) * 60000).toISOString(),
      lastDiaperChangeAt:
        over.lastDiaperChangeAt ||
        new Date(nowMs - ((h % 18) + 1) * 3600000).toISOString(),
      incontinenceEpisodes:
        typeof over.incontinenceEpisodes === 'number' ? over.incontinenceEpisodes : h % 5,
      stoolConsistency,
      urineColorObservation,
      constipationRisk,
      skinIrritation,
      nurseAssigned: nurse,
      lastContinenceCheckAt:
        over.lastContinenceCheckAt ||
        new Date(nowMs - ((h % 30) + 1) * 3600000).toISOString(),
      nextDueAt:
        over.nextDueAt || new Date(nowMs + ((h % 60) - 10) * 60000).toISOString(),
      notes: Array.isArray(over.notes) ? over.notes : [],
      escalatedConstipation: Boolean(over.escalatedConstipation),
      doctorReviewNeeded: Boolean(over.doctorReviewNeeded),
    }
  })
}

export function upsertContinencePatient(patientId, patch) {
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  raw.instances[patientId] = { ...prev, ...patch }
  saveRaw(raw)
  emitContinenceLoopUpdate()
}

export function appendContinenceNote(patientId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  const notes = Array.isArray(prev.notes) ? [...prev.notes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  raw.instances[patientId] = { ...prev, notes: notes.slice(-16) }
  saveRaw(raw)
  emitContinenceLoopUpdate()
}
