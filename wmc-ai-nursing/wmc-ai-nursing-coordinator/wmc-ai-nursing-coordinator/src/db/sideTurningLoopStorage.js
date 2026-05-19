export const SIDE_TURNING_LOOP_STORAGE_KEY = 'wmc_side_turning_loop_v1'

const roomSeedMap = {
  p1: '302A',
  p2: '318C',
  p3: '214B',
  p4: '221D',
  p5: '305A',
}

const bedSeed = ['12-A', '12-B', '03', '07', 'B-2', '14']

function roomForPatient(id, fallbackIndex = 1) {
  if (!id) return `TBD-${fallbackIndex}`
  return roomSeedMap[id] || `TBD-${String(fallbackIndex).padStart(3, '0')}`
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(SIDE_TURNING_LOOP_STORAGE_KEY)
    if (!raw) {
      return {
        instances: {},
        scores: { onTime: 0, late: 0, missed: 0, photoUploaded: 0, skinChecked: 0 },
        baseline: null,
      }
    }
    const p = JSON.parse(raw)
    return {
      instances: p.instances && typeof p.instances === 'object' ? p.instances : {},
      scores: {
        onTime: p.scores?.onTime ?? 0,
        late: p.scores?.late ?? 0,
        missed: p.scores?.missed ?? 0,
        photoUploaded: p.scores?.photoUploaded ?? 0,
        skinChecked: p.scores?.skinChecked ?? 0,
      },
      baseline: p.baseline || null,
    }
  } catch {
    return {
      instances: {},
      scores: { onTime: 0, late: 0, missed: 0, photoUploaded: 0, skinChecked: 0 },
      baseline: null,
    }
  }
}

function saveRaw(data) {
  localStorage.setItem(SIDE_TURNING_LOOP_STORAGE_KEY, JSON.stringify(data))
}

export function emitSideTurningLoopUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-side-turning-loop-updated'))
}

export function ensureBaselineScores() {
  const raw = loadRaw()
  if (raw.baseline) return raw.baseline
  raw.baseline = { onTime: 42, late: 11, missed: 5, photoUploaded: 28, skinChecked: 33 }
  saveRaw(raw)
  return raw.baseline
}

export function readSideTurningLoopRaw() {
  return loadRaw()
}

export function bumpScoreField(field, delta = 1) {
  const raw = loadRaw()
  raw.scores[field] = (raw.scores[field] ?? 0) + delta
  saveRaw(raw)
  emitSideTurningLoopUpdate()
}

export function mergeSideTurningLoopRows(patients) {
  ensureBaselineScores()
  const raw = loadRaw()
  const INTERVAL = 120
  const positions = ['left', 'right', 'supine']

  return patients.map((patient, idx) => {
    const id = patient.id
    const h = hashStr(`${id}|stl`)
    const over = raw.instances[id] || {}
    const room = over.room || roomForPatient(id, idx + 1)
    const bedNumber = over.bedNumber || bedSeed[h % bedSeed.length]
    const pressure = patient.pressureSoreRisk || 'Moderate'
    const fall = patient.fallRisk || 'Moderate'
    const riskLevel = `${fall} fall · ${pressure} pressure`
    const nurse =
      over.nurseAssigned?.trim() ||
      patient.assignedNurse?.trim() ||
      ['R.N. Patel', 'LPN Santos', 'R.N. Kim', 'R.N. Nguyen'][idx % 4]

    const skins = ['Intact', 'Intact', 'Mild erythema sacrum', 'Dry, intact', 'Warm, intact']
    const skinCondition = over.skinCondition || skins[h % skins.length]

    const now = Date.now()
    const intervalMs = INTERVAL * 60 * 1000
    let nextDueAt = over.nextDueAt
    let lastTurnedAt = over.lastTurnedAt
    if (!nextDueAt || !lastTurnedAt) {
      const phase = ((h % 13) / 13 - 0.4) * intervalMs
      nextDueAt = new Date(now + phase).toISOString()
      lastTurnedAt = new Date(new Date(nextDueAt).getTime() - intervalMs * 0.75).toISOString()
    }

    const currentPosition = over.currentPosition || positions[h % positions.length]
    const overdueStreak = typeof over.overdueStreak === 'number' ? over.overdueStreak : h % 4 === 0 ? 2 : 0
    const snoozeUntil = over.snoozeUntil || null
    const woundEscalated = Boolean(over.woundEscalated)
    const skinObservations = Array.isArray(over.skinObservations) ? over.skinObservations : []
    const lastPhotoLabel = over.lastPhotoLabel || null
    const lastPhotoAt = over.lastPhotoAt || null

    return {
      patientId: id,
      patientName: patient.fullName || 'Unknown',
      room,
      bedNumber,
      riskLevel,
      pressureSoreRisk: pressure,
      fallRisk: fall,
      lastTurnedAt,
      nextDueAt,
      currentPosition,
      nurseAssigned: nurse,
      skinCondition,
      intervalMinutes: INTERVAL,
      snoozeUntil,
      overdueStreak,
      woundEscalated,
      skinObservations,
      lastPhotoLabel,
      lastPhotoAt,
    }
  })
}

export function upsertSideTurningLoopPatient(patientId, patch) {
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  raw.instances[patientId] = { ...prev, ...patch }
  saveRaw(raw)
  emitSideTurningLoopUpdate()
}

export function appendSkinObservation(patientId, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const prev = raw.instances[patientId] || {}
  const list = Array.isArray(prev.skinObservations) ? [...prev.skinObservations] : []
  list.push({ at: new Date().toISOString(), text: trimmed })
  raw.instances[patientId] = {
    ...prev,
    skinObservations: list.slice(-14),
    skinCondition: prev.skinCondition || trimmed.slice(0, 48),
  }
  saveRaw(raw)
  bumpScoreField('skinChecked', 1)
}
