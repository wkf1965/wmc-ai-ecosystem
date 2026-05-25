/**
 * Side Turning State — per-room tracking
 *
 * Stores the last recorded turning position, nurse, and timestamp for each
 * room. Used to:
 *   - Display last/next turning in /turn_status
 *   - Detect overdue turns (> 2 h since last)
 *   - Avoid re-saving sheet rows for the same room/position within 5 minutes
 *
 * State is backed by a JSON file so it survives bot restarts.
 *
 * Shape per roomKey (e.g. "room_2"):
 * {
 *   room_number:  string,
 *   patient_name: string,
 *   position:     "LEFT" | "RIGHT" | "SUPINE" | "PRONE" | "DONE",
 *   nurse_name:   string,
 *   timestamp:    string   ISO-8601 — when the turn was recorded
 *   next_due:     string   ISO-8601 — timestamp + 2 h
 *   status:       "OK" | "DUE" | "OVERDUE"
 *   chatId:       string   — last chatId that sent a turn command (for reminders)
 *   savedAt:      string   ISO-8601
 * }
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname }                                   from 'path'
import { fileURLToPath }                                      from 'url'

const __dir    = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dir, '../data')
const FILE     = resolve(DATA_DIR, 'sideTurning.json')

/** @type {Map<string, object>} roomKey → room state */
const map = new Map()

// ── Load from disk ────────────────────────────────────────────────────────────

try {
  if (existsSync(FILE)) {
    const entries = JSON.parse(readFileSync(FILE, 'utf8'))
    for (const [k, v] of Object.entries(entries ?? {})) map.set(k, v)
  }
} catch { /* fresh start */ }

// ── Helpers ───────────────────────────────────────────────────────────────────

function persist() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(FILE, JSON.stringify(Object.fromEntries(map), null, 2), 'utf8')
  } catch { /* non-fatal */ }
}

/** Normalise room number to a consistent Map key. */
export function roomKey(roomNumber) {
  return `room_${String(roomNumber).toLowerCase().trim()}`
}

/** +2 hours from a given Date (or now). */
export function nextDueDate(fromDate = new Date()) {
  return new Date(fromDate.getTime() + 2 * 60 * 60 * 1000)
}

/**
 * Compute the current status string from a state object.
 * OK     = now < next_due
 * DUE    = now >= next_due, but < next_due + 30 min
 * OVERDUE= now >= next_due + 30 min
 */
export function computeStatus(state) {
  if (!state?.next_due) return 'UNKNOWN'
  const now     = Date.now()
  const due     = new Date(state.next_due).getTime()
  if (now < due) return 'OK'
  if (now < due + 30 * 60 * 1000) return 'DUE'
  return 'OVERDUE'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a new turning record for a room.
 *
 * @param {string}  roomNumber
 * @param {string}  position      LEFT | RIGHT | SUPINE | PRONE | DONE
 * @param {string}  patientName   resolved or supplied by nurse
 * @param {string}  nurseName     "@username" or first name
 * @param {string}  chatId        Telegram chat id (for overdue reminders)
 */
export function recordTurn(roomNumber, position, patientName, nurseName, chatId) {
  const now  = new Date()
  const next = nextDueDate(now)
  const state = {
    room_number:  String(roomNumber),
    patient_name: patientName || `Room ${roomNumber}`,
    position,
    nurse_name:   nurseName,
    timestamp:    now.toISOString(),
    next_due:     next.toISOString(),
    status:       'OK',
    chatId:       String(chatId),
    savedAt:      now.toISOString(),
  }
  map.set(roomKey(roomNumber), state)
  persist()
  return state
}

/** Get the current state for a room (with live-computed status). */
export function getRoomState(roomNumber) {
  const state = map.get(roomKey(roomNumber))
  if (!state) return null
  return { ...state, status: computeStatus(state) }
}

/** All rooms with a computed status. */
export function getAllRooms() {
  return [...map.entries()].map(([, s]) => ({ ...s, status: computeStatus(s) }))
}

/** All rooms that are currently DUE or OVERDUE. */
export function getOverdueRooms() {
  return getAllRooms().filter((s) => s.status === 'DUE' || s.status === 'OVERDUE')
}

/** Remove a room's state. */
export function clearRoom(roomNumber) {
  map.delete(roomKey(roomNumber))
  persist()
}

/**
 * Try to find an existing patient name for a room from the current state.
 * Returns null if not found.
 */
export function getCachedPatientName(roomNumber) {
  return map.get(roomKey(roomNumber))?.patient_name ?? null
}
