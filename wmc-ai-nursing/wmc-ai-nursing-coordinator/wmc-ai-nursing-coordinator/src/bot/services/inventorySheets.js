/**
 * Inventory Google Sheets Service  (Stage 3)
 *
 * Single source of truth for all inventory sheet operations.
 * Maps to the user-requested backend/googleSheets/inventorySheets.js structure.
 *
 * Sheet tabs managed here:
 *   Inventory_Logs   — every usage event (append-only)
 *   Stock_Balance    — running balance per item (upsert by item_key)
 *   Patient_Usage    — monthly per-patient totals (upsert by patient+month)
 *   Nurse_Usage      — monthly per-nurse totals (upsert by nurse+month)
 *   Low_Stock_Alerts — auto-created when balance ≤ minimum_level
 *
 * Column layouts:
 *
 * Inventory_Logs (9 cols):
 *   [A]timestamp [B]nurse_name [C]telegram_username [D]patient_name
 *   [E]room [F]item_key [G]size [H]qty [I]remarks
 *
 * Stock_Balance (6 cols):
 *   [A]item_key [B]item_name [C]opening_stock [D]used [E]balance [F]minimum_level
 *
 * Patient_Usage (7 cols):
 *   [A]patient_name [B]month [C]pampers_total [D]wet_tissue_total
 *   [E]milk_total [F]gloves_total [G]total_qty
 *
 * Nurse_Usage (6 cols):
 *   [A]nurse_name [B]month [C]total_items_taken [D]pampers [E]wet_tissue [F]milk
 *
 * Low_Stock_Alerts (7 cols):
 *   [A]timestamp [B]item_key [C]item_name [D]balance [E]minimum_level [F]deficit [G]status
 *
 * Usage:
 *   import { saveFullInventoryRecord } from './inventorySheets.js'
 *   await saveFullInventoryRecord(record)   // orchestrates all 5 tabs
 */

import { google } from 'googleapis'
import { log }    from '../utils/logger.js'
import {
  ITEMS,
  DEFAULT_STOCK,
  MIN_LEVELS,
  currentYearMonth,
} from '../../lib/inventoryCalculation.js'
import { logAuditEvent } from './auditTrailService.js'

// ── Auth helpers ──────────────────────────────────────────────────────────────

function createAuth() {
  const email  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''
  const rawKey = process.env.GOOGLE_PRIVATE_KEY ?? ''
  if (!email || !rawKey) throw new Error('Google Sheet credentials not configured')
  return new google.auth.JWT({
    email,
    key:    rawKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function sid() {
  const id = process.env.GOOGLE_SHEET_ID ?? ''
  if (!id) throw new Error('GOOGLE_SHEET_ID not configured')
  return id
}

export function isSheetConfigured() {
  return Boolean(process.env.GOOGLE_SHEET_ID) &&
         Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
         Boolean(process.env.GOOGLE_PRIVATE_KEY)
}

// ── Low-level primitives ──────────────────────────────────────────────────────

/** Read ALL rows from a tab (including header row 1). */
async function readAllRows(tabName, cols = 'A:I') {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range:         `${tabName}!${cols}`,
  })
  return res.data.values ?? []
}

/** Append one row to a tab. */
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
async function updateRow(tabName, rowNumber, values, cols = 'A:I') {
  const endCol = cols.split(':')[1] ?? 'I'
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  await sheets.spreadsheets.values.update({
    spreadsheetId:    sid(),
    range:            `${tabName}!A${rowNumber}:${endCol}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values: [values] },
  })
}

// ── Tab names ─────────────────────────────────────────────────────────────────

const TAB = {
  logs:    'Inventory_Logs',
  balance: 'Stock_Balance',
  patient: 'Patient_Usage',
  nurse:   'Nurse_Usage',
  alerts:  'Low_Stock_Alerts',
}

// ════════════════════════════════════════════════════════════════════════════
// 1. addInventoryLog
// ════════════════════════════════════════════════════════════════════════════

/**
 * Append one usage event to Inventory_Logs.
 *
 * @param {object} data
 *   timestamp, nurse_name, telegram_username, patient_name, room,
 *   item_key, size, qty, remarks
 */
export async function addInventoryLog(data) {
  const row = [
    data.timestamp         ?? new Date().toISOString(),
    data.nurse_name        ?? '',
    data.telegram_username ?? '',
    data.patient_name      ?? '',
    data.room              ?? '',
    data.item_key          ?? '',
    data.size              ?? '',
    Number(data.qty        ?? 0),
    data.remarks           ?? '',
  ]
  await appendRow(TAB.logs, row)
  log.info('[inv-sheets] log appended — item:', data.item_key, 'qty:', data.qty)
}

// ════════════════════════════════════════════════════════════════════════════
// 2. getInventoryLogs
// ════════════════════════════════════════════════════════════════════════════

const mapLog = (r) => ({
  timestamp:         r[0] ?? '',
  nurse_name:        r[1] ?? '',
  telegram_username: r[2] ?? '',
  patient_name:      r[3] ?? '',
  room:              r[4] ?? '',
  item_key:          r[5] ?? '',
  item_name:         ITEMS[r[5]]?.name ?? r[5] ?? '',
  size:              r[6] ?? '',
  qty:               Number(r[7] ?? 0),
  remarks:           r[8] ?? '',
})

/**
 * Read inventory logs.
 *
 * @param {{ date?: string, month?: string, limit?: number }} [opts]
 * @returns {Promise<object[]>}  newest-first
 */
export async function getInventoryLogs(opts = {}) {
  const rows = await readAllRows(TAB.logs, 'A:I')
  const data = rows.slice(1).map(mapLog)   // skip header
  let filtered = data

  if (opts.date)  filtered = filtered.filter((r) => r.timestamp.startsWith(opts.date))
  if (opts.month) filtered = filtered.filter((r) => r.timestamp.startsWith(opts.month))

  const sorted = filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return opts.limit ? sorted.slice(0, opts.limit) : sorted
}

// ════════════════════════════════════════════════════════════════════════════
// 3. getStockBalance / updateStockBalance
// ════════════════════════════════════════════════════════════════════════════

const mapBalanceRow = (r) => ({
  item_key:      r[0] ?? '',
  item_name:     r[1] ?? '',
  opening_stock: Number(r[2] ?? 0),
  used:          Number(r[3] ?? 0),
  balance:       Number(r[4] ?? 0),
  minimum_level: Number(r[5] ?? 0),
})

/**
 * Read all Stock_Balance rows.
 * @returns {Promise<object[]>}
 */
export async function getStockBalance() {
  const rows = await readAllRows(TAB.balance, 'A:F')
  return rows.slice(1).map(mapBalanceRow)
}

/**
 * Upsert a Stock_Balance row for one item.
 *
 * Finds the row where col[A] === itemKey.
 * If found: increments used, recalculates balance, updates in place.
 * If not found: appends a new row using DEFAULT_STOCK opening values.
 *
 * @param {string} itemKey   e.g. 'PAMPERS_M'
 * @param {number} usedQty   qty consumed in this transaction
 * @returns {Promise<{ balance: number, belowMinimum: boolean }>}
 */
export async function updateStockBalance(itemKey, usedQty) {
  const meta        = ITEMS[itemKey]
  const defaultOpen = DEFAULT_STOCK[itemKey] ?? 100
  const minLevel    = MIN_LEVELS[itemKey]    ?? 0

  const rows = await readAllRows(TAB.balance, 'A:F')
  // Find the row index (1-based, +1 for header row)
  const dataRows  = rows.slice(1)
  const rowIndex  = dataRows.findIndex((r) => String(r[0] ?? '').trim() === itemKey)

  let newBalance

  if (rowIndex === -1) {
    // First time this item appears — append a fresh row
    const used    = Number(usedQty)
    newBalance    = Math.max(0, defaultOpen - used)
    await appendRow(TAB.balance, [
      itemKey,
      meta?.name     ?? itemKey,
      defaultOpen,
      used,
      newBalance,
      minLevel,
    ])
  } else {
    const existing    = mapBalanceRow(dataRows[rowIndex])
    const newUsed     = existing.used + Number(usedQty)
    newBalance        = Math.max(0, existing.opening_stock - newUsed)
    const sheetRow    = rowIndex + 2   // +1 for header, +1 for 1-based index
    await updateRow(TAB.balance, sheetRow, [
      existing.item_key,
      existing.item_name || (meta?.name ?? itemKey),
      existing.opening_stock,
      newUsed,
      newBalance,
      existing.minimum_level || minLevel,
    ], 'A:F')
  }

  log.info(`[inv-sheets] stock balance updated — ${itemKey}: balance=${newBalance}`)
  return { balance: newBalance, belowMinimum: newBalance <= minLevel }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. getLowStockAlerts / addLowStockAlert / resolveLowStockAlert
// ════════════════════════════════════════════════════════════════════════════

const mapAlertRow = (r) => ({
  timestamp:     r[0] ?? '',
  item_key:      r[1] ?? '',
  item_name:     r[2] ?? '',
  balance:       Number(r[3] ?? 0),
  minimum_level: Number(r[4] ?? 0),
  deficit:       Number(r[5] ?? 0),
  status:        r[6] ?? 'Active',
})

/**
 * Read all Low_Stock_Alerts rows.
 * @param {{ status?: 'Active'|'Resolved' }} [opts]
 */
export async function getLowStockAlerts(opts = {}) {
  const rows = await readAllRows(TAB.alerts, 'A:G')
  const data = rows.slice(1).map(mapAlertRow)
  if (opts.status) return data.filter((r) => r.status === opts.status)
  return data
}

/**
 * Append a new alert row — but only if there is no existing Active alert
 * for the same item today (prevents spam).
 *
 * @param {string} itemKey
 * @param {number} balance    current balance
 * @param {number} minLevel   minimum threshold
 */
export async function addLowStockAlert(itemKey, balance, minLevel) {
  const today  = new Date().toISOString().slice(0, 10)
  const meta   = ITEMS[itemKey]
  const deficit = minLevel - balance

  // De-duplicate: skip if an Active alert for this item was logged today
  const existing = await getLowStockAlerts({ status: 'Active' }).catch(() => [])
  const already  = existing.some(
    (a) => a.item_key === itemKey && a.timestamp.startsWith(today)
  )
  if (already) {
    log.info(`[inv-sheets] alert already exists for ${itemKey} today — skipped`)
    return
  }

  await appendRow(TAB.alerts, [
    new Date().toISOString(),
    itemKey,
    meta?.name ?? itemKey,
    balance,
    minLevel,
    deficit,
    'Active',
  ])
  log.warn(`[inv-sheets] ⚠️  Low stock alert created — ${itemKey}: ${balance} remaining (min: ${minLevel})`)
}

/**
 * Mark an existing alert as Resolved when stock is replenished.
 * Finds the last Active alert for the item and updates its status.
 *
 * @param {string} itemKey
 */
export async function resolveLowStockAlert(itemKey) {
  const rows     = await readAllRows(TAB.alerts, 'A:G')
  const dataRows = rows.slice(1)
  // Find last active alert for this item (search from bottom)
  for (let i = dataRows.length - 1; i >= 0; i--) {
    if (dataRows[i][1] === itemKey && dataRows[i][6] !== 'Resolved') {
      const sheetRow = i + 2
      const updated  = [...dataRows[i]]
      updated[6]     = 'Resolved'
      await updateRow(TAB.alerts, sheetRow, updated, 'A:G')
      log.info(`[inv-sheets] alert resolved for ${itemKey}`)
      return
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. getPatientUsage / updatePatientUsage
// ════════════════════════════════════════════════════════════════════════════

const mapPatientRow = (r) => ({
  patient_name:     r[0] ?? '',
  month:            r[1] ?? '',
  pampers_total:    Number(r[2] ?? 0),
  wet_tissue_total: Number(r[3] ?? 0),
  milk_total:       Number(r[4] ?? 0),
  gloves_total:     Number(r[5] ?? 0),
  total_qty:        Number(r[6] ?? 0),
})

/**
 * Read Patient_Usage rows.
 * @param {string} [month]  YYYY-MM — if omitted returns all
 */
export async function getPatientUsage(month) {
  const rows = await readAllRows(TAB.patient, 'A:G')
  const data = rows.slice(1).map(mapPatientRow)
  return month ? data.filter((r) => r.month === month) : data
}

/**
 * Upsert the monthly Patient_Usage row for a patient.
 * Increments the correct category column.
 *
 * @param {string} patientName
 * @param {string} month       YYYY-MM
 * @param {string} itemKey     e.g. 'PAMPERS_M'
 * @param {number} qty
 */
export async function updatePatientUsage(patientName, month, itemKey, qty) {
  if (!patientName) return   // skip for nurse-only records (gloves etc.)
  const rows     = await readAllRows(TAB.patient, 'A:G')
  const dataRows = rows.slice(1)
  const rowIndex = dataRows.findIndex(
    (r) => String(r[0] ?? '').toLowerCase() === patientName.toLowerCase() &&
           String(r[1] ?? '') === month
  )

  const category = ITEMS[itemKey]?.category ?? ''
  const inc      = (v) => Number(v ?? 0) + qty

  if (rowIndex === -1) {
    await appendRow(TAB.patient, [
      patientName,
      month,
      category === 'pampers'  ? qty : 0,
      category === 'wet'      ? qty : 0,
      category === 'milk'     ? qty : 0,
      category === 'gloves'   ? qty : 0,
      qty,
    ])
  } else {
    const existing = mapPatientRow(dataRows[rowIndex])
    const sheetRow = rowIndex + 2
    await updateRow(TAB.patient, sheetRow, [
      existing.patient_name,
      existing.month,
      category === 'pampers'  ? inc(existing.pampers_total)    : existing.pampers_total,
      category === 'wet'      ? inc(existing.wet_tissue_total) : existing.wet_tissue_total,
      category === 'milk'     ? inc(existing.milk_total)       : existing.milk_total,
      category === 'gloves'   ? inc(existing.gloves_total)     : existing.gloves_total,
      existing.total_qty + qty,
    ], 'A:G')
  }
  log.info(`[inv-sheets] patient usage updated — ${patientName} ${month}`)
}

// ════════════════════════════════════════════════════════════════════════════
// 6. getNurseUsage / updateNurseUsage
// ════════════════════════════════════════════════════════════════════════════

const mapNurseRow = (r) => ({
  nurse_name:         r[0] ?? '',
  month:              r[1] ?? '',
  total_items_taken:  Number(r[2] ?? 0),
  pampers:            Number(r[3] ?? 0),
  wet_tissue:         Number(r[4] ?? 0),
  milk:               Number(r[5] ?? 0),
})

/**
 * Read Nurse_Usage rows.
 * @param {string} [month]  YYYY-MM — if omitted returns all
 */
export async function getNurseUsage(month) {
  const rows = await readAllRows(TAB.nurse, 'A:F')
  const data = rows.slice(1).map(mapNurseRow)
  return month ? data.filter((r) => r.month === month) : data
}

/**
 * Upsert the monthly Nurse_Usage row for a nurse.
 *
 * @param {string} nurseName
 * @param {string} month      YYYY-MM
 * @param {string} itemKey    e.g. 'PAMPERS_M'
 * @param {number} qty
 */
export async function updateNurseUsage(nurseName, month, itemKey, qty) {
  if (!nurseName) return
  const rows     = await readAllRows(TAB.nurse, 'A:F')
  const dataRows = rows.slice(1)
  const rowIndex = dataRows.findIndex(
    (r) => String(r[0] ?? '').toLowerCase() === nurseName.toLowerCase() &&
           String(r[1] ?? '') === month
  )

  const category = ITEMS[itemKey]?.category ?? ''
  const inc      = (v) => Number(v ?? 0) + qty

  if (rowIndex === -1) {
    await appendRow(TAB.nurse, [
      nurseName,
      month,
      qty,
      category === 'pampers' ? qty : 0,
      category === 'wet'     ? qty : 0,
      category === 'milk'    ? qty : 0,
    ])
  } else {
    const existing = mapNurseRow(dataRows[rowIndex])
    const sheetRow = rowIndex + 2
    await updateRow(TAB.nurse, sheetRow, [
      existing.nurse_name,
      existing.month,
      existing.total_items_taken + qty,
      category === 'pampers' ? inc(existing.pampers)    : existing.pampers,
      category === 'wet'     ? inc(existing.wet_tissue) : existing.wet_tissue,
      category === 'milk'    ? inc(existing.milk)       : existing.milk,
    ], 'A:F')
  }
  log.info(`[inv-sheets] nurse usage updated — ${nurseName} ${month}`)
}

// ════════════════════════════════════════════════════════════════════════════
// 7. saveFullInventoryRecord  ← main orchestrator
// ════════════════════════════════════════════════════════════════════════════

/**
 * Persist a complete inventory event across all 5 sheet tabs.
 *
 * Execution order:
 *   1. Append to Inventory_Logs           (always)
 *   2. Upsert Stock_Balance for item      (always)
 *   3. Create Low_Stock_Alerts if needed  (if balance ≤ minimum)
 *   4. Upsert Patient_Usage for month     (if patient_name provided)
 *   5. Upsert Nurse_Usage for month       (if nurse_name provided)
 *
 * Steps 2-5 run concurrently after step 1 to keep Telegram latency low.
 * Individual failures are caught and logged — they never block the log append.
 *
 * @param {object} data
 *   timestamp, nurse_name, telegram_username, patient_name, room,
 *   item_key, size, qty, remarks
 * @returns {Promise<void>}
 */
export async function saveFullInventoryRecord(data) {
  const qty     = Number(data.qty ?? 0)
  const month   = currentYearMonth()
  const itemKey = data.item_key

  // 1. Append the raw log (must succeed before anything else)
  await addInventoryLog(data)

  // 2-5. Run remaining updates in parallel (non-blocking, catch individually)
  // Track after_stock from the balance update so the audit trail is accurate.
  let afterStock = 0

  const tasks = [
    // 2. Update stock balance
    updateStockBalance(itemKey, qty).then(async ({ balance, belowMinimum }) => {
      afterStock = balance
      // 3. Create alert if stock just dropped below minimum
      if (belowMinimum) {
        const min = MIN_LEVELS[itemKey] ?? 0
        await addLowStockAlert(itemKey, balance, min).catch((e) =>
          log.warn('[inv-sheets] alert creation failed:', e.message)
        )
      } else {
        // Stock is healthy — resolve any existing active alert for this item
        await resolveLowStockAlert(itemKey).catch(() => {})
      }
    }).catch((e) => log.warn('[inv-sheets] stock balance update failed:', e.message)),

    // 4. Patient usage
    data.patient_name
      ? updatePatientUsage(data.patient_name, month, itemKey, qty)
          .catch((e) => log.warn('[inv-sheets] patient usage update failed:', e.message))
      : Promise.resolve(),

    // 5. Nurse usage
    data.nurse_name
      ? updateNurseUsage(data.nurse_name, month, itemKey, qty)
          .catch((e) => log.warn('[inv-sheets] nurse usage update failed:', e.message))
      : Promise.resolve(),
  ]

  await Promise.allSettled(tasks)

  // 6. Audit trail — fire-and-forget, never blocks the caller
  // before_stock = after_stock + qty (exact inverse of the balance update formula)
  logAuditEvent({
    timestamp:         data.timestamp ?? new Date().toISOString(),
    action_type:       data.patient_name ? 'GIVE_TO_PATIENT' : 'TAKE_ITEM',
    nurse_name:        data.nurse_name        ?? '',
    telegram_username: data.telegram_username ?? '',
    patient_name:      data.patient_name      ?? '',
    room:              data.room              ?? '',
    item_key:          itemKey,
    qty,
    before_stock:      afterStock + qty,
    after_stock:       afterStock,
    source:            data.source            ?? 'unknown',
    remarks:           data.remarks           ?? '',
  }).catch((e) => log.warn('[audit] log failed:', e.message))

  log.info(`[inv-sheets] full record saved — ${itemKey} ×${qty} by ${data.nurse_name ?? '?'} room ${data.room ?? '—'}`)
}

// ════════════════════════════════════════════════════════════════════════════
// 8. addStock  —  new supply received
// ════════════════════════════════════════════════════════════════════════════

/**
 * Add new stock to an item (delivery / restock).
 * Increases opening_stock so that balance = new_opening_stock - used.
 *
 * @param {string} itemKey   e.g. 'PAMPERS_M'
 * @param {number} qty       units received
 * @returns {Promise<{ balance: number, opening_stock: number }>}
 */
export async function addStock(itemKey, qty) {
  const meta   = ITEMS[itemKey]
  const qty_   = Math.max(0, Number(qty))
  const rows   = await readAllRows(TAB.balance, 'A:F')
  const dataRows = rows.slice(1)
  const rowIndex = dataRows.findIndex((r) => String(r[0] ?? '').trim() === itemKey)

  let newBalance, newOpening

  if (rowIndex === -1) {
    newOpening = qty_
    newBalance = qty_
    await appendRow(TAB.balance, [
      itemKey, meta?.name ?? itemKey, qty_, 0, qty_, MIN_LEVELS[itemKey] ?? 0,
    ])
  } else {
    const existing = mapBalanceRow(dataRows[rowIndex])
    newOpening = existing.opening_stock + qty_
    newBalance = Math.max(0, newOpening - existing.used)
    await updateRow(TAB.balance, rowIndex + 2, [
      existing.item_key,
      existing.item_name || (meta?.name ?? itemKey),
      newOpening,
      existing.used,
      newBalance,
      existing.minimum_level,
    ], 'A:F')
  }

  log.info(`[inv-sheets] stock added — ${itemKey}: +${qty_} → balance=${newBalance}`)
  return { balance: newBalance, opening_stock: newOpening }
}

// ════════════════════════════════════════════════════════════════════════════
// 9. adjustStock  —  manual balance correction
// ════════════════════════════════════════════════════════════════════════════

/**
 * Directly set the current balance for an item (correction / audit override).
 * Derives a synthetic `used = opening_stock - new_balance`.
 *
 * @param {string} itemKey
 * @param {number} newBalance   desired balance
 * @returns {Promise<{ balance: number }>}
 */
export async function adjustStock(itemKey, newBalance) {
  const meta   = ITEMS[itemKey]
  const nb     = Math.max(0, Number(newBalance))
  const rows   = await readAllRows(TAB.balance, 'A:F')
  const dataRows = rows.slice(1)
  const rowIndex = dataRows.findIndex((r) => String(r[0] ?? '').trim() === itemKey)

  if (rowIndex === -1) {
    const defaultOpen = DEFAULT_STOCK[itemKey] ?? nb
    await appendRow(TAB.balance, [
      itemKey, meta?.name ?? itemKey,
      defaultOpen, Math.max(0, defaultOpen - nb), nb, MIN_LEVELS[itemKey] ?? 0,
    ])
  } else {
    const existing = mapBalanceRow(dataRows[rowIndex])
    const newUsed  = Math.max(0, existing.opening_stock - nb)
    await updateRow(TAB.balance, rowIndex + 2, [
      existing.item_key,
      existing.item_name || (meta?.name ?? itemKey),
      existing.opening_stock,
      newUsed,
      nb,
      existing.minimum_level,
    ], 'A:F')
  }

  log.info(`[inv-sheets] stock adjusted — ${itemKey}: balance set to ${nb}`)
  return { balance: nb }
}

// ════════════════════════════════════════════════════════════════════════════
// 10. setMinimumLevel
// ════════════════════════════════════════════════════════════════════════════

/**
 * Update the minimum stock level threshold for an item.
 *
 * @param {string} itemKey
 * @param {number} minLevel
 * @returns {Promise<{ minimum_level: number }>}
 */
export async function setMinimumLevel(itemKey, minLevel) {
  const meta   = ITEMS[itemKey]
  const ml     = Math.max(0, Number(minLevel))
  const rows   = await readAllRows(TAB.balance, 'A:F')
  const dataRows = rows.slice(1)
  const rowIndex = dataRows.findIndex((r) => String(r[0] ?? '').trim() === itemKey)

  if (rowIndex === -1) {
    const defaultOpen = DEFAULT_STOCK[itemKey] ?? 100
    await appendRow(TAB.balance, [itemKey, meta?.name ?? itemKey, defaultOpen, 0, defaultOpen, ml])
  } else {
    const existing = mapBalanceRow(dataRows[rowIndex])
    await updateRow(TAB.balance, rowIndex + 2, [
      existing.item_key,
      existing.item_name || (meta?.name ?? itemKey),
      existing.opening_stock,
      existing.used,
      existing.balance,
      ml,
    ], 'A:F')
  }

  log.info(`[inv-sheets] minimum level set — ${itemKey}: min=${ml}`)
  return { minimum_level: ml }
}
