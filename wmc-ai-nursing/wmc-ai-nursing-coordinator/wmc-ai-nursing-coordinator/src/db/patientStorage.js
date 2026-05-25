import { PATIENT_STORAGE_KEY } from './patientSchema.js'

/** Kept for imports that expect the symbol; roster is never auto-filled with fictional rows. */
export const SEED_PATIENTS = []

const LEGACY_DEMO_PATIENT_NAMES = new Set([
  'clara nguyen',
  'david chen',
  "eleanor o'connor",
  'demo resident',
])

function nowIso() {
  return new Date().toISOString()
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function readPatientsRaw() {
  try {
    const raw = localStorage.getItem(PATIENT_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

export function writePatientsRaw(list) {
  localStorage.setItem(PATIENT_STORAGE_KEY, JSON.stringify(list))
}

function stripLegacyDemoPatients(list) {
  if (!Array.isArray(list) || list.length === 0) return []
  return list.filter((row) => {
    const fullName = String(row?.fullName || row?.name || '')
      .trim()
      .toLowerCase()
    if (!fullName) return true
    if (LEGACY_DEMO_PATIENT_NAMES.has(fullName)) return false
    // Additional guard for old synthetic labels.
    if (fullName.includes('demo') && fullName.includes('resident')) return false
    return true
  })
}

/** @deprecated Use getAllPatients — does not inject demo data */
export function ensureSeed() {
  const existing = readPatientsRaw()
  return existing && existing.length > 0 ? existing : []
}

export function getAllPatients() {
  const raw = readPatientsRaw()
  if (!Array.isArray(raw)) return []
  const cleaned = stripLegacyDemoPatients(raw)
  if (cleaned.length !== raw.length) {
    writePatientsRaw(cleaned)
  }
  return cleaned
}

export function getPatientById(id) {
  return getAllPatients().find((p) => p.id === id) ?? null
}

export function createPatient(payload) {
  const list = getAllPatients()
  const ts = nowIso()
  const record = {
    id: newId(),
    ...payload,
    createdAt: ts,
    updatedAt: ts,
  }
  list.push(record)
  writePatientsRaw(list)
  return record
}

export function updatePatient(id, payload) {
  const list = getAllPatients()
  const idx = list.findIndex((p) => p.id === id)
  if (idx === -1) return null
  const next = {
    ...list[idx],
    ...payload,
    id: list[idx].id,
    createdAt: list[idx].createdAt,
    updatedAt: nowIso(),
  }
  list[idx] = next
  writePatientsRaw(list)
  return next
}

export function deletePatient(id) {
  const list = getAllPatients()
  const next = list.filter((p) => p.id !== id)
  if (next.length === list.length) return false
  writePatientsRaw(next)
  return true
}

/** Clears local roster (does not restore fictional patients). */
export function resetPatientsToSeed() {
  writePatientsRaw([])
  return []
}
