import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'

export const WOUND_CARE_LOOP_STORAGE_KEY = 'wmc_wound_care_loop_v1'

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(WOUND_CARE_LOOP_STORAGE_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: {
          improving: 0,
          stable: 0,
          worsening: 0,
          infectionRisk: 0,
          urgentReview: 0,
        },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      instances: p.instances && typeof p.instances === 'object' ? p.instances : {},
      scores: {
        improving: p.scores?.improving ?? 0,
        stable: p.scores?.stable ?? 0,
        worsening: p.scores?.worsening ?? 0,
        infectionRisk: p.scores?.infectionRisk ?? 0,
        urgentReview: p.scores?.urgentReview ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: {
        improving: 0,
        stable: 0,
        worsening: 0,
        infectionRisk: 0,
        urgentReview: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(WOUND_CARE_LOOP_STORAGE_KEY, JSON.stringify(data))
}

export function emitWoundCareLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-wound-care-loop-updated'))
}

export function ensureWoundCareBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { improving: 26, stable: 48, worsening: 12, infectionRisk: 9, urgentReview: 5 }
  saveRaw(raw)
  return raw.baseline
}

export function readWoundCareLoopRaw() {
  return loadRaw()
}

export function bumpWoundCareScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitWoundCareLoopUpdate()
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

const WOUND_TYPES = [
  'Pressure injury — stage II',
  'Post-surgical incision',
  'Diabetic foot ulcer',
  'Skin tear',
  'Moisture-associated damage',
  'Venous leg ulcer',
]

const LOCATIONS = ['Sacrum', 'Right heel', 'Left lateral malleolus', 'Upper back', 'Abdomen', 'Right hip']

export function mergeWoundCareLoopRows(patients, nowMs = Date.now()) {
  ensureWoundCareBaseline()
  const raw = loadRaw()

  if (!patients?.length) {
    const id = 'demo'
    const over = raw.instances[id] || {}
    return [
      {
        patientId: id,
        patientName: 'Demo Resident',
        room: '100A',
        woundLocation: over.woundLocation ?? 'Sacrum',
        woundType: over.woundType ?? 'Pressure injury — stage II',
        woundSize: over.woundSize ?? '3.2 × 2.0 cm',
        redness: over.redness ?? 'Moderate',
        swelling: over.swelling ?? 'Mild',
        discharge: over.discharge ?? 'Minimal serous',
        odor: over.odor ?? 'None',
        painScore: typeof over.painScore === 'number' ? over.painScore : 4,
        dressingDueAt: over.dressingDueAt ?? new Date(nowMs + 40 * 60000).toISOString(),
        lastDressingAt: over.lastDressingAt ?? new Date(nowMs - 4 * 3600000).toISOString(),
        nurseAssigned: over.nurseAssigned ?? 'Demo Nurse',
        photoUploaded: Boolean(over.photoUploaded),
        mockPhotoFilename: over.mockPhotoFilename ?? null,
        notes: Array.isArray(over.notes) ? over.notes : [],
        escalatedInfection: Boolean(over.escalatedInfection),
        doctorReviewNeeded: Boolean(over.doctorReviewNeeded),
        healingTrend: /** @type {'improving'|'stable'|'worsening'} */ (over.healingTrend ?? 'stable'),
        pressureRiskSnap: over.pressureRiskSnap ?? 'Moderate',
      },
    ]
  }

  return patients.map((patient, idx) => {
    const id = patient.id
    const h = hashStr(`${id}|wound`)
    const over = raw.instances[id] || {}

    const nurse =
      over.nurseAssigned?.trim() ||
      patient.assignedNurse?.trim() ||
      ['R.N. Patel', 'LPN Santos', 'R.N. Kim', 'R.N. Nguyen'][idx % 4]

    const rednessRoll = h % 10
    const redness =
      over.redness ||
      (rednessRoll >= 8 ? 'Severe' : rednessRoll >= 5 ? 'Moderate' : 'Mild')

    const discharge =
      over.discharge ||
      (h % 17 === 0 ? 'Purulent' : h % 11 === 0 ? 'Serosanguinous' : 'Minimal serous')

    const odor = over.odor || (h % 19 === 0 ? 'Foul' : h % 13 === 0 ? 'Mild' : 'None')

    const swelling = over.swelling || ['None', 'Mild', 'Moderate'][h % 3]

    return {
      patientId: id,
      patientName: patient.fullName || 'Unknown',
      room: over.room || roomForPatient(id, idx + 1),
      woundLocation: over.woundLocation || LOCATIONS[h % LOCATIONS.length],
      woundType: over.woundType || WOUND_TYPES[h % WOUND_TYPES.length],
      woundSize: over.woundSize || `${(1 + (h % 8) / 2).toFixed(1)} × ${(1 + (h % 6) / 3).toFixed(1)} cm`,
      redness,
      swelling,
      discharge,
      odor,
      painScore: typeof over.painScore === 'number' ? over.painScore : Math.min(10, 2 + (h % 7)),
      dressingDueAt:
        over.dressingDueAt || new Date(nowMs + ((h % 50) - 8) * 60000).toISOString(),
      lastDressingAt:
        over.lastDressingAt || new Date(nowMs - ((h % 36) + 2) * 3600000).toISOString(),
      nurseAssigned: nurse,
      photoUploaded: Boolean(over.photoUploaded ?? (h % 15 === 0)),
      mockPhotoFilename: over.mockPhotoFilename ?? null,
      notes: Array.isArray(over.notes) ? over.notes : [],
      escalatedInfection: Boolean(over.escalatedInfection),
      doctorReviewNeeded: Boolean(over.doctorReviewNeeded),
      healingTrend: /** @type {'improving'|'stable'|'worsening'} */ (
        over.healingTrend || (h % 14 === 0 ? 'worsening' : h % 9 === 0 ? 'improving' : 'stable')
      ),
      pressureRiskSnap: patient.pressureSoreRisk || 'Moderate',
    }
  })
}

export function upsertWoundCarePatient(patientId, patch) {
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  raw.instances[patientId] = { ...prev, ...patch }
  saveRaw(raw)
  emitWoundCareLoopUpdate()
}

export function appendWoundCareNote(patientId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  const notes = Array.isArray(prev.notes) ? [...prev.notes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  raw.instances[patientId] = { ...prev, notes: notes.slice(-16) }
  saveRaw(raw)
  emitWoundCareLoopUpdate()
}
