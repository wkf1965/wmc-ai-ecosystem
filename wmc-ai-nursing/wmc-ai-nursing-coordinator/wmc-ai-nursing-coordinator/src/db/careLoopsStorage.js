import { CARE_LOOP_TYPES } from '../data/careLoopTypes.js'

export const CARE_LOOPS_STORAGE_KEY = 'wmc_care_loops_v1'

const roomSeedMap = {
  p1: '302A',
  p2: '318C',
  p3: '214B',
  p4: '221D',
  p5: '305A',
}

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
    const raw = localStorage.getItem(CARE_LOOPS_STORAGE_KEY)
    if (!raw) return { instances: {}, history: [], baselineStats: null }
    const parsed = JSON.parse(raw)
    return {
      instances: parsed.instances && typeof parsed.instances === 'object' ? parsed.instances : {},
      history: Array.isArray(parsed.history) ? parsed.history : [],
      baselineStats: parsed.baselineStats || null,
    }
  } catch {
    return { instances: {}, history: [], baselineStats: null }
  }
}

function saveRaw(data) {
  localStorage.setItem(CARE_LOOPS_STORAGE_KEY, JSON.stringify(data))
}

function emitUpdate() {
  window.dispatchEvent(new CustomEvent('wmc-care-loops-updated'))
}

export function loopInstanceKey(patientId, loopTypeId) {
  return `${patientId}::${loopTypeId}`
}

/** @param {string} patientId @param {string} loopTypeId @param {number} intervalMinutes */
export function seedNextDueAt(patientId, loopTypeId, intervalMinutes) {
  const now = Date.now()
  const intervalMs = intervalMinutes * 60 * 1000
  const h = hashStr(`${patientId}|${loopTypeId}`)
  const frac = (h % 997) / 997
  const skewMs = Math.floor(frac * intervalMs)
  const phases = [-0.35 * intervalMs, 0.08 * intervalMs, 0.55 * intervalMs, -0.12 * intervalMs, 0.92 * intervalMs]
  const phase = phases[h % phases.length]
  const nextDue = new Date(now + phase + (skewMs % Math.max(1, Math.floor(intervalMs / 4))))
  return nextDue.toISOString()
}

export function seedLastCompletedAt(nextDueIso, intervalMinutes, patientId, loopTypeId) {
  const next = new Date(nextDueIso).getTime()
  const intervalMs = intervalMinutes * 60 * 1000
  const segmentStart = next - intervalMs
  const h = hashStr(`${patientId}|${loopTypeId}|lc`)
  const roll = h % 100
  if (roll < 34) return new Date(segmentStart + (h % 120) * 1000).toISOString()
  if (roll < 67) return new Date(segmentStart - (20 + (h % 50)) * 60 * 1000).toISOString()
  return new Date(segmentStart - intervalMs - (h % 45) * 60 * 1000).toISOString()
}

export function buildDefaultInstanceRecord(patient, loopType, patientIndex) {
  const intervalMinutes = loopType.intervalMinutes
  const nextDueAt = seedNextDueAt(patient.id, loopType.id, intervalMinutes)
  const lastCompletedAt = seedLastCompletedAt(nextDueAt, intervalMinutes, patient.id, loopType.id)
  const nurse =
    patient.assignedNurse?.trim() ||
    ['R.N. Patel', 'LPN Santos', 'R.N. Kim', 'R.N. Nguyen'][patientIndex % 4]
  return {
    patientId: patient.id,
    patientName: patient.fullName || 'Unknown',
    room: roomForPatient(patient.id, patientIndex + 1),
    loopTypeId: loopType.id,
    loopTypeLabel: loopType.label,
    intervalMinutes,
    lastCompletedAt,
    nextDueAt,
    snoozeUntil: null,
    escalated: false,
    overdueStreak: 0,
    notes: [],
    nurseInCharge: nurse,
    fallRisk: patient.fallRisk || 'Moderate',
    pressureRisk: patient.pressureSoreRisk || 'Moderate',
  }
}

export function mergeInstances(patients) {
  const raw = loadRaw()
  const merged = []
  patients.forEach((patient, idx) => {
    CARE_LOOP_TYPES.forEach((loopType) => {
      const key = loopInstanceKey(patient.id, loopType.id)
      const defaults = buildDefaultInstanceRecord(patient, loopType, idx)
      const over = raw.instances[key] || {}
      merged.push({
        ...defaults,
        ...over,
        patientId: patient.id,
        patientName: patient.fullName || defaults.patientName,
        room: over.room || defaults.room,
        loopTypeId: loopType.id,
        loopTypeLabel: loopType.label,
        intervalMinutes: loopType.intervalMinutes,
        nurseInCharge: over.nurseInCharge || defaults.nurseInCharge,
        notes: Array.isArray(over.notes) ? over.notes : defaults.notes || [],
      })
    })
  })
  return merged
}

export function readCareLoopsRaw() {
  return loadRaw()
}

export function upsertLoopInstance(key, patch) {
  const raw = loadRaw()
  const prev = raw.instances[key] || {}
  raw.instances[key] = { ...prev, ...patch }
  saveRaw(raw)
  emitUpdate()
}

export function appendLoopNote(key, text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return
  const raw = loadRaw()
  const prev = raw.instances[key] || {}
  const notes = Array.isArray(prev.notes) ? [...prev.notes] : []
  notes.push({ at: new Date().toISOString(), text: trimmed })
  raw.instances[key] = { ...prev, notes: notes.slice(-12) }
  saveRaw(raw)
  emitUpdate()
}

export function appendScoreHistory(entry) {
  const raw = loadRaw()
  raw.history = [...(raw.history || []), entry].slice(-400)
  saveRaw(raw)
  emitUpdate()
}

/** Demo baseline when user has not accrued history yet */
export function ensureBaselineStats() {
  const raw = loadRaw()
  if (raw.baselineStats) return raw.baselineStats
  raw.baselineStats = { onTime: 14, late: 5, missed: 3, escalated: 1 }
  saveRaw(raw)
  return raw.baselineStats
}

export function scoreCountsFromHistory(patients) {
  const raw = loadRaw()
  const baseline = raw.baselineStats || { onTime: 0, late: 0, missed: 0, escalated: 0 }
  const counts = { onTime: baseline.onTime, late: baseline.late, missed: baseline.missed, escalated: baseline.escalated }
  const allowed = new Set()
  patients.forEach((p) => {
    CARE_LOOP_TYPES.forEach((t) => allowed.add(loopInstanceKey(p.id, t.id)))
  })
  for (const row of raw.history || []) {
    if (!allowed.has(row.key)) continue
    const k = row.score
    if (k === 'on_time') counts.onTime += 1
    else if (k === 'late') counts.late += 1
    else if (k === 'missed') counts.missed += 1
    else if (k === 'escalated') counts.escalated += 1
  }
  return counts
}
