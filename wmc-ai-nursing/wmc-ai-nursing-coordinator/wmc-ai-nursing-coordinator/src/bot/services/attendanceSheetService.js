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
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log }    from '../utils/logger.js'
import {
  buildMonthlyOtSummary,
  todayString,
} from '../../lib/attendanceCalculation.js'

// ── Auth ─────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const RETRY_QUEUE_PATH = path.resolve(__dirname, '../data/ot-sheet-sync-queue.json')
const RETRY_INTERVAL_MS = 30_000
const MAX_RETRY_ATTEMPTS = 5
const DEFAULT_OT_TAB = String(process.env.OT_ATTENDANCE_TAB || 'OT Records').trim() || 'OT Records'
const NURSING_WEB_BASE_URL = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

function createAuth() {
  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? process.env.GOOGLE_CLIENT_EMAIL ?? ''
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  if (!email || !privateKey) {
    console.error('Google Sheet append failed:', new Error('Google credentials not configured'))
    throw new Error('Google credentials not configured')
  }
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
  await ensureTabReady(tabName)
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range:         `${tabName}!A:N`,
  })
  return res.data.values ?? []
}

/** Append a new row to the tab. */
async function appendRow(tabName, values) {
  await ensureTabReady(tabName)
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId:    sid(),
      range:            `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody:      { values: [values] },
    })
  } catch (err) {
    console.error('Google Sheet append failed:', err)
    log.error(`[attendance-sheet] append failed tab:${tabName} sheet:${sid()} reason:${err?.message ?? String(err)}`)
    if (err?.response?.data) {
      log.error('[attendance-sheet] append google response:', JSON.stringify(err.response.data))
    }
    throw err
  }
}

/** Update a specific row by 1-based row number. */
async function updateRow(tabName, rowNumber, values) {
  await ensureTabReady(tabName)
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId:    sid(),
      range:            `${tabName}!A${rowNumber}:N${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody:      { values: [values] },
    })
  } catch (err) {
    log.error(`[attendance-sheet] update failed tab:${tabName} row:${rowNumber} sheet:${sid()} reason:${err?.message ?? String(err)}`)
    if (err?.response?.data) {
      log.error('[attendance-sheet] update google response:', JSON.stringify(err.response.data))
    }
    throw err
  }
}

async function ensureTabReady(tabName) {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  const spreadsheetId = sid()
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const sheetsList = meta.data.sheets || []
    const exists = sheetsList.some((item) => String(item?.properties?.title || '') === tabName)
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1:N1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            'date', 'staff_name', 'telegram_username', 'normal_punch_in', 'normal_punch_out',
            'ot_in', 'ot_out', 'ot_hours', 'ot_rate', 'ot_amount', 'record_status',
            'approval_status', 'approved_by', 'remarks',
          ]],
        },
      })
      log.info(`[attendance-sheet] created missing tab: ${tabName}`)
    }
  } catch (error) {
    log.error(`[attendance-sheet] ensure tab failed tab:${tabName} sheet:${spreadsheetId} reason:${error?.message ?? String(error)}`)
    throw error
  }
}

async function readQueueFile() {
  try {
    const raw = await fs.readFile(RETRY_QUEUE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { pending: [], failed: [] }
    return {
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
      failed: Array.isArray(parsed.failed) ? parsed.failed : [],
    }
  } catch {
    return { pending: [], failed: [] }
  }
}

async function writeQueueFile(queue) {
  await fs.writeFile(RETRY_QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8')
}

function queueKey(record) {
  return `${String(record.date || '')}|${String(record.staff_name || '').toLowerCase()}`
}

async function enqueueRetry(record, reason) {
  const queue = await readQueueFile()
  const key = queueKey(record)
  const exists = queue.pending.some((item) => item.key === key) || queue.failed.some((item) => item.key === key)
  if (exists) return
  queue.pending.push({
    key,
    record,
    attempts: 0,
    lastError: String(reason || ''),
    nextAttemptAt: Date.now() + RETRY_INTERVAL_MS,
    createdAt: new Date().toISOString(),
  })
  await writeQueueFile(queue)
  await setOtSyncStatusRemote(record, 'pending_sync', String(reason || 'Cloud sync queued for retry'))
}

async function setOtSyncStatusRemote(record, syncStatus, syncError = null) {
  try {
    await fetch(`${NURSING_WEB_BASE_URL}/api/ot-records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'set_sync_status',
        nurseName: String(record?.staff_name || '').trim(),
        date: String(record?.date || '').trim(),
        syncStatus,
        syncError,
      }),
    })
  } catch (error) {
    log.warn('[attendance-sheet] unable to update OT sync status remotely:', error?.message ?? String(error))
  }
}

async function processRetryQueue() {
  const queue = await readQueueFile()
  if (!queue.pending.length) return
  const now = Date.now()
  const remaining = []
  for (const item of queue.pending) {
    if (Number(item.nextAttemptAt || 0) > now) {
      remaining.push(item)
      continue
    }
    try {
      await upsertAttendanceRecord(item.record, { fromRetry: true })
      await setOtSyncStatusRemote(item.record, 'synced', null)
    } catch (error) {
      const attempts = Number(item.attempts || 0) + 1
      const nextItem = {
        ...item,
        attempts,
        lastError: String(error?.message || error),
        nextAttemptAt: Date.now() + RETRY_INTERVAL_MS,
      }
      if (attempts >= MAX_RETRY_ATTEMPTS) {
        queue.failed.push(nextItem)
        await setOtSyncStatusRemote(item.record, 'failed_sync', nextItem.lastError)
      } else {
        remaining.push(nextItem)
        await setOtSyncStatusRemote(item.record, 'pending_sync', nextItem.lastError)
      }
    }
  }
  queue.pending = remaining
  await writeQueueFile(queue)
}

setInterval(() => {
  void processRetryQueue().catch((error) => {
    log.error('[attendance-sheet] retry queue loop error:', error?.message ?? String(error))
  })
}, RETRY_INTERVAL_MS)

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
export async function upsertAttendanceRecord(record, options = {}) {
  const TAB = DEFAULT_OT_TAB

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
    try {
      await updateRow(TAB, sheetRow, toRow(record))
      log.info(`[attendance-sheet] updated row ${sheetRow} — staff:${record.staff_name} date:${record.date}`)
      return { ok: true, syncStatus: 'synced' }
    } catch (error) {
      if (!options.fromRetry) await enqueueRetry(record, error?.message ?? String(error))
      throw error
    }
  } else {
    // Append new row
    try {
      await appendRow(TAB, toRow(record))
      log.info(`[attendance-sheet] appended — staff:${record.staff_name} date:${record.date}`)
      return { ok: true, syncStatus: 'synced' }
    } catch (error) {
      if (!options.fromRetry) await enqueueRetry(record, error?.message ?? String(error))
      throw error
    }
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** All records for today. */
export async function getTodayRecords() {
  const today = todayString()
  try {
    const rows = await readAllRows(DEFAULT_OT_TAB)
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
    const rows = await readAllRows(DEFAULT_OT_TAB)
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

export async function getOtSheetSyncQueueStatus() {
  const queue = await readQueueFile()
  return {
    pendingCount: queue.pending.length,
    failedCount: queue.failed.length,
    pending: queue.pending,
    failed: queue.failed,
    tab: DEFAULT_OT_TAB,
    retryIntervalMs: RETRY_INTERVAL_MS,
  }
}

export async function retryOtSheetSyncNow() {
  const queue = await readQueueFile()
  queue.pending.push(
    ...queue.failed.map((item) => ({
      ...item,
      attempts: 0,
      nextAttemptAt: Date.now(),
      movedFromFailedAt: new Date().toISOString(),
    })),
  )
  queue.failed = []
  await writeQueueFile(queue)
  await processRetryQueue()
  return getOtSheetSyncQueueStatus()
}
