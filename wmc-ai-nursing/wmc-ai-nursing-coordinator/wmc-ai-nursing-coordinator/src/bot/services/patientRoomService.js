/**
 * Patient Room Service
 *
 * Reads the "Patientsroom" Google Sheet tab and returns the patient name
 * assigned to a given room number.
 *
 * Expected tab layout (row 1 = header, data from row 2):
 *   [A] room_number   — "1", "2", "10", "Room 1", etc.
 *   [B] patient_name  — full name as it should appear in records
 *   [C] status        — optional: "Active" | "Discharged" (default Active)
 *   [D] bed_number    — optional, ignored here
 *   [E+]              — any extra columns, ignored
 *
 * The service normalises room values by stripping the word "room" and
 * any whitespace, leaving just the numeric portion for matching.
 * This means "Room 2", "room2", "2" all resolve to key "2".
 *
 * Caching:
 *   Results are cached in memory for CACHE_TTL_MS (5 minutes) to avoid
 *   hitting the Sheets API on every turn command. The cache is invalidated
 *   automatically when the TTL expires, and can be cleared manually via
 *   clearPatientRoomCache().
 */

import { google } from 'googleapis'
import { log }    from '../utils/logger.js'

// ── Config ────────────────────────────────────────────────────────────────────

const TAB_NAME     = 'Patientsroom'
const CACHE_TTL_MS = 5 * 60 * 1000   // 5 minutes

// ── Auth ──────────────────────────────────────────────────────────────────────

function createAuth() {
  const email  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''
  const rawKey = process.env.GOOGLE_PRIVATE_KEY ?? ''
  const key    = rawKey.replace(/\\n/g, '\n')
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Normalise a room identifier to a plain numeric string.
 * "Room 2" → "2",  "room2" → "2",  "  3 " → "3",  "10" → "10"
 *
 * @param {string|number} raw
 * @returns {string}
 */
export function normaliseRoom(raw) {
  return String(raw ?? '')
    .replace(/room/gi, '')
    .replace(/\s+/g, '')
    .trim()
}

// ── In-memory cache ───────────────────────────────────────────────────────────

/** @type {Map<string, string>}  normalisedRoom → patientName */
let _cache      = null
let _cacheAt    = 0

function isCacheValid() {
  return _cache !== null && Date.now() - _cacheAt < CACHE_TTL_MS
}

/** Force-clear the cache (e.g. after updating the sheet). */
export function clearPatientRoomCache() {
  _cache   = null
  _cacheAt = 0
  log.info('[patient-room] cache cleared')
}

// ── Sheet reader ──────────────────────────────────────────────────────────────

/**
 * Fetch and return the full room→patient map from Google Sheets.
 * Only active patients are included (status column empty or "Active").
 *
 * @returns {Promise<Map<string, string>>}  normalisedRoom → patientName
 */
async function fetchRoomMap() {
  const sheetId = process.env.GOOGLE_SHEET_ID ?? ''
  if (!sheetId) {
    log.warn('[patient-room] GOOGLE_SHEET_ID not set — skipping lookup')
    return new Map()
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: createAuth() })
    const res    = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range:         `${TAB_NAME}!A:E`,
    })

    const rows = res.data.values ?? []
    // Detect and skip header row (first row contains non-numeric room value)
    const dataRows = rows.filter((r) => {
      const raw = String(r[0] ?? '').trim()
      return raw !== '' && !/^room[\s_]?number$/i.test(raw) && !/^room$/i.test(normaliseRoom(raw) === '' ? raw : '')
    })

    const map = new Map()
    for (const row of dataRows) {
      const rawRoom  = String(row[0] ?? '').trim()
      const patient  = String(row[1] ?? '').trim()
      const status   = String(row[2] ?? 'Active').trim()

      if (!rawRoom || !patient) continue
      // Skip discharged patients
      if (/discharged/i.test(status)) continue

      const key = normaliseRoom(rawRoom)
      if (key) map.set(key, patient)
    }

    log.info(`[patient-room] loaded ${map.size} active room assignments from sheet`)
    return map
  } catch (err) {
    log.error('[patient-room] sheet read error:', err.message)
    return new Map()
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the full room→patient map, using the cache when valid.
 *
 * @returns {Promise<Map<string, string>>}
 */
export async function getRoomPatientMap() {
  if (isCacheValid()) return _cache

  const fresh = await fetchRoomMap()
  _cache   = fresh
  _cacheAt = Date.now()
  return fresh
}

/**
 * Look up the patient name for a room number.
 * Returns null if the room is not found in the sheet.
 *
 * @param {string|number} roomNumber   accepts "2", "Room 2", "room2", 2
 * @returns {Promise<string|null>}
 */
export async function getPatientByRoom(roomNumber) {
  const map = await getRoomPatientMap()
  const key = normaliseRoom(roomNumber)
  return map.get(key) ?? null
}

/**
 * Return all room assignments as an array sorted by room number.
 * Useful for /turn_status (show all).
 *
 * @returns {Promise<Array<{ room: string, patient: string }>>}
 */
export async function getAllRoomAssignments() {
  const map = await getRoomPatientMap()
  return [...map.entries()]
    .map(([room, patient]) => ({ room, patient }))
    .sort((a, b) => {
      const na = Number(a.room), nb = Number(b.room)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      return a.room.localeCompare(b.room)
    })
}
