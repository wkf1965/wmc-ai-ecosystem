/**
 * Attendance Sheet Service
 *
 * Reads and writes the "attendance_records" Google Sheet tab.
 *
 * Column layout (14 columns):
 *   [A] date
 *   [B] staff_name
 *   [C] telegram_username
 *   [D] normal_punch_in
 *   [E] normal_punch_out
 *   [F] ot_in
 *   [G] ot_out
 *   [H] ot_hours
 *   [I] ot_rate
 *   [J] ot_amount
 *   [K] record_status
 *   [L] approval_status
 *   [M] approved_by
 *   [N] remarks
 *
 * Row 1 is the header row. Data starts at row 2.
 *
 * Upsert logic:
 *   - Find existing row by matching date (col A) + staff_name (col B).
 *   - If found: update that row in place.
 *   - If not found: append a new row.
 */

import { google } from 'googleapis'
import { log }    from '../utils/logger.js'
import {
  buildMonthlyOtSummary,
  todayString,
} from '../../lib/attendanceCalculation.js'

// ── Auth ─────────────────────────────────────────────────────────────────────

function createAuth() {
  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  if (!email || !privateKey) throw new Error('Google credentials not configured')
  return new google.auth.JWT({
    email, key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function sid() {
  const id = process.env.GOOGLE_SHEET_ID ?? ''
  if (!id) throw new Error('GOOGLE_SHEET_ID not configured')
  return id
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

/** Read ALL rows from a tab including the header, as raw string arrays. */
async function readAllRows(tabName) {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range:         `${tabName}!A:N`,
  })
  return res.data.values ?? []
}

/** Append a new row to the tab. */
async function appendRow(tabName, values) {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  await sheets.spreadsheets.values.append({
    spreadsheetId:    sid(),
    range:            `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: [values] },
  })
}

/** Update a specific row by 1-based row number. */
async function updateRow(tabName, rowNumber, values) {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  await sheets.spreadsheets.values.update({
    spreadsheetId:    sid(),
    range:            `${tabName}!A${rowNumber}:N${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values: [values] },
  })
}

// ── Column mapper ─────────────────────────────────────────────────────────────

const colMap = (r) => ({
  date:               r[0]  ?? '',
  staff_name:         r[1]  ?? '',
  telegram_username:  r[2]  ?? '',
  normal_punch_in:    r[3]  ?? '',
  normal_punch_out:   r[4]  ?? '',
  ot_in:              r[5]  ?? '',
  ot_out:             r[6]  ?? '',
  ot_hours:           Number(r[7]  ?? 0),
  ot_rate:            Number(r[8]  ?? 10),
  ot_amount:          Number(r[9]  ?? 0),
  record_status:      r[10] ?? '',
  approval_status:    r[11] ?? 'Pending',
  approved_by:        r[12] ?? '',
  remarks:            r[13] ?? '',
})

function toRow(record) {
  return [
    record.date               ?? '',
    record.staff_name         ?? '',
    record.telegram_username  ?? '',
    record.normal_punch_in    ?? '',
    record.normal_punch_out   ?? '',
    record.ot_in              ?? '',
    record.ot_out             ?? '',
    record.ot_hours           ?? 0,
    record.ot_rate            ?? 10,
    record.ot_amount          ?? 0,
    record.record_status      ?? '',
    record.approval_status    ?? 'Pending',
    record.approved_by        ?? '',
    record.remarks            ?? '',
  ]
}

// ── Upsert ────────────────────────────────────────────────────────────────────

/**
 * Upsert one attendance record.
 * Finds the row by (date + staff_name), updates it if found, appends if not.
 *
 * @param {object} record — output of buildAttendanceRecord()
 */
export async function upsertAttendanceRecord(record) {
  const TAB = 'attendance_records'

  let rows
  try { rows = await readAllRows(TAB) } catch (e) { rows = [] }

  // Row 1 is header. Data rows start at index 1 → sheet row 2.
  // Find matching data row (skip header at index 0).
  const matchIdx = rows.findIndex(
    (r, i) => i > 0 &&
      String(r[0] ?? '') === record.date &&
      String(r[1] ?? '').toLowerCase() === (record.staff_name ?? '').toLowerCase(),
  )

  if (matchIdx > 0) {
    // Update existing row (sheet row = array index + 1 because 1-indexed)
    const sheetRow = matchIdx + 1
    await updateRow(TAB, sheetRow, toRow(record))
    log.info(`[attendance-sheet] updated row ${sheetRow} — staff:${record.staff_name} date:${record.date}`)
  } else {
    // Append new row
    await appendRow(TAB, toRow(record))
    log.info(`[attendance-sheet] appended — staff:${record.staff_name} date:${record.date}`)
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** All records for today. */
export async function getTodayRecords() {
  const today = todayString()
  try {
    const rows = await readAllRows('attendance_records')
    return rows
      .filter((r, i) => i > 0 && String(r[0] ?? '') === today)
      .map(colMap)
  } catch (err) {
    log.error('[attendance-sheet] getTodayRecords failed:', err?.message)
    return []
  }
}

/** All records for a given month (YYYY-MM). */
export async function getMonthRecords(month) {
  const prefix = (month ?? '').slice(0, 7)
  try {
    const rows = await readAllRows('attendance_records')
    return rows
      .filter((r, i) => i > 0 && String(r[0] ?? '').startsWith(prefix))
      .map(colMap)
  } catch (err) {
    log.error('[attendance-sheet] getMonthRecords failed:', err?.message)
    return []
  }
}

/** Monthly OT summary from sheet records. */
export async function getMonthlyOtSummary(month) {
  const records = await getMonthRecords(month)
  return buildMonthlyOtSummary(records, month)
}
