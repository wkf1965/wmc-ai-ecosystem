import { MED_LOOP_ROOM_MAP } from '../data/medicationLoopSeed.js'

export const REHABILITATION_LOOP_STORAGE_KEY = 'wmc_rehabilitation_loop_v1'

function todayLocalStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** @typedef {'physiotherapy'|'occupational_therapy'|'speech_therapy'} RehabType */

function loadRaw() {
  try {
    const raw = localStorage.getItem(REHABILITATION_LOOP_STORAGE_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: {
          improving: 0,
          stable: 0,
          declining: 0,
          highRecoveryPotential: 0,
          doctorReviewNeeded: 0,
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
        declining: p.scores?.declining ?? 0,
        highRecoveryPotential: p.scores?.highRecoveryPotential ?? 0,
        doctorReviewNeeded: p.scores?.doctorReviewNeeded ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: {
        improving: 0,
        stable: 0,
        declining: 0,
        highRecoveryPotential: 0,
        doctorReviewNeeded: 0,
      },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(REHABILITATION_LOOP_STORAGE_KEY, JSON.stringify(data))
}

export function emitRehabilitationLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-rehabilitation-loop-updated'))
}

export function ensureRehabilitationBaseline() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = {
    improving: 31,
    stable: 44,
    declining: 14,
    highRecoveryPotential: 19,
    doctorReviewNeeded: 8,
  }
  saveRaw(raw)
  return raw.baseline
}

export function readRehabilitationLoopRaw() {
  return loadRaw()
}

export function bumpRehabilitationScore(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitRehabilitationLoopUpdate()
}

function roomForPatient(id, idx) {
  return MED_LOOP_ROOM_MAP[id] || `TBD-${String(idx).padStart(3, '0')}`
}

const REHAB_TYPES = /** @type {const} */ ([
  'physiotherapy',
  'occupational_therapy',
  'speech_therapy',
])

/** @param {'improving'|'stable'|'declining'} trend */
function weeklyFunctionalSeries(h, trend) {
  const base = 42 + (h % 28)
  const series = []
  for (let i = 0; i < 8; i++) {
    const step = trend === 'improving' ? 2.4 : trend === 'declining' ? -2.1 : 0.35
    let v = base + i * step + ((h >> i) % 5)
    series.push(Math.max(18, Math.min(98, Math.round(v))))
  }
  return series
}

function rehabTypeFromPatient(rehabStatus, h) {
  const rs = String(rehabStatus || '').toLowerCase()
  if (/speech|slp|dysphag|language/i.test(rs)) return 'speech_therapy'
  if (/occup|ot\b|adl/i.test(rs)) return 'occupational_therapy'
  if (/physio|pt\b|ambulation|ortho/i.test(rs)) return 'physiotherapy'
  return REHAB_TYPES[h % REHAB_TYPES.length]
}

export function mergeRehabilitationLoopRows(patients, nowMs = Date.now()) {
  ensureRehabilitationBaseline()
  const raw = loadRaw()
  const today = todayLocalStr(new Date(nowMs))

  if (!patients?.length) return []

  return patients.map((patient, idx) => {
    const id = patient.id
    const h = hashStr(`${id}|rehab`)
    const over = raw.instances[id] || {}

    const rehabType = /** @type {RehabType} */ (
      over.rehabType || rehabTypeFromPatient(patient.rehabilitationStatus, h)
    )

    const progressTrend = /** @type {'improving'|'stable'|'declining'} */ (
      over.progressTrend ||
        (h % 17 === 0 ? 'declining' : h % 11 === 0 ? 'improving' : 'stable')
    )

    const recoveryPotential = /** @type {'high'|'moderate'|'low'} */ (
      over.recoveryPotential ||
        (patient.rehabilitationStatus?.includes('Active') && h % 4 !== 0
          ? 'high'
          : h % 7 === 0
            ? 'low'
            : 'moderate')
    )

    const rehabPlateau = Boolean(over.rehabPlateau ?? (h % 23 === 0))

    let missedSessionsWeek = over.missedSessionsWeek ?? (h % 9 === 0 ? 2 : h % 13 === 0 ? 1 : 0)
    let sessionsCompletedWeek =
      typeof over.sessionsCompletedWeek === 'number' ? over.sessionsCompletedWeek : 2 + (h % 4)

    const therapist =
      over.therapistAssigned?.trim() ||
      ['PT Rivera', 'OT Nguyen', 'SLP Chen', 'PT Adebayo'][idx % 4]

    const balanceScore =
      typeof over.balanceScore === 'number' ? over.balanceScore : Math.min(10, 4 + (h % 6))
    const painScore = typeof over.painScore === 'number' ? over.painScore : Math.min(10, 2 + (h % 6))
    const walkingDistanceM =
      typeof over.walkingDistanceM === 'number'
        ? over.walkingDistanceM
        : rehabType === 'physiotherapy'
          ? 40 + (h % 110)
          : 25 + (h % 60)

    return {
      patientId: id,
      patientName: patient.fullName || 'Unknown',
      room: over.room || roomForPatient(id, idx + 1),
      diagnosis:
        over.diagnosis?.trim() ||
        patient.diagnosis ||
        'Diagnosis not documented — simulation placeholder',
      rehabType,
      therapyMinutesLastSession:
        typeof over.therapyMinutesLastSession === 'number' ? over.therapyMinutesLastSession : 25 + (h % 35),
      walkingDistanceM,
      transferAbility:
        over.transferAbility ||
        ['Independent', 'Stand-by', 'Contact guard', 'Mod assist', 'Max assist'][h % 5],
      balanceScore,
      muscleStrength: over.muscleStrength || `${3 + (h % 3)}/5 key groups`,
      painScore,
      adlIndependence:
        typeof over.adlIndependence === 'number' ? over.adlIndependence : 48 + (h % 40),
      speechProgress:
        typeof over.speechProgress === 'number'
          ? over.speechProgress
          : rehabType === 'speech_therapy'
            ? 40 + (h % 45)
            : 50 + (h % 20),
      therapistAssigned: therapist,
      nextSessionDueAt:
        over.nextSessionDueAt ||
        new Date(nowMs + ((h % 55) - 10) * 60000).toISOString(),
      lastSessionAt:
        over.lastSessionAt ||
        new Date(nowMs - ((h % 50) + 8) * 3600000).toISOString(),
      missedSessionsWeek,
      sessionsCompletedWeek,
      progressTrend,
      recoveryPotential,
      rehabPlateau,
      notes: Array.isArray(over.notes) ? over.notes : [],
      escalatedDoctorReview: Boolean(over.escalatedDoctorReview),
      lastSessionCompleted: Boolean(over.lastSessionCompleted),
      lastSessionDay: over.lastSessionDay || today,
      mentalStatusSnap: patient.mentalStatus || 'See chart',
      fallRiskSnap: patient.fallRisk || 'Moderate',
      functionalSeries: Array.isArray(over.functionalSeries)
        ? over.functionalSeries
        : weeklyFunctionalSeries(h, progressTrend),
    }
  })
}

export function upsertRehabilitationPatient(patientId, patch) {
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  raw.instances[patientId] = { ...prev, ...patch }
  saveRaw(raw)
  emitRehabilitationLoopUpdate()
}

export function appendRehabilitationNote(patientId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  const notes = Array.isArray(prev.notes) ? [...prev.notes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  raw.instances[patientId] = { ...prev, notes: notes.slice(-16) }
  saveRaw(raw)
  emitRehabilitationLoopUpdate()
}
