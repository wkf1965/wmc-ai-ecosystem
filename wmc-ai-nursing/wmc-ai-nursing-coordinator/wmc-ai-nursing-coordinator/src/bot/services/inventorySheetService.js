/**
 * Inventory Sheet Service
 *
 * Reads from and writes to the Google Sheet tabs:
 *   Inventory_Logs  — every individual usage event
 *   Stock_Balance   — opening stock + running used/balance
 *
 * Inventory_Logs column layout (9 cols, row 1 = header):
 *   [A] timestamp
 *   [B] nurse_name
 *   [C] telegram_username
 *   [D] patient_name
 *   [E] room
 *   [F] item_key
 *   [G] size
 *   [H] qty
 *   [I] remarks
 *
 * Stock_Balance column layout (5 cols):
 *   [A] item_key
 *   [B] item_name
 *   [C] opening_stock
 *   [D] used
 *   [E] balance
 *   [F] minimum_level
 *
 * Write operations use googleSheetService.saveInventoryLog() and
 * saveStockBalance() to avoid duplicating auth logic.
 */

import { google }       from 'googleapis'
import { log }          from '../utils/logger.js'
import { ITEMS, DEFAULT_STOCK, MIN_LEVELS, computeStockBalance, getLowStockAlerts } from '../../lib/inventoryCalculation.js'

// ── Auth ──────────────────────────────────────────────────────────────────────

function createAuth() {
  const email  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''
  const rawKey = process.env.GOOGLE_PRIVATE_KEY ?? ''
  return new google.auth.JWT({
    email,
    key:    rawKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getSheetId() { return process.env.GOOGLE_SHEET_ID ?? '' }

// ── Generic reader ────────────────────────────────────────────────────────────

async function readRange(range) {
  const sheetId = getSheetId()
  if (!sheetId) { log.warn('[inv-sheet] GOOGLE_SHEET_ID not set'); return [] }
  try {
    const sheets = google.sheets({ version: 'v4', auth: createAuth() })
    const res    = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range })
    const rows   = res.data.values ?? []
    return rows.length > 1 ? rows.slice(1) : []  // skip header
  } catch (err) {
    log.error('[inv-sheet] read error:', err.message)
    return []
  }
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function mapLogRow(r) {
  return {
    timestamp:         r[0] ?? '',
    nurse_name:        r[1] ?? '',
    telegram_username: r[2] ?? '',
    patient_name:      r[3] ?? '',
    room:              r[4] ?? '',
    item_key:          r[5] ?? '',
    size:              r[6] ?? '',
    qty:               Number(r[7] ?? 0),
    remarks:           r[8] ?? '',
  }
}

function mapBalanceRow(r) {
  return {
    item_key:      r[0] ?? '',
    item_name:     r[1] ?? '',
    opening_stock: Number(r[2] ?? 0),
    used:          Number(r[3] ?? 0),
    balance:       Number(r[4] ?? 0),
    minimum_level: Number(r[5] ?? 0),
  }
}

// ── Public read API ───────────────────────────────────────────────────────────

/**
 * Fetch all inventory logs from the Inventory_Logs tab.
 * Returns rows newest-first (sorted by timestamp after fetching).
 */
export async function getInventoryLogs() {
  const rows = await readRange('Inventory_Logs!A:I')
  return rows.map(mapLogRow).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

/**
 * Fetch logs for a specific date (YYYY-MM-DD prefix match on timestamp).
 */
export async function getInventoryLogsForDate(date) {
  const logs = await getInventoryLogs()
  return logs.filter((r) => r.timestamp.startsWith(date))
}

/**
 * Fetch logs for a specific month (YYYY-MM prefix).
 */
export async function getInventoryLogsForMonth(month) {
  const logs = await getInventoryLogs()
  return logs.filter((r) => r.timestamp.startsWith(month))
}

/**
 * Read the Stock_Balance tab and return as a map: itemKey → balance row.
 */
export async function getStockBalanceFromSheet() {
  const rows = await readRange('Stock_Balance!A:F')
  const map  = {}
  for (const row of rows.map(mapBalanceRow)) {
    if (row.item_key) map[row.item_key] = row
  }
  return map
}

/**
 * Compute current stock balance directly from Inventory_Logs
 * (all-time totals). Returns itemKey → remaining qty.
 */
export async function getComputedStockBalance() {
  const logs    = await getInventoryLogs()
  const balance = computeStockBalance(logs)
  return balance
}

/**
 * Return current low-stock alert objects.
 */
export async function getStockAlerts() {
  const balance = await getComputedStockBalance()
  return getLowStockAlerts(balance)
}

/**
 * Compute per-patient usage for a given month.
 */
export async function getPatientUsageFromSheet(month) {
  const logs = await getInventoryLogsForMonth(month)
  const map  = new Map()
  for (const log of logs) {
    const key = log.patient_name || 'Unknown'
    if (!map.has(key)) map.set(key, { patient_name: key, room: log.room, total_qty: 0, breakdown: {} })
    const entry = map.get(key)
    entry.total_qty += log.qty
    entry.breakdown[log.item_key] = (entry.breakdown[log.item_key] ?? 0) + log.qty
  }
  return [...map.values()].sort((a, b) => b.total_qty - a.total_qty)
}

/**
 * Compute per-nurse usage for a given month.
 */
export async function getNurseUsageFromSheet(month) {
  const logs = await getInventoryLogsForMonth(month)
  const map  = new Map()
  for (const log of logs) {
    const key = log.nurse_name || 'Unknown'
    if (!map.has(key)) map.set(key, { nurse_name: key, total_qty: 0, item_count: 0 })
    const entry = map.get(key)
    entry.total_qty  += log.qty
    entry.item_count += 1
  }
  return [...map.values()].sort((a, b) => b.total_qty - a.total_qty)
}
