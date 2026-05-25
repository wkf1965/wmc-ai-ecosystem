/**
 * Inventory Storage — Frontend localStorage layer
 *
 * Mirrors the Google Sheet tabs locally for the React dashboard.
 * All writes also go to the sheet via the backend API.
 *
 * Storage keys:
 *   wmc_inventory_logs_v1   — Inventory_Logs tab rows
 *   wmc_stock_balance_v1    — Stock_Balance overrides (deltas)
 */

import {
  computeStockBalance,
  getLowStockAlerts,
  DEFAULT_STOCK,
  ITEMS,
  todayIso,
  currentYearMonth,
} from '../lib/inventoryCalculation.js'

// ── Keys ──────────────────────────────────────────────────────────────────────

const KEY_LOGS    = 'wmc_inventory_logs_v1'
const KEY_STOCK   = 'wmc_stock_balance_v1'

// ── Helpers ───────────────────────────────────────────────────────────────────

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? [] } catch { return [] }
}
function save(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* quota exceeded */ }
}

function genId() {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ── Inventory Logs ────────────────────────────────────────────────────────────

/**
 * Add one inventory usage record.
 *
 * @param {object} record
 *   timestamp, nurse_name, telegram_username, patient_name, room,
 *   item_key, size, qty, remarks
 * @returns {object}  record with generated id
 */
export function addInventoryLog(record) {
  const logs = load(KEY_LOGS)
  const entry = {
    id:                genId(),
    timestamp:         record.timestamp         ?? new Date().toISOString(),
    nurse_name:        record.nurse_name         ?? '',
    telegram_username: record.telegram_username  ?? '',
    patient_name:      record.patient_name       ?? '',
    room:              record.room               ?? '',
    item_key:          record.item_key           ?? '',
    item_name:         ITEMS[record.item_key]?.name ?? record.item_key ?? '',
    size:              record.size               ?? '',
    qty:               Number(record.qty         ?? 0),
    remarks:           record.remarks            ?? '',
    source:            record.source             ?? 'web',
  }
  logs.push(entry)
  save(KEY_LOGS, logs)
  return entry
}

/** Return all logs, newest first. */
export function getAllInventoryLogs() {
  return [...load(KEY_LOGS)].reverse()
}

/** Return logs for a specific date (YYYY-MM-DD). */
export function getLogsForDate(date) {
  const d = date ?? todayIso()
  return load(KEY_LOGS).filter((r) => r.timestamp.startsWith(d))
}

/** Return logs for a specific month (YYYY-MM). */
export function getLogsForMonth(month) {
  const m = month ?? currentYearMonth()
  return load(KEY_LOGS).filter((r) => r.timestamp.startsWith(m))
}

/** Return logs for a specific patient (case-insensitive, partial match). */
export function getLogsForPatient(patientName) {
  const q = (patientName ?? '').toLowerCase()
  return load(KEY_LOGS).filter((r) => r.patient_name.toLowerCase().includes(q))
}

/** Return logs issued by a specific nurse. */
export function getLogsForNurse(nurseName) {
  const q = (nurseName ?? '').toLowerCase()
  return load(KEY_LOGS).filter((r) => r.nurse_name.toLowerCase().includes(q))
}

// ── Stock Balance ─────────────────────────────────────────────────────────────

/**
 * Compute current stock by replaying all logs from localStorage.
 * Optionally merge with any opening stock overrides saved separately.
 *
 * @returns {Record<string, number>}  itemKey → balance
 */
export function getCurrentStockBalance() {
  const logs    = load(KEY_LOGS)
  const balance = computeStockBalance(logs)
  // Merge any manual opening stock overrides
  const overrides = load(KEY_STOCK)
  if (Array.isArray(overrides)) {
    for (const ov of overrides) {
      if (ov.item_key && typeof ov.opening_stock === 'number') {
        balance[ov.item_key] = Math.max(0, ov.opening_stock - (balance[ov.item_key] === undefined
          ? 0
          : DEFAULT_STOCK[ov.item_key] - balance[ov.item_key]))
      }
    }
  }
  return balance
}

/** Return current low-stock alerts. */
export function getCurrentAlerts() {
  return getLowStockAlerts(getCurrentStockBalance())
}

// ── Aggregations ──────────────────────────────────────────────────────────────

/**
 * Compute per-patient usage totals for a month.
 *
 * @param {string} [month]  YYYY-MM, defaults to current month
 * @returns {Array<{ patient_name, room, total_qty, breakdown }>}
 */
export function getPatientUsage(month) {
  const logs = getLogsForMonth(month)
  const map  = new Map()

  for (const log of logs) {
    const key = log.patient_name || 'Unknown'
    if (!map.has(key)) {
      map.set(key, { patient_name: key, room: log.room, total_qty: 0, breakdown: {} })
    }
    const entry = map.get(key)
    entry.total_qty += log.qty
    entry.breakdown[log.item_key] = (entry.breakdown[log.item_key] ?? 0) + log.qty
  }

  return [...map.values()].sort((a, b) => b.total_qty - a.total_qty)
}

/**
 * Compute per-nurse usage totals for a month.
 *
 * @param {string} [month]  YYYY-MM
 * @returns {Array<{ nurse_name, total_qty, item_count }>}
 */
export function getNurseUsage(month) {
  const logs = getLogsForMonth(month)
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

/**
 * Daily usage totals for the past N days (for the sparkline / trend).
 *
 * @param {number} [days=7]
 * @returns {Array<{ date, total_qty }>}
 */
export function getDailyUsageTrend(days = 7) {
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const d    = new Date()
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    const qty  = getLogsForDate(date).reduce((s, r) => s + r.qty, 0)
    result.push({ date, total_qty: qty })
  }
  return result
}

/** Today's summary stats for KPI cards. */
export function getTodayStats() {
  const today = getLogsForDate(todayIso())
  const balance = getCurrentStockBalance()
  const alerts  = getCurrentAlerts()

  return {
    total_items_today:     today.reduce((s, r) => s + r.qty, 0),
    total_transactions:    today.length,
    low_stock_count:       alerts.length,
    items_tracked:         Object.keys(ITEMS).length,
    most_used_today:       (() => {
      const tally = {}
      for (const r of today) tally[r.item_key] = (tally[r.item_key] ?? 0) + r.qty
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
      return top ? { key: top[0], name: ITEMS[top[0]]?.name ?? top[0], qty: top[1] } : null
    })(),
    balance,
    alerts,
  }
}

/** Seed demo data for development (only if storage is empty). */
export function seedDemoDataIfEmpty() {
  if (load(KEY_LOGS).length > 0) return

  const today = new Date().toISOString()
  const items = [
    { item_key: 'PAMPERS_M',  qty: 4, patient_name: 'Ahmad Bin Ali',    room: '1', nurse_name: '@sarah' },
    { item_key: 'PAMPERS_L',  qty: 6, patient_name: 'Siti Binti Hamid', room: '2', nurse_name: '@sarah' },
    { item_key: 'WET_TISSUE', qty: 2, patient_name: 'Ahmad Bin Ali',    room: '1', nurse_name: '@rachel' },
    { item_key: 'MILK_FULL',  qty: 3, patient_name: 'Lee Wei Ming',     room: '3', nurse_name: '@rachel' },
    { item_key: 'GLOVES_M',   qty: 10, patient_name: '',                room: '',  nurse_name: '@sarah' },
    { item_key: 'PAMPERS_XL', qty: 3, patient_name: 'Muthu Rajan',      room: '4', nurse_name: '@aini' },
    { item_key: 'WET_TISSUE', qty: 1, patient_name: 'Siti Binti Hamid', room: '2', nurse_name: '@aini' },
    { item_key: 'MILK_LOW',   qty: 4, patient_name: 'Lee Wei Ming',     room: '3', nurse_name: '@sarah' },
  ]

  for (const item of items) {
    addInventoryLog({ ...item, timestamp: today, source: 'demo', telegram_username: item.nurse_name })
  }
}
