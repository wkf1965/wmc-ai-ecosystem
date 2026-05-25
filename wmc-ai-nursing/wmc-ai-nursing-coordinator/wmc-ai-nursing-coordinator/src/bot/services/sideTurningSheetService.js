/**
 * Side Turning Sheet Service
 *
 * Reads recent records from the "side_turning" Google Sheet tab.
 *
 * Column layout (8 columns):
 *   [A] timestamp
 *   [B] room_number
 *   [C] patient_name
 *   [D] turning_position
 *   [E] nurse_name
 *   [F] next_turning_due
 *   [G] status
 *   [H] source
 *
 * Row 1 is the header row. Data starts at row 2.
 *
 * Write operations are handled by saveSideTurningRecord() in googleSheetService.js.
 */

import { google } from 'googleapis'
import { log }    from '../utils/logger.js'

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

function getSheetId() {
  return process.env.GOOGLE_SHEET_ID ?? ''
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapSideTurningRow(row) {
  return {
    timestamp:        row[0] ?? '',
    room_number:      row[1] ?? '',
    patient_name:     row[2] ?? '',
    turning_position: row[3] ?? '',
    nurse_name:       row[4] ?? '',
    next_turning_due: row[5] ?? '',
    status:           row[6] ?? '',
    source:           row[7] ?? '',
  }
}

// ── Core read ─────────────────────────────────────────────────────────────────

async function readRows(range) {
  const sheetId = getSheetId()
  if (!sheetId) {
    log.warn('[side-turning-sheet] GOOGLE_SHEET_ID not set — skipping read')
    return []
  }
  try {
    const auth   = createAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const res    = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    })
    const rows = res.data.values ?? []
    return rows.slice(1)   // skip header row
  } catch (err) {
    log.error('[side-turning-sheet] read error:', err.message)
    return []
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch the last N turning records for a given room.
 *
 * @param {string|number} roomNumber
 * @param {number}        limit       max rows to consider (scans from oldest)
 * @returns {object[]}   most-recent-first
 */
export async function getRecentTurningsForRoom(roomNumber, limit = 200) {
  const rows = await readRows(`side_turning!A2:H${limit + 1}`)
  const room = String(roomNumber).trim()
  return rows
    .map(mapSideTurningRow)
    .filter((r) => String(r.room_number).trim() === room)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

/**
 * Fetch all turning records for today (based on ISO timestamp prefix = today's date).
 *
 * @returns {object[]}
 */
export async function getTodayTurnings() {
  const today = new Date().toISOString().slice(0, 10)   // "YYYY-MM-DD"
  const rows  = await readRows('side_turning!A2:H1000')
  return rows
    .map(mapSideTurningRow)
    .filter((r) => r.timestamp.startsWith(today))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

/**
 * Get the single most-recent record for a room from the sheet.
 * Useful for /turn_status when the in-memory state has been cleared after a restart.
 *
 * @param {string|number} roomNumber
 * @returns {object|null}
 */
export async function getLastTurningFromSheet(roomNumber) {
  const records = await getRecentTurningsForRoom(roomNumber, 200)
  return records.length > 0 ? records[0] : null
}
