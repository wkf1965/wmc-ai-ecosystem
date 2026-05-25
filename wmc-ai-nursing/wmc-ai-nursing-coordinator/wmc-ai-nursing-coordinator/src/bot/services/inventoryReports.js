/**
 * Inventory Reports Service  (Stage 5)
 *
 * Two layers:
 *
 *   compute*()  — pure functions that work on any log / balance arrays.
 *                 Used by API endpoints when Google Sheet is not configured
 *                 (they pass in demo data).
 *
 *   build*()    — async functions that fetch from Google Sheets first,
 *                 then delegate to compute*().
 *                 Used by Telegram commands and by API endpoints when the
 *                 Sheet IS configured.
 *
 * Anomaly threshold: 2× average daily usage (per user requirement).
 */

import {
  getInventoryLogs,
  getStockBalance,
  getLowStockAlerts,
  getPatientUsage,
  getNurseUsage,
} from './inventorySheets.js'
import {
  ITEMS,
  MIN_LEVELS,
  DEFAULT_STOCK,
  AVG_DAILY_USAGE,
  CATEGORY_DISPLAY,
  todayIso,
  currentYearMonth,
} from '../../lib/inventoryCalculation.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Multiplier above which a patient's usage is flagged as abnormal. */
const ANOMALY_THRESHOLD = 2.0   // 2× average daily usage

const CATEGORY_EMOJI = { pampers: '👶', wet: '🧻', milk: '🥛', gloves: '🧤' }
const D = '─────────────────────────'

// ════════════════════════════════════════════════════════════════════════════
// Pure compute helpers  (no sheet calls — work on plain arrays)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Group logs by item category and sum quantities.
 * @param {object[]} logs
 * @returns {{ byCategory: object, byItem: object, totalQty: number }}
 */
export function computeDailyReport(logs, targetDate) {
  const filtered = targetDate
    ? logs.filter((r) => (r.timestamp ?? '').startsWith(targetDate))
    : logs

  const byItem     = {}
  const byCategory = { pampers: 0, wet: 0, milk: 0, gloves: 0 }
  let   totalQty   = 0

  for (const r of filtered) {
    const key = r.item_key ?? ''
    const cat = ITEMS[key]?.category ?? 'other'
    byItem[key]       = (byItem[key] ?? 0) + Number(r.qty ?? 0)
    if (cat in byCategory) byCategory[cat] += Number(r.qty ?? 0)
    totalQty += Number(r.qty ?? 0)
  }

  return {
    date:        targetDate ?? todayIso(),
    byItem,
    byCategory,
    totalQty,
    recordCount: filtered.length,
  }
}

/**
 * Compute monthly patient totals from raw logs.
 * @param {object[]} logs
 * @returns {object[]}  sorted by total_qty desc
 */
export function computeMonthlyPatientSummary(logs) {
  const map = new Map()
  for (const r of logs) {
    if (!r.patient_name) continue
    const key = r.patient_name
    if (!map.has(key)) {
      map.set(key, {
        patient_name:     key,
        pampers_total:    0,
        wet_tissue_total: 0,
        milk_total:       0,
        gloves_total:     0,
        total_qty:        0,
      })
    }
    const e   = map.get(key)
    const cat = ITEMS[r.item_key]?.category ?? ''
    const qty = Number(r.qty ?? 0)
    if (cat === 'pampers') e.pampers_total    += qty
    if (cat === 'wet')     e.wet_tissue_total += qty
    if (cat === 'milk')    e.milk_total       += qty
    if (cat === 'gloves')  e.gloves_total     += qty
    e.total_qty += qty
  }
  return [...map.values()].sort((a, b) => b.total_qty - a.total_qty)
}

/**
 * Compute monthly nurse totals from raw logs.
 * @param {object[]} logs
 * @returns {object[]}  sorted by total_items_taken desc
 */
export function computeMonthlyNurseSummary(logs) {
  const map = new Map()
  for (const r of logs) {
    const key = r.nurse_name ?? r.telegram_username ?? 'Unknown'
    if (!map.has(key)) {
      map.set(key, {
        nurse_name:        key,
        pampers:           0,
        wet_tissue:        0,
        milk:              0,
        gloves:            0,
        total_items_taken: 0,
      })
    }
    const e   = map.get(key)
    const cat = ITEMS[r.item_key]?.category ?? ''
    const qty = Number(r.qty ?? 0)
    if (cat === 'pampers') e.pampers    += qty
    if (cat === 'wet')     e.wet_tissue += qty
    if (cat === 'milk')    e.milk       += qty
    if (cat === 'gloves')  e.gloves     += qty
    e.total_items_taken += qty
  }
  return [...map.values()].sort((a, b) => b.total_items_taken - a.total_items_taken)
}

/**
 * Compute low-stock items from a Stock_Balance row array.
 * @param {object[]} balanceRows   rows from getStockBalance()
 * @returns {object[]}
 */
export function computeLowStockReport(balanceRows) {
  return balanceRows
    .filter((r) => Number(r.balance ?? DEFAULT_STOCK[r.item_key]) <= Number(r.minimum_level ?? MIN_LEVELS[r.item_key] ?? 0))
    .map((r) => {
      const meta    = ITEMS[r.item_key] ?? {}
      const balance = Number(r.balance ?? DEFAULT_STOCK[r.item_key] ?? 0)
      const minLvl  = Number(r.minimum_level ?? MIN_LEVELS[r.item_key] ?? 0)
      return {
        item_key:      r.item_key,
        item_name:     r.item_name || meta.name || r.item_key,
        balance,
        minimum_level: minLvl,
        deficit:       Math.max(0, minLvl - balance),
        status:        balance === 0 ? 'OUT_OF_STOCK' : 'LOW',
      }
    })
    .sort((a, b) => b.deficit - a.deficit)
}

/**
 * Detect abnormal usage from raw logs for a specific date.
 * Threshold: patient qty for a category > ANOMALY_THRESHOLD × average.
 *
 * @param {object[]} logs
 * @param {string}   [targetDate]  YYYY-MM-DD
 * @returns {object[]}  abnormal records, sorted by multiple desc
 */
export function computeAbnormalReport(logs, targetDate) {
  const filtered = targetDate
    ? logs.filter((r) => (r.timestamp ?? '').startsWith(targetDate))
    : logs

  const patCatMap = new Map()
  for (const r of filtered) {
    if (!r.patient_name) continue
    const cat = ITEMS[r.item_key]?.category ?? ''
    if (!cat || cat === 'gloves') continue   // gloves are not per-patient
    const k = `${r.patient_name}|${cat}`
    patCatMap.set(k, (patCatMap.get(k) ?? 0) + Number(r.qty ?? 0))
  }

  const results = []
  for (const [k, totalQty] of patCatMap.entries()) {
    const [patientName, category] = k.split('|')
    const avg = AVG_DAILY_USAGE[category] ?? 0
    if (avg === 0) continue
    if (totalQty >= avg * ANOMALY_THRESHOLD) {
      results.push({
        patient_name: patientName,
        category,
        item_name:    CATEGORY_DISPLAY[category] ?? category,
        average_daily: avg,
        today_usage:  totalQty,
        multiple:     Math.round((totalQty / avg) * 10) / 10,
        pct_above:    Math.round(((totalQty - avg) / avg) * 100),
      })
    }
  }
  return results.sort((a, b) => b.multiple - a.multiple)
}

// ════════════════════════════════════════════════════════════════════════════
// Sheet-backed builders  (fetch data from Google Sheets)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build daily usage report for one date from Google Sheets.
 * @param {string} [date]  YYYY-MM-DD, defaults to today
 */
export async function buildDailyReport(date = todayIso()) {
  const logs   = await getInventoryLogs({ date })
  const report = computeDailyReport(logs, date)
  return { ...report, source: 'sheet' }
}

/**
 * Build monthly patient usage report.
 * Reads the Patient_Usage tab first; falls back to raw log computation if empty.
 *
 * @param {string} [month]  YYYY-MM
 */
export async function buildMonthlyPatientReport(month = currentYearMonth()) {
  let patients = await getPatientUsage(month).catch(() => [])

  if (patients.length === 0) {
    // Tab empty — compute from raw logs (first time, or before upserts ran)
    const logs = await getInventoryLogs({ month }).catch(() => [])
    patients   = computeMonthlyPatientSummary(logs)
  }

  return {
    month,
    patients: patients.sort((a, b) => b.total_qty - a.total_qty),
    source: 'sheet',
  }
}

/**
 * Build monthly nurse usage report.
 * Reads the Nurse_Usage tab first; falls back to raw log computation if empty.
 *
 * @param {string} [month]  YYYY-MM
 */
export async function buildMonthlyNurseReport(month = currentYearMonth()) {
  let nurses = await getNurseUsage(month).catch(() => [])

  if (nurses.length === 0) {
    const logs = await getInventoryLogs({ month }).catch(() => [])
    nurses     = computeMonthlyNurseSummary(logs)
  }

  return {
    month,
    nurses: nurses.sort((a, b) => b.total_items_taken - a.total_items_taken),
    source: 'sheet',
  }
}

/**
 * Build low-stock report from Stock_Balance tab.
 */
export async function buildLowStockReport() {
  const rows   = await getStockBalance()
  const alerts = computeLowStockReport(rows)
  return { alerts, count: alerts.length, source: 'sheet' }
}

/**
 * Build abnormal usage report for one date from Google Sheets.
 * @param {string} [date]  YYYY-MM-DD
 */
export async function buildAbnormalReport(date = todayIso()) {
  const logs    = await getInventoryLogs({ date })
  const abnormal = computeAbnormalReport(logs, date)
  return { date, abnormal, count: abnormal.length, source: 'sheet' }
}

// ════════════════════════════════════════════════════════════════════════════
// Telegram reply formatters
// ════════════════════════════════════════════════════════════════════════════

function fmtDate(dateStr) {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-MY', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch { return dateStr }
}

function fmtMonth(monthStr) {
  try {
    return new Date(monthStr + '-01').toLocaleDateString('en-MY', {
      month: 'long', year: 'numeric',
    })
  } catch { return monthStr }
}

/** Format the daily usage report for Telegram. */
export function formatDailyReportReply(report) {
  const cats = [
    { key: 'pampers', unit: 'pcs'    },
    { key: 'wet',     unit: 'packs'  },
    { key: 'milk',    unit: 'scoops' },
    { key: 'gloves',  unit: 'pcs'    },
  ]
  const lines = [
    `📊 *Daily Inventory Usage*`,
    `📅 Date: ${fmtDate(report.date)}`,
    D,
  ]
  for (const { key, unit } of cats) {
    const qty  = report.byCategory?.[key] ?? 0
    const icon = CATEGORY_EMOJI[key] ?? '📦'
    lines.push(`${icon} ${CATEGORY_DISPLAY[key]}: *${qty}* ${unit}`)
  }
  lines.push(D)
  lines.push(`Total: *${report.totalQty}* items · ${report.recordCount} records`)
  return lines.join('\n')
}

/** Format the monthly summary report for Telegram. */
export function formatMonthlyReportReply(dailyReport, patientReport) {
  const lines = [
    `📅 *Monthly Usage — ${fmtMonth(patientReport?.month ?? '')}*`,
    D,
  ]
  // Category totals from daily totals (sum of month logs)
  for (const { key, unit } of [
    { key: 'pampers', unit: 'pcs' },
    { key: 'wet',     unit: 'packs' },
    { key: 'milk',    unit: 'scoops' },
    { key: 'gloves',  unit: 'pcs' },
  ]) {
    const qty  = dailyReport.byCategory?.[key] ?? 0
    lines.push(`${CATEGORY_EMOJI[key]} ${CATEGORY_DISPLAY[key]}: *${qty}* ${unit}`)
  }
  lines.push(D)
  // Top 5 patients
  const patients = (patientReport?.patients ?? []).slice(0, 5)
  if (patients.length > 0) {
    lines.push(`👥 *Top Patients:*`)
    patients.forEach((p, i) => lines.push(`${i + 1}. ${p.patient_name} — ${p.total_qty} items`))
    lines.push(D)
  }
  lines.push(`Total: *${dailyReport.totalQty}* items · ${dailyReport.recordCount} records`)
  return lines.join('\n')
}

/** Format the low stock report for Telegram. */
export function formatLowStockReply(report) {
  if (report.count === 0) {
    return `📦 *Low Stock Report*\n${D}\n✅ All items are above minimum levels.\nNo restocking needed.`
  }
  const lines = [`📦 *Low Stock Report*`, D]
  for (const a of report.alerts) {
    lines.push(
      `⚠️ *${a.item_name}* — ${a.balance} (min: ${a.minimum_level})`,
      `   Need *${a.deficit}* more to reach minimum`,
    )
  }
  lines.push(D)
  lines.push(`${report.count} item${report.count > 1 ? 's' : ''} need restocking`)
  return lines.join('\n')
}

/** Format the abnormal usage report for Telegram. */
export function formatAbnormalReply(report) {
  if (report.count === 0) {
    return `🚨 *Abnormal Usage — ${fmtDate(report.date)}*\n${D}\n✅ No abnormal usage detected today.`
  }
  const lines = [`🚨 *Abnormal Usage — ${fmtDate(report.date)}*`, D]
  for (const a of report.abnormal) {
    lines.push(
      `⚠️ *Patient: ${a.patient_name}*`,
      `   Item: ${a.item_name}`,
      `   Average: ${a.average_daily}/day   Today: *${a.today_usage}*`,
      `   ↑ ${a.pct_above}% above average (${a.multiple}×)`,
      '',
    )
  }
  lines.push(D)
  lines.push(`${report.count} abnormal record${report.count > 1 ? 's' : ''} found`)
  return lines.join('\n').trim()
}
