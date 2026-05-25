/**
 * Inventory Calculation — Core Logic
 *
 * Stateless pure functions for:
 *  - Item catalogue & defaults
 *  - Stock balance computation
 *  - Low-stock alert detection
 *  - AI anomaly / abnormal-usage detection
 *  - NLP free-text parser ("Room 2 Ali pampers 3")
 *  - Telegram reply formatters
 */

// ── Item catalogue ────────────────────────────────────────────────────────────

/** Canonical item keys → display config */
export const ITEMS = {
  PAMPERS_M:   { name: 'Pampers M Size',        unit: 'pcs',    category: 'pampers',  emoji: '👶' },
  PAMPERS_L:   { name: 'Pampers L Size',        unit: 'pcs',    category: 'pampers',  emoji: '👶' },
  PAMPERS_XL:  { name: 'Pampers XL Size',       unit: 'pcs',    category: 'pampers',  emoji: '👶' },
  WET_TISSUE:  { name: 'Wet Tissue (pack)',     unit: 'packs',  category: 'wet',      emoji: '🧻' },
  MILK_FULL:   { name: 'Milk Powder (Full Cream)', unit: 'scoops', category: 'milk',  emoji: '🥛' },
  MILK_LOW:    { name: 'Milk Powder (Low Fat)', unit: 'scoops', category: 'milk',     emoji: '🥛' },
  GLOVES_S:    { name: 'Gloves S',              unit: 'pcs',    category: 'gloves',   emoji: '🧤' },
  GLOVES_M:    { name: 'Gloves M',              unit: 'pcs',    category: 'gloves',   emoji: '🧤' },
  GLOVES_L:    { name: 'Gloves L',              unit: 'pcs',    category: 'gloves',   emoji: '🧤' },
}

/** Default opening stock when no record exists. */
export const DEFAULT_STOCK = {
  PAMPERS_M:  100, PAMPERS_L:  100, PAMPERS_XL:  50,
  WET_TISSUE:  50,
  MILK_FULL:  200, MILK_LOW:   200,
  GLOVES_S:   200, GLOVES_M:  200, GLOVES_L:   100,
}

/** Alert threshold — warn when balance falls below this. */
export const MIN_LEVELS = {
  PAMPERS_M:   20, PAMPERS_L:   20, PAMPERS_XL:  15,
  WET_TISSUE:  10,
  MILK_FULL:   50, MILK_LOW:    50,
  GLOVES_S:    50, GLOVES_M:   50, GLOVES_L:    30,
}

/**
 * Expected average daily usage per patient (for anomaly baseline).
 * Keys are categories.
 */
export const AVG_DAILY_USAGE = {
  pampers: 5,
  wet:     3,
  milk:    6,
  gloves:  0,   // gloves are not per-patient; skip anomaly check
}

/** Multiplier above which usage is flagged as abnormal. */
const ANOMALY_THRESHOLD = 2.5

// ── NLP Parser ────────────────────────────────────────────────────────────────

/** Lower-case keyword → item key(s), ordered longest-match first. */
const ITEM_KEYWORDS = [
  { key: 'PAMPERS_XL', keywords: ['pampers xl', 'diaper xl', 'pampers x l', 'xl pampers'] },
  { key: 'PAMPERS_L',  keywords: ['pampers l', 'diaper l', 'l pampers', 'large pampers', 'pampers large'] },
  { key: 'PAMPERS_M',  keywords: ['pampers m', 'diaper m', 'm pampers', 'medium pampers'] },
  { key: 'PAMPERS',    keywords: ['pampers', 'diaper', 'diapers', 'adult diaper'] },  // generic → resolved by size later
  { key: 'WET_TISSUE', keywords: ['wet tissue', 'wet wipes', 'wipes'] },
  { key: 'MILK_LOW',   keywords: ['milk low', 'low fat milk', 'low fat', 'milk skim'] },
  { key: 'MILK_FULL',  keywords: ['milk full', 'full cream', 'full fat', 'fresh milk'] },
  { key: 'MILK',       keywords: ['milk', 'milk powder', 'formula'] },               // generic
  { key: 'GLOVES_S',   keywords: ['gloves s', 'glove s', 'small gloves', 's gloves'] },
  { key: 'GLOVES_M',   keywords: ['gloves m', 'glove m', 'medium gloves', 'm gloves'] },
  { key: 'GLOVES_L',   keywords: ['gloves l', 'glove l', 'large gloves', 'l gloves'] },
  { key: 'GLOVES',     keywords: ['gloves', 'glove', 'latex gloves', 'rubber gloves'] },
]

/**
 * Parse free-text inventory input.
 *
 * Recognises:
 *   "Room 2 Ali pampers 3"
 *   "Ali Room 3 gloves M 2"
 *   "pampers L 5 ali room 4"
 *   "Room 5 Siti milk 4 scoops"
 *   "Nurse Aina gave Mary pampers M size 4"   ← nurse name extraction
 *   "wet tissue 2 Siti Room 3"
 *
 * @param {string} text
 * @returns {{
 *   room: string|null,
 *   nurseName: string|null,
 *   patientName: string|null,
 *   itemKey: string|null,
 *   size: string|null,
 *   qty: number|null
 * }}
 */
/**
 * Reject inventory parse when nursing clinical language dominates.
 * @param {string} text
 * @returns {boolean}
 */
export function shouldRejectInventoryParse(text) {
  const t = String(text ?? '').toLowerCase()
  const nursing = /\b(room|patient|poor\s+appetite|weak|fever|turned|bp|pulse|fall|fell|handover|appetite|mobility|vitals?)\b/i
  const inventory = /\b(milk\s+powder|pampers|diapers?|wet\s+tissue|gloves?|stock|qty|used|taken|scoops?|milk|wipes)\b/i
  if (nursing.test(t) && !inventory.test(t)) return true
  return false
}

export function parseNlpInventory(text) {
  const original = text.trim()
  if (!original || shouldRejectInventoryParse(original)) {
    return { room: null, nurseName: null, patientName: null, itemKey: null, size: null, qty: null }
  }
  let lower = original.toLowerCase()

  // 1. Strip command prefix if present
  lower = lower.replace(/^\/\w+\s*/, '')

  // 2. Nurse name — "Nurse [Name]", "by [Name]", "given by [Name]"
  // Must run BEFORE patient extraction to avoid treating nurse name as patient
  const nursePattern = /\bnurse\s+([a-z]+)\b|\bgiven?\s+by\s+([a-z]+)\b/i
  const nurseMatch   = lower.match(nursePattern)
  const nurseName    = nurseMatch
    ? (nurseMatch[1] ?? nurseMatch[2] ?? null)
    : null
  const parsedNurse = nurseName
    ? nurseName.charAt(0).toUpperCase() + nurseName.slice(1).toLowerCase()
    : null
  // Strip nurse phrase so it doesn't bleed into patient name
  if (nurseMatch) lower = lower.replace(nurseMatch[0], ' ')
  // Strip transition verbs: "gave", "give", "for", "used", "took"
  lower = lower.replace(/\b(?:gave|give|given|used|took|take)\b/gi, ' ')

  // 3. Room number
  const roomMatch = lower.match(/\broom\s*(\d+)\b/i) ?? lower.match(/\br(\d+)\b/i)
  const room      = roomMatch ? roomMatch[1] : null
  if (room) lower = lower.replace(roomMatch[0], ' ')

  // 4. Item (longest-match first)
  let itemKey   = null
  let matchedKw = null
  for (const { key, keywords } of ITEM_KEYWORDS) {
    const sorted = [...keywords].sort((a, b) => b.length - a.length)
    for (const kw of sorted) {
      if (lower.includes(kw)) {
        itemKey   = key
        matchedKw = kw
        break
      }
    }
    if (itemKey) break
  }
  if (matchedKw) lower = lower.replace(matchedKw, ' ')

  // 5. Size (S / M / L / XL) — for generic PAMPERS/GLOVES
  const sizeMap = {
    xl: 'XL', 'x l': 'XL', 'x-l': 'XL',
    large: 'L', l: 'L',
    medium: 'M', m: 'M',
    small: 'S', s: 'S',
  }
  // "size M", "M size", bare "M / L / XL / S"
  const sizePattern = /\bsize\s+(xl|l|m|s)\b|\b(xl|large|medium|small)\b|\b([lms])\s+size\b/i
  const sizeMatch   = lower.match(sizePattern)
  let size = null
  if (sizeMatch) {
    const raw = (sizeMatch[1] ?? sizeMatch[2] ?? sizeMatch[3] ?? '').toLowerCase()
    size      = sizeMap[raw] ?? null
    lower     = lower.replace(sizeMatch[0], ' ')
    // Resolve generic item + size to specific key
    if (itemKey === 'PAMPERS' && size) itemKey = `PAMPERS_${size}`
    if (itemKey === 'GLOVES'  && size) itemKey = `GLOVES_${size}`
    if (itemKey === 'MILK'    && size === 'L') itemKey = 'MILK_LOW'
    if (itemKey === 'MILK'    && size === 'F') itemKey = 'MILK_FULL'
  }

  // 6. Quantity — prefer number paired with unit words; room and qty may share digits
  const unitQtyMatch =
    lower.match(/\b(\d+)\s*(?:scoops?|scoop|pcs|pieces?|piece|packs?|pack|units?|unit)\b/i)
    ?? lower.match(/\b(?:qty|quantity)\s*[:=]?\s*(\d+)\b/i)

  let qty = unitQtyMatch ? Number(unitQtyMatch[1]) : null

  if (qty == null) {
    const numbers  = lower.match(/\b(\d+)\b/g) ?? []
    const safeNums = numbers.map(Number).filter((n) => n !== Number(room) && n > 0 && n < 10000)
    qty = safeNums.length > 0 ? safeNums[safeNums.length - 1] : null
  }

  if (qty == null && room != null) {
    const beforeRoom = lower.split(/\broom\b/i)[0] ?? lower
    const earlyNum   = beforeRoom.match(/\b(\d+)\b/)
    if (earlyNum) qty = Number(earlyNum[1])
  }

  if (qty != null) lower = lower.replace(new RegExp(`\\b${qty}\\b`), ' ')

  // 7. Remove filler / unit words
  const fillers = ['scoops', 'scoop', 'pcs', 'packs', 'pack', 'pieces', 'piece', 'units', 'unit', 'size']
  for (const f of fillers) lower = lower.replace(new RegExp(`\\b${f}\\b`, 'g'), ' ')

  // 8. Patient name — whatever meaningful words remain
  const stop = new Set(['room', 'r', 'for', 'in', 'of', 'the', 'a', 'and', 'to', 'by', 'at', 'nurse'])
  const nameWords = lower
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ''))
    .filter((w) => w.length > 1 && !stop.has(w))
  const patientName = nameWords.length > 0
    ? nameWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : null

  return { room, nurseName: parsedNurse, patientName, itemKey, size, qty }
}

// ── Stock balance ─────────────────────────────────────────────────────────────

/**
 * Compute current stock for every item key from a list of usage logs.
 *
 * @param {object[]} logs   Array of {item_key, qty} records
 * @returns {Record<string, number>}  itemKey → remaining balance
 */
export function computeStockBalance(logs) {
  const balance = { ...DEFAULT_STOCK }
  for (const log of logs) {
    const key = log.item_key ?? log.item
    if (key && balance[key] !== undefined) {
      balance[key] = Math.max(0, balance[key] - Number(log.qty ?? 0))
    }
  }
  return balance
}

/**
 * Return items below their minimum level.
 *
 * @param {Record<string, number>} balance  itemKey → qty
 * @returns {Array<{ itemKey, name, balance, minLevel, deficit }>}
 */
export function getLowStockAlerts(balance) {
  return Object.entries(ITEMS)
    .filter(([key]) => (balance[key] ?? DEFAULT_STOCK[key]) < (MIN_LEVELS[key] ?? 0))
    .map(([key, meta]) => ({
      itemKey:  key,
      name:     meta.name,
      balance:  balance[key] ?? DEFAULT_STOCK[key],
      minLevel: MIN_LEVELS[key],
      deficit:  MIN_LEVELS[key] - (balance[key] ?? DEFAULT_STOCK[key]),
    }))
}

// ── Anomaly detection ─────────────────────────────────────────────────────────

/**
 * Check whether a patient's usage for a specific category on a given date
 * is abnormally high compared to the per-patient daily average.
 *
 * @param {string}   patientName
 * @param {string}   category    'pampers' | 'wet' | 'milk'
 * @param {number}   qtyToday    how many were issued today so far (incl. this log)
 * @returns {{ flagged: boolean, message: string }}
 */
export function detectAnomalousUsage(patientName, category, qtyToday) {
  const avg = AVG_DAILY_USAGE[category] ?? 0
  if (avg === 0) return { flagged: false, message: '' }

  const flagged = qtyToday >= avg * ANOMALY_THRESHOLD
  const message = flagged
    ? `⚠️ Abnormal ${category} usage detected for ${patientName}:\n` +
      `  Average: ${avg}/day  Today: ${qtyToday}\n` +
      `  Please notify supervisor for review.`
    : ''
  return { flagged, message }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function currentMonthLabel() {
  return new Date().toLocaleString('en-MY', { month: 'long', year: 'numeric' })
}

export function currentYearMonth() {
  return new Date().toISOString().slice(0, 7)   // "YYYY-MM"
}

// ── Telegram reply formatters ─────────────────────────────────────────────────

const D = '─────────────────────────'

/**
 * Friendly base item name (category label, no size suffix).
 * e.g. PAMPERS_M → "Pampers",  WET_TISSUE → "Wet Tissue"
 */
export const CATEGORY_DISPLAY = {
  pampers: 'Pampers',
  wet:     'Wet Tissue',
  milk:    'Milk Powder',
  gloves:  'Gloves',
}

/**
 * Format a saved inventory log as a Telegram confirmation reply.
 *
 * Output example:
 *   ✅ Inventory Recorded
 *   ─────────────────────────
 *   Patient: Ali
 *   Room: Room 2
 *   Item: Pampers
 *   Size: M
 *   Qty: 3 pcs
 *   Recorded by: Nurse Aina
 *   Time: 02:30 PM
 *   ─────────────────────────
 */
export function formatInventoryConfirmReply(log) {
  const item        = ITEMS[log.item_key]
  const category    = item?.category ?? ''
  const baseItem    = CATEGORY_DISPLAY[category] ?? (item?.name ?? log.item_key)

  // Show size only for items that have meaningful sizes (pampers + gloves)
  const showSize    = ['pampers', 'gloves'].includes(category)
  const sizeLabel   = showSize && log.size ? log.size.toUpperCase() : null

  // Room display — prefix "Room " if it looks like a bare number
  const roomLabel   = log.room
    ? (/^\d+$/.test(String(log.room).trim()) ? `Room ${log.room}` : log.room)
    : null

  // Nurse display
  const nurseLabel  = log.nurse_name ? `Nurse ${log.nurse_name}` : 'Unknown'

  // Time display
  let timeLabel = ''
  try {
    timeLabel = new Date(log.timestamp).toLocaleTimeString('en-MY', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch { timeLabel = '' }

  return [
    `✅ *Inventory Recorded*`,
    D,
    log.patient_name          ? `👤 Patient: ${log.patient_name}`         : null,
    roomLabel                 ? `🏥 Room: ${roomLabel}`                    : null,
    `📦 Item: ${baseItem}`,
    sizeLabel                 ? `📐 Size: ${sizeLabel}`                    : null,
    `🔢 Qty: ${log.qty}${item?.unit ? ' ' + item.unit : ''}`,
    `👩‍⚕️ Recorded by: ${nurseLabel}`,
    timeLabel                 ? `🕐 Time: ${timeLabel}`                    : null,
    log.remarks && log.remarks !== 'NLP' && log.remarks !== ''
                              ? `📝 Remarks: ${log.remarks}`               : null,
    D,
  ].filter(Boolean).join('\n')
}

/**
 * Format the /stock reply — current balance for all items.
 */
export function formatStockReply(balance, alerts) {
  const lines = [`📦 *Stock Balance*`, D]
  for (const [key, meta] of Object.entries(ITEMS)) {
    const qty  = balance[key] ?? DEFAULT_STOCK[key]
    const low  = qty < (MIN_LEVELS[key] ?? 0)
    const icon = low ? '⚠️' : '✅'
    lines.push(`${icon} ${meta.emoji} ${meta.name}: *${qty}* ${meta.unit}`)
  }
  if (alerts.length > 0) {
    lines.push('', D, `🚨 *Low Stock Alerts (${alerts.length}):*`)
    for (const a of alerts) {
      lines.push(`  ⚠️ ${a.name} — only *${a.balance}* left (min: ${a.minLevel})`)
    }
  }
  return lines.join('\n')
}

/**
 * Format the /usage reply for a given period.
 *
 * @param {object[]} logs      filtered logs for the period
 * @param {string}   label     period label e.g. "Today" or "May 2026"
 */
export function formatUsageReply(logs, label) {
  if (logs.length === 0) {
    return `📊 *Usage Report — ${label}*\n${D}\nNo records found for this period.`
  }

  // Total per item
  const totals = {}
  const byPatient = {}
  const byNurse = {}

  for (const log of logs) {
    const qty = Number(log.qty ?? 0)
    totals[log.item_key]  = (totals[log.item_key]  ?? 0) + qty
    if (log.patient_name) byPatient[log.patient_name] = (byPatient[log.patient_name] ?? 0) + qty
    if (log.nurse_name)   byNurse[log.nurse_name]     = (byNurse[log.nurse_name]     ?? 0) + qty
  }

  const lines = [`📊 *Usage Report — ${label}*`, D]
  lines.push(`📦 *Items Used:*`)
  for (const [key, qty] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    const meta = ITEMS[key]
    lines.push(`  ${meta?.emoji ?? '•'} ${meta?.name ?? key}: ${qty}`)
  }

  // Top patients
  const topPatients = Object.entries(byPatient).sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (topPatients.length > 0) {
    lines.push('', `👥 *Top Patient Usage:*`)
    topPatients.forEach(([p, q], i) => lines.push(`  ${i + 1}. ${p}: ${q} items`))
  }

  // Top nurses
  const topNurses = Object.entries(byNurse).sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topNurses.length > 0) {
    lines.push('', `👩‍⚕️ *Top Nurse Usage:*`)
    topNurses.forEach(([n, q], i) => lines.push(`  ${i + 1}. ${n}: ${q} items issued`))
  }

  return lines.join('\n')
}

/**
 * Build a short inventory summary section for the shift handover.
 */
export function buildInventoryHandoverSection(logs) {
  if (logs.length === 0) return 'No inventory issues recorded this shift.'
  const totals = {}
  for (const log of logs) {
    const name = ITEMS[log.item_key]?.name ?? log.item_key
    totals[name] = (totals[name] ?? 0) + Number(log.qty ?? 0)
  }
  return Object.entries(totals)
    .map(([name, qty]) => `  • ${name}: ${qty}`)
    .join('\n')
}
