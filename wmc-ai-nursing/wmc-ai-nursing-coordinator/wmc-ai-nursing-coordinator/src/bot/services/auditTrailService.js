/**
 * Inventory Audit Trail Service  (Stage 7)
 *
 * Manages the `Inventory_Audit_Trail` Google Sheet tab.
 *
 * Column layout (A–L):
 *   [A] timestamp          ISO-8601
 *   [B] action_type        TAKE_ITEM | GIVE_TO_PATIENT | STOCK_ADJUSTMENT |
 *                          PRICE_UPDATE | BILLING_GENERATED | MARK_PAID | MARK_UNPAID | MARK_WAIVED
 *   [C] nurse_name
 *   [D] telegram_username
 *   [E] patient_name
 *   [F] room
 *   [G] item_key           e.g. PAMPERS_M
 *   [H] qty
 *   [I] before_stock
 *   [J] after_stock
 *   [K] source             telegram | telegram-nlp | web | api
 *   [L] remarks
 *
 * Suspicious-usage thresholds (per nurse per 8-hour shift):
 *   pampers: 30 pcs   wet: 20 packs   milk: 15 units   gloves: 50 pcs
 */

import { google }   from 'googleapis'
import { log }      from '../utils/logger.js'
import { ITEMS, CATEGORY_DISPLAY, todayIso } from '../../lib/inventoryCalculation.js'

// ── Config ────────────────────────────────────────────────────────────────────

const TAB = 'Inventory_Audit_Trail'

/** Per-nurse per-shift (8 h) suspicious quantity thresholds. */
const SUSPICIOUS_THRESHOLD = {
  pampers: 30,
  wet:     20,
  milk:    15,
  gloves:  50,
}
const SHIFT_HOURS = 8

export function isAuditConfigured() {
  return Boolean(process.env.GOOGLE_SHEET_ID) &&
         Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
         Boolean(process.env.GOOGLE_PRIVATE_KEY)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

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

// ── Low-level helpers ─────────────────────────────────────────────────────────

async function readAllRows() {
  const sheets = google.sheets({ version: 'v4', auth: createAuth() })
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range:         `${TAB}!A:L`,
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

// ── Row mapper ────────────────────────────────────────────────────────────────

const mapRow = (r) => ({
  timestamp:         r[0]  ?? '',
  action_type:       r[1]  ?? '',
  nurse_name:        r[2]  ?? '',
  telegram_username: r[3]  ?? '',
  patient_name:      r[4]  ?? '',
  room:              r[5]  ?? '',
  item_key:          r[6]  ?? '',
  item_name:         ITEMS[r[6]]?.name ?? r[6] ?? '',
  qty:               Number(r[7]  ?? 0),
  before_stock:      Number(r[8]  ?? 0),
  after_stock:       Number(r[9]  ?? 0),
  source:            r[10] ?? '',
  remarks:           r[11] ?? '',
})

const toRow = (e) => [
  e.timestamp         ?? new Date().toISOString(),
  e.action_type       ?? 'TAKE_ITEM',
  e.nurse_name        ?? '',
  e.telegram_username ?? '',
  e.patient_name      ?? '',
  e.room              ?? '',
  e.item_key          ?? '',
  Number(e.qty        ?? 0),
  Number(e.before_stock ?? 0),
  Number(e.after_stock  ?? 0),
  e.source            ?? '',
  e.remarks           ?? '',
]

// ════════════════════════════════════════════════════════════════════════════
// Public functions
// ════════════════════════════════════════════════════════════════════════════

/**
 * Append one audit event.
 * Fire-and-forget safe: callers should .catch() this.
 *
 * @param {object} event
 */
export async function logAuditEvent(event) {
  if (!isAuditConfigured()) return   // silently skip when Sheet not set up
  await appendRow(toRow(event))
  log.info(`[audit] logged ${event.action_type} — ${event.item_key} ×${event.qty} by ${event.nurse_name ?? '?'}`)
}

/**
 * Read audit trail with optional filters.
 *
 * @param {{ date?, month?, nurse?, patient?, item_key?, limit? }} [opts]
 * @returns {Promise<object[]>}  newest-first
 */
export async function getAuditTrail(opts = {}) {
  const rows = await readAllRows()
  let data   = rows.slice(1).map(mapRow)

  if (opts.date)     data = data.filter((r) => r.timestamp.startsWith(opts.date))
  if (opts.month)    data = data.filter((r) => r.timestamp.startsWith(opts.month))
  if (opts.nurse)    data = data.filter((r) => r.nurse_name?.toLowerCase().includes(opts.nurse.toLowerCase()) ||
                                                r.telegram_username?.toLowerCase().includes(opts.nurse.toLowerCase()))
  if (opts.patient)  data = data.filter((r) => r.patient_name?.toLowerCase().includes(opts.patient.toLowerCase()))
  if (opts.item_key) data = data.filter((r) => r.item_key === opts.item_key ||
                                                ITEMS[r.item_key]?.category === opts.item_key)

  const sorted = data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return opts.limit ? sorted.slice(0, Number(opts.limit)) : sorted
}

/**
 * Get audit events for a specific nurse on a given date.
 * @param {string} nurseName
 * @param {string} [date]  YYYY-MM-DD, defaults to today
 */
export async function getAuditByNurse(nurseName, date = todayIso()) {
  return getAuditTrail({ nurse: nurseName, date })
}

/**
 * Get audit events for a specific patient in a month.
 * @param {string} patientName
 * @param {string} [month]  YYYY-MM
 */
export async function getAuditByPatient(patientName, month) {
  return getAuditTrail({ patient: patientName, month })
}

/**
 * Get audit events for a specific item on a given date.
 * @param {string} itemKey  e.g. 'PAMPERS_M' or category 'pampers'
 * @param {string} [date]
 */
export async function getAuditByItem(itemKey, date) {
  return getAuditTrail({ item_key: itemKey, date })
}

/**
 * Detect suspicious usage: nurse totals exceeding per-shift thresholds.
 *
 * Reads recent audit events (last SHIFT_HOURS hours for today)
 * and flags any category where total qty > SUSPICIOUS_THRESHOLD.
 *
 * @param {string} nurseName
 * @param {string} [date]  YYYY-MM-DD, defaults to today
 * @returns {Promise<Array<{ category, item_name, total_qty, threshold, pct_above }>>}
 */
export async function detectSuspiciousUsage(nurseName, date = todayIso()) {
  const events    = await getAuditByNurse(nurseName, date)
  const shiftCut  = new Date(Date.now() - SHIFT_HOURS * 60 * 60 * 1000).toISOString()

  // Only count TAKE_ITEM and GIVE_TO_PATIENT events in the last shift window
  const recent = events.filter((e) =>
    (e.action_type === 'TAKE_ITEM' || e.action_type === 'GIVE_TO_PATIENT') &&
    e.timestamp >= shiftCut
  )

  const catTotals = {}
  for (const e of recent) {
    const cat = ITEMS[e.item_key]?.category ?? ''
    if (!cat) continue
    catTotals[cat] = (catTotals[cat] ?? 0) + e.qty
  }

  const flags = []
  for (const [cat, total] of Object.entries(catTotals)) {
    const threshold = SUSPICIOUS_THRESHOLD[cat] ?? 0
    if (threshold > 0 && total >= threshold) {
      flags.push({
        category:   cat,
        item_name:  CATEGORY_DISPLAY[cat] ?? cat,
        total_qty:  total,
        threshold,
        pct_above:  Math.round(((total - threshold) / threshold) * 100),
      })
    }
  }
  return flags.sort((a, b) => b.pct_above - a.pct_above)
}

// ════════════════════════════════════════════════════════════════════════════
// Demo data builders (used when Sheet not configured)
// ════════════════════════════════════════════════════════════════════════════

const DEMO_NURSES   = ['@sarah', '@aini', '@rachel', '@mei']
const DEMO_ACTIONS  = ['GIVE_TO_PATIENT', 'GIVE_TO_PATIENT', 'TAKE_ITEM', 'GIVE_TO_PATIENT']
const DEMO_PATIENTS = ['Ahmad Bin Ali', 'Siti Binti Hamid', '', 'Lee Wei Ming']
const DEMO_ROOMS    = ['1', '2', '', '3']
const DEMO_ITEMS    = ['PAMPERS_M', 'PAMPERS_L', 'GLOVES_M', 'WET_TISSUE', 'MILK_FULL']
const DEMO_QTYS     = [3, 4, 10, 2, 5]

export function buildDemoAuditTrail(date = todayIso()) {
  const entries = []
  for (let i = 0; i < 20; i++) {
    const idx    = i % 5
    const nurse  = DEMO_NURSES[i % 4]
    const action = DEMO_ACTIONS[i % 4]
    const itemKey = DEMO_ITEMS[idx]
    const qty     = DEMO_QTYS[idx]
    const before  = 100 - i * 3
    const after   = Math.max(0, before - qty)
    const hours   = 7 + Math.floor(i * 0.7)
    const mins    = (i * 17) % 60

    entries.push({
      timestamp:         `${date}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00.000Z`,
      action_type:       action,
      nurse_name:        nurse,
      telegram_username: nurse,
      patient_name:      DEMO_PATIENTS[i % 4],
      room:              DEMO_ROOMS[i % 4],
      item_key:          itemKey,
      item_name:         ITEMS[itemKey]?.name ?? itemKey,
      qty,
      before_stock:      before,
      after_stock:       after,
      source:            i % 3 === 0 ? 'telegram-nlp' : 'telegram',
      remarks:           '',
    })
  }
  return entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

// ════════════════════════════════════════════════════════════════════════════
// Telegram reply formatter
// ════════════════════════════════════════════════════════════════════════════

const D = '─────────────────────────'

/**
 * Format audit trail as a Telegram reply.
 *
 * @param {string}   searchTerm
 * @param {object[]} records       top N records
 * @param {object[]} [suspicious]  from detectSuspiciousUsage()
 */
export function formatAuditReply(searchTerm, records, suspicious = []) {
  const catEmoji = { pampers: '👶', wet: '🧻', milk: '🥛', gloves: '🧤' }

  const lines = [
    `🧾 *Inventory Audit*`,
    `🔍 Search: ${searchTerm}`,
    D,
  ]

  if (records.length === 0) {
    lines.push('No records found.')
  } else {
    lines.push(`Latest ${records.length} records:`)
    records.slice(0, 10).forEach((r, i) => {
      const cat   = ITEMS[r.item_key]?.category ?? ''
      const emoji = catEmoji[cat] ?? '📦'
      const name  = r.item_name || r.item_key
      const time  = r.timestamp
        ? new Date(r.timestamp).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—'
      const patient = r.patient_name ? ` for ${r.patient_name}` : ''
      lines.push(`${i + 1}. ${emoji} ${name} ×${r.qty}${patient} by ${r.nurse_name} — ${time}`)
    })
    lines.push(D)
    lines.push(`${records.length} record${records.length !== 1 ? 's' : ''} found`)
  }

  // Suspicious usage warnings
  if (suspicious.length > 0) {
    lines.push('')
    for (const s of suspicious) {
      lines.push(
        `⚠️ *Possible Overuse Detected*\n` +
        `Nurse: ${searchTerm}\n` +
        `Item: ${s.item_name}\n` +
        `Qty this shift: *${s.total_qty}* (threshold: ${s.threshold})`
      )
    }
  }

  return lines.join('\n')
}
