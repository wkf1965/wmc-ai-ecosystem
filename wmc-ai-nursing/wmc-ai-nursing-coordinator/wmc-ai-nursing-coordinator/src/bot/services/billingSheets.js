/**
 * Billing Google Sheets Service  (Stage 6)
 *
 * Manages the `Inventory_Billing` tab.
 *
 * Column layout (A–I):
 *   [A] month            YYYY-MM
 *   [B] patient_name
 *   [C] room
 *   [D] item_category    pampers | wet | milk | gloves
 *   [E] total_qty
 *   [F] unit_price       RM
 *   [G] total_amount     RM
 *   [H] billing_status   Unpaid | Paid | Waived
 *   [I] remarks
 *
 * Upsert key: month + patient_name + item_category
 *
 * Usage:
 *   import { generateBillingForMonth, getBilling, ... } from './billingSheets.js'
 */

import { google }   from 'googleapis'
import { log }      from '../utils/logger.js'
import { getPrices, computeAmount, DEFAULT_PRICES } from './billingPrices.js'
import { ITEMS, CATEGORY_DISPLAY, currentYearMonth } from '../../lib/inventoryCalculation.js'
import { getInventoryLogs } from './inventorySheets.js'
import { logAuditEvent } from './auditTrailService.js'

// ── Sheet config ──────────────────────────────────────────────────────────────

const TAB = 'Inventory_Billing'

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

export function isBillingSheetConfigured() {
  return Boolean(process.env.GOOGLE_SHEET_ID) &&
         Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
         Boolean(process.env.GOOGLE_PRIVATE_KEY)
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

async function readAllRows() {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range:         `${TAB}!A:I`,
  })
  return res.data.values ?? []
}

async function appendRow(values) {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  await sheets.spreadsheets.values.append({
    spreadsheetId:    sid(),
    range:            `${TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: [values] },
  })
}

async function updateRow(rowNumber, values) {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  await sheets.spreadsheets.values.update({
    spreadsheetId:    sid(),
    range:            `${TAB}!A${rowNumber}:I${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values: [values] },
  })
}

// ── Row mappers ───────────────────────────────────────────────────────────────

const mapRow = (r) => ({
  month:          r[0] ?? '',
  patient_name:   r[1] ?? '',
  room:           r[2] ?? '',
  item_category:  r[3] ?? '',
  item_name:      CATEGORY_DISPLAY[r[3]] ?? r[3] ?? '',
  total_qty:      Number(r[4] ?? 0),
  unit_price:     Number(r[5] ?? 0),
  total_amount:   Number(r[6] ?? 0),
  billing_status: r[7] ?? 'Unpaid',
  remarks:        r[8] ?? '',
})

const toRow = (b) => [
  b.month, b.patient_name, b.room, b.item_category,
  b.total_qty, b.unit_price, b.total_amount,
  b.billing_status ?? 'Unpaid',
  b.remarks ?? '',
]

// ── Pure compute helper (works on any log array) ──────────────────────────────

/**
 * Compute billing rows from raw inventory logs.
 * Groups by patient + category, applies current prices.
 *
 * @param {object[]} logs
 * @param {string}   month   YYYY-MM label for the rows
 * @param {object}   [prices] if omitted, reads from billingPrices.js
 * @returns {object[]}
 */
export function computeBillingFromLogs(logs, month, prices) {
  const p   = prices ?? getPrices()
  const map = new Map()

  for (const log of logs) {
    if (!log.patient_name) continue
    const category = ITEMS[log.item_key]?.category ?? ''
    if (!category) continue
    const key = `${log.patient_name}|${category}`
    if (!map.has(key)) {
      map.set(key, {
        month,
        patient_name:   log.patient_name,
        room:           log.room ?? '',
        item_category:  category,
        item_name:      CATEGORY_DISPLAY[category] ?? category,
        total_qty:      0,
        unit_price:     p[category] ?? 0,
        total_amount:   0,
        billing_status: 'Unpaid',
        remarks:        '',
      })
    }
    const entry = map.get(key)
    entry.total_qty += Number(log.qty ?? 0)
    // Prefer a non-empty room
    if (!entry.room && log.room) entry.room = log.room
  }

  for (const entry of map.values()) {
    entry.total_amount = Math.round(entry.total_qty * entry.unit_price * 100) / 100
  }

  return [...map.values()].sort((a, b) =>
    a.patient_name.localeCompare(b.patient_name) ||
    a.item_category.localeCompare(b.item_category)
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Public Sheet functions
// ════════════════════════════════════════════════════════════════════════════

/**
 * Read billing rows with optional filters.
 *
 * @param {{ month?, patient_name?, room?, billing_status? }} [opts]
 * @returns {Promise<object[]>}
 */
export async function getBilling(opts = {}) {
  const rows = await readAllRows()
  let data   = rows.slice(1).map(mapRow)   // skip header

  if (opts.month)          data = data.filter((r) => r.month === opts.month)
  if (opts.patient_name)   data = data.filter((r) =>
    r.patient_name.toLowerCase().includes(opts.patient_name.toLowerCase())
  )
  if (opts.room)           data = data.filter((r) => r.room === String(opts.room))
  if (opts.billing_status) data = data.filter((r) => r.billing_status === opts.billing_status)

  return data
}

/**
 * Generate billing rows for a month from `Inventory_Logs`.
 *
 * For each patient + category combination:
 *   - Computes total qty
 *   - Applies current unit prices
 *   - Upserts the row in `Inventory_Billing` (update if exists, append if new)
 *
 * @param {string}  month        YYYY-MM
 * @param {string}  [patientName] if provided, only generate for that patient
 * @returns {Promise<object[]>}  generated/updated billing rows
 */
export async function generateBillingForMonth(month, patientName) {
  // 1. Fetch logs for the month
  const logsOpts = { month }
  const logs     = await getInventoryLogs(logsOpts)
  const filtered = patientName
    ? logs.filter((l) => l.patient_name?.toLowerCase().includes(patientName.toLowerCase()))
    : logs

  if (filtered.length === 0) {
    log.warn(`[billing] no logs for month=${month} patient=${patientName ?? 'all'}`)
    return []
  }

  // 2. Compute from logs
  const computed = computeBillingFromLogs(filtered, month)
  if (computed.length === 0) return []

  // 3. Read current billing rows for upsert
  const existingRows = await readAllRows()
  const dataRows     = existingRows.slice(1)

  const results = []
  for (const row of computed) {
    const key = (r) =>
      String(r[0] ?? '').trim() === row.month &&
      String(r[1] ?? '').toLowerCase().trim() === row.patient_name.toLowerCase().trim() &&
      String(r[3] ?? '').trim() === row.item_category

    const idx = dataRows.findIndex(key)
    if (idx === -1) {
      // Append new row
      await appendRow(toRow(row))
    } else {
      // Update existing — preserve billing_status if already Paid/Waived
      const existing  = mapRow(dataRows[idx])
      const newStatus = existing.billing_status === 'Paid' || existing.billing_status === 'Waived'
        ? existing.billing_status
        : 'Unpaid'
      const merged = { ...row, billing_status: newStatus, remarks: existing.remarks }
      await updateRow(idx + 2, toRow(merged))   // +1 header +1 1-based
    }
    results.push(row)
  }

  log.info(`[billing] generated ${results.length} billing rows for ${month} — patient: ${patientName ?? 'all'}`)

  // Audit trail — one event per patient summarising the billing generation
  const patientTotals = {}
  for (const r of results) {
    patientTotals[r.patient_name] = (patientTotals[r.patient_name] ?? 0) + r.total_amount
  }
  for (const [pName, total] of Object.entries(patientTotals)) {
    logAuditEvent({
      timestamp:   new Date().toISOString(),
      action_type: 'BILLING_GENERATED',
      nurse_name:  '',
      patient_name: pName,
      item_key:    'billing',
      qty:         0,
      before_stock: 0,
      after_stock:  0,
      source:      'api',
      remarks:     `Month: ${month}, Total: RM${total.toFixed(2)}`,
    }).catch(() => {})
  }

  return results
}

/**
 * Update billing status for all rows of a patient+month.
 *
 * @param {string} month
 * @param {string} patientName
 * @param {string} status       'Paid' | 'Unpaid' | 'Waived'
 * @param {string} [remarks]
 */
export async function updateBillingStatus(month, patientName, status, remarks) {
  const rows     = await readAllRows()
  const dataRows = rows.slice(1)
  let   updated  = 0

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i]
    if (
      String(r[0] ?? '').trim() === month &&
      String(r[1] ?? '').toLowerCase().trim() === patientName.toLowerCase().trim()
    ) {
      const sheetRow = i + 2
      const updated_ = [...r]
      updated_[7]    = status
      if (remarks !== undefined) updated_[8] = remarks
      await updateRow(sheetRow, updated_)
      updated++
    }
  }
  log.info(`[billing] status updated — ${patientName} ${month}: ${status} (${updated} rows)`)

  const actionMap = { Paid: 'MARK_PAID', Unpaid: 'MARK_UNPAID', Waived: 'MARK_WAIVED' }
  logAuditEvent({
    timestamp:    new Date().toISOString(),
    action_type:  actionMap[status] ?? 'MARK_PAID',
    nurse_name:   '',
    patient_name: patientName,
    item_key:     'billing',
    qty:          0,
    before_stock: 0,
    after_stock:  0,
    source:       'api',
    remarks:      `Month: ${month}, Status: ${status}${remarks ? ', ' + remarks : ''}`,
  }).catch(() => {})

  return updated
}

/**
 * Get a summary of billing totals grouped by patient for a month.
 * Returns one object per patient with item breakdown + grand total.
 *
 * @param {string} month
 * @returns {Promise<object[]>}
 */
export async function getBillingPatientSummary(month) {
  const rows = await getBilling({ month })
  const map  = new Map()

  for (const r of rows) {
    if (!map.has(r.patient_name)) {
      map.set(r.patient_name, {
        patient_name:   r.patient_name,
        room:           r.room,
        month,
        items:          [],
        grand_total:    0,
        billing_status: r.billing_status,
      })
    }
    const e = map.get(r.patient_name)
    e.items.push({
      item_category: r.item_category,
      item_name:     r.item_name,
      total_qty:     r.total_qty,
      unit_price:    r.unit_price,
      total_amount:  r.total_amount,
    })
    e.grand_total = Math.round((e.grand_total + r.total_amount) * 100) / 100
    // If any row is Unpaid, overall status is Unpaid
    if (r.billing_status !== 'Paid' && r.billing_status !== 'Waived') {
      e.billing_status = 'Unpaid'
    }
  }

  return [...map.values()].sort((a, b) => a.patient_name.localeCompare(b.patient_name))
}
