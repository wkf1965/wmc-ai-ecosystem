import { NURSING_NOTES_STORAGE_KEY } from './nursingNoteSchema.js'

function nowIso() {
  return new Date().toISOString()
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `nn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** Kept for imports; notes are not auto-filled with fictional chart rows. */
export const SEED_NURSING_NOTES = []

export function readNotesRaw() {
  try {
    const raw = localStorage.getItem(NURSING_NOTES_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

export function writeNotesRaw(list) {
  localStorage.setItem(NURSING_NOTES_STORAGE_KEY, JSON.stringify(list))
}

/** @deprecated Does not inject demo notes — returns existing store or empty array */
export function ensureNotesSeed() {
  const existing = readNotesRaw()
  return existing && existing.length > 0 ? existing : []
}

export function getAllNursingNotes() {
  const raw = readNotesRaw()
  return Array.isArray(raw) ? raw : []
}

export function createNursingNote(payload) {
  const list = getAllNursingNotes()
  const t = nowIso()
  const record = {
    id: newId(),
    ...payload,
    createdAt: t,
    updatedAt: t,
  }
  list.push(record)
  writeNotesRaw(list)
  return record
}

export function deleteNursingNote(id) {
  const list = getAllNursingNotes()
  const next = list.filter((n) => n.id !== id)
  if (next.length === list.length) return false
  writeNotesRaw(next)
  return true
}
