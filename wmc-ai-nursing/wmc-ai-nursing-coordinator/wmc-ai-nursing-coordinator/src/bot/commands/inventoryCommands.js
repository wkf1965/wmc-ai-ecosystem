/**
 * Inventory Telegram Commands
 *
 * Structured commands (multi-step):
 *   /pampers  — log pampers usage for a patient
 *   /wet      — log wet tissue usage
 *   /milk     — log milk powder usage
 *   /gloves   — log gloves usage (no patient required)
 *
 * Reporting commands (immediate):
 *   /stock    — show current stock balance + alerts
 *   /usage    — show usage summary (today or a month)
 *
 * NLP Mode:
 *   Any free-text message in an active NLP session is parsed using the
 *   inventoryCalculation parser. Nurses can also type naturally in the
 *   global message handler if they are not inside another workflow.
 *   Example: "Room 2 Ali pampers 3"
 *
 * Session state is tracked via the existing stateManager (workflow = 'inventory')
 * and listed in SELF_HANDLED_WORKFLOWS so the global handler skips it.
 */

import { log }                 from '../utils/logger.js'
import { setState, getState, finishInventorySession, withSessionLock } from '../services/stateManager.js'
import {
  saveFullInventoryRecord,
  isSheetConfigured,
  getInventoryLogs,
  getStockBalance,
  getLowStockAlerts,
} from '../services/inventorySheets.js'
import {
  buildDailyReport,
  buildMonthlyPatientReport,
  buildMonthlyNurseReport,
  buildLowStockReport,
  buildAbnormalReport,
  computeDailyReport,
  computeMonthlyPatientSummary,
  computeLowStockReport,
  computeAbnormalReport,
  formatDailyReportReply,
  formatMonthlyReportReply,
  formatLowStockReply,
  formatAbnormalReply,
} from '../services/inventoryReports.js'
import {
  generateBillingForMonth,
  getBillingPatientSummary,
  isBillingSheetConfigured,
} from '../services/billingSheets.js'
import { getPrices, PRICE_UNITS } from '../services/billingPrices.js'
import {
  getAuditTrail,
  detectSuspiciousUsage,
  buildDemoAuditTrail,
  formatAuditReply,
  isAuditConfigured,
} from '../services/auditTrailService.js'
import {
  parseNlpInventory,
  formatInventoryConfirmReply,
  formatStockReply,
  formatUsageReply,
  detectAnomalousUsage,
  todayIso,
  ITEMS,
  MIN_LEVELS,
  DEFAULT_STOCK,
} from '../../lib/inventoryCalculation.js'
import {
  classifyTelegramIntent,
  hasNursingKeywords,
  isClearInventoryMessage,
} from '../../lib/telegramIntentClassifier.js'
import { tryHandleNursingNlp } from '../services/nursingNlpHandler.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const D = '─────────────────────────'

function nurseName(msg) {
  return msg.from?.first_name ?? msg.from?.username ?? 'Nurse'
}
function telegramUsername(msg) {
  return msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name ?? '')
}

// ── Workflow definitions ──────────────────────────────────────────────────────

const SKIP_KEYWORD = '-'   // nurse can type "-" to skip optional remarks

const WORKFLOWS = {
  pampers: {
    steps:   ['patient_name', 'room', 'size', 'qty', 'remarks'],
    prompts: {
      patient_name: '👶 *Pampers Usage*\n─────────────────────────\n👤 *Patient Name?*',
      room:         '🏥 *Room Number?*',
      size:         '📐 *Pampers Size?*\nReply: `M` / `L` / `XL`',
      qty:          '🔢 *Quantity (pcs)?*',
      remarks:      '📝 *Remarks?*\n_(Type remarks or `-` to skip)_',
    },
    validate: {
      size: (v) => ['m', 'l', 'xl'].includes(v.toLowerCase()) ||
                   'Please reply M, L, or XL.',
      qty:  (v) => (!isNaN(Number(v)) && Number(v) > 0) ||
                   'Please enter a whole number greater than 0.',
    },
    resolveItemKey: (answers) => `PAMPERS_${String(answers.size ?? 'M').toUpperCase()}`,
  },
  wet: {
    steps:   ['patient_name', 'room', 'qty', 'remarks'],
    prompts: {
      patient_name: '🧻 *Wet Tissue Usage*\n─────────────────────────\n👤 *Patient Name?*',
      room:         '🏥 *Room Number?*',
      qty:          '🔢 *Quantity (packs)?*',
      remarks:      '📝 *Remarks?*\n_(Type remarks or `-` to skip)_',
    },
    validate: {
      qty: (v) => (!isNaN(Number(v)) && Number(v) > 0) ||
                  'Please enter a whole number greater than 0.',
    },
    resolveItemKey: () => 'WET_TISSUE',
  },
  milk: {
    steps:   ['patient_name', 'room', 'milk_type', 'qty', 'remarks'],
    prompts: {
      patient_name: '🥛 *Milk Powder Usage*\n─────────────────────────\n👤 *Patient Name?*',
      room:         '🏥 *Room Number?*',
      milk_type:    '🥛 *Milk Type?*\n1️⃣ Full Cream\n2️⃣ Low Fat',
      qty:          '🔢 *Quantity (scoops)?*',
      remarks:      '📝 *Remarks?*\n_(Type remarks or `-` to skip)_',
    },
    validate: {
      milk_type: (v) => ['1', '2', 'full', 'low', 'full cream', 'low fat'].includes(v.toLowerCase()) ||
                        'Please reply 1 (Full Cream) or 2 (Low Fat).',
      qty: (v) => (!isNaN(Number(v)) && Number(v) > 0) ||
                  'Please enter a whole number greater than 0.',
    },
    resolveItemKey: (answers) => {
      const t = String(answers.milk_type ?? '').toLowerCase()
      return (t === '2' || t.includes('low')) ? 'MILK_LOW' : 'MILK_FULL'
    },
  },
  gloves: {
    steps:   ['size', 'qty', 'remarks'],
    prompts: {
      size:    '🧤 *Gloves Usage*\n─────────────────────────\n📐 *Gloves Size?*\nReply: `S` / `M` / `L`',
      qty:     '🔢 *Quantity (pcs)?*',
      remarks: '📝 *Remarks?*\n_(Type remarks or `-` to skip)_',
    },
    validate: {
      size: (v) => ['s', 'm', 'l'].includes(v.toLowerCase()) ||
                   'Please reply S, M, or L.',
      qty:  (v) => (!isNaN(Number(v)) && Number(v) > 0) ||
                   'Please enter a whole number greater than 0.',
    },
    resolveItemKey: (answers) => `GLOVES_${String(answers.size ?? 'M').toUpperCase()}`,
  },
}

// ── Multi-step handler ────────────────────────────────────────────────────────

function startInventoryWorkflow(bot, msg, workflowName) {
  const chatId   = msg.chat.id
  const workflow = WORKFLOWS[workflowName]
  if (!workflow) return

  setState(msg, {
    workflow:         'inventory',
    flow:             'inventory',
    pendingInventory: workflowName,
    subtype:          workflowName,
    step:             0,
    answers:          {},
  })

  const firstStep   = workflow.steps[0]
  const firstPrompt = workflow.prompts[firstStep]
  const item        = ITEMS[`${workflowName.toUpperCase()}_M`] ?? Object.values(ITEMS).find((i) => i.category === workflowName)
  const header      = item ? `${item.emoji} *${workflowName.charAt(0).toUpperCase() + workflowName.slice(1)} Usage*\n${D}\n` : ''

  bot.sendMessage(chatId, `${header}${firstPrompt}`, { parse_mode: 'Markdown' })
  log.info(`[inv-cmd] ${workflowName} workflow started — chat:${chatId}`)
}

async function handleInventoryStep(bot, msg) {
  const chatId = msg.chat.id
  const state  = getState(msg)
  if (!state || (state.workflow !== 'inventory' && state.flow !== 'inventory' && !state.pendingInventory)) return false

  const workflow = WORKFLOWS[state.subtype]
  if (!workflow) { finishInventorySession(msg, 'invalid inventory subtype'); return false }

  const text = (msg.text ?? '').trim()

  // Nursing notes must not continue an inventory workflow
  if (hasNursingKeywords(text) && !isClearInventoryMessage(text)) {
    const intent = classifyTelegramIntent(text)
    finishInventorySession(msg, 'nursing override')
    await tryHandleNursingNlp(bot, msg, intent)
    return true
  }

  const stepKey = workflow.steps[state.step]
  const validator = workflow.validate?.[stepKey]

  // Validate current answer
  if (validator) {
    const result = validator(text)
    if (result !== true) {
      await bot.sendMessage(chatId, `❌ ${result}`, { parse_mode: 'Markdown' })
      return true
    }
  }

  // Store the answer
  state.answers[stepKey] = text
  state.step += 1
  setState(msg, state)

  // Move to next step or finish
  if (state.step < workflow.steps.length) {
    const nextStep   = workflow.steps[state.step]
    const nextPrompt = workflow.prompts[nextStep]
    await bot.sendMessage(chatId, nextPrompt, { parse_mode: 'Markdown' })
    return true
  }

  // All steps done — save record, then clear session so nursing NLP can run
  await saveInventoryRecord(bot, msg, state.subtype, state.answers)
  finishInventorySession(msg, 'inventory complete')
  return true
}

/** Called from hybrid message router when an inventory workflow is active. */
export async function handleInventoryStepIfActive(bot, msg) {
  if (!msg.text || msg.text.startsWith('/')) return false
  const state = getState(msg)
  if (!state || (state.workflow !== 'inventory' && state.flow !== 'inventory' && !state.pendingInventory)) {
    return false
  }
  await withSessionLock(msg, () => handleInventoryStep(bot, msg))
  return true
}

async function saveInventoryRecord(bot, msg, workflowName, answers) {
  const chatId   = msg.chat.id
  const workflow = WORKFLOWS[workflowName]
  const itemKey  = workflow.resolveItemKey(answers)
  const qty      = Number(answers.qty ?? 0)
  const now      = new Date().toISOString()
  const nurse    = nurseName(msg)
  const tgUser   = telegramUsername(msg)

  // remarks: "-" means skip
  const rawRemarks = answers.remarks ?? ''
  const remarks    = rawRemarks === SKIP_KEYWORD ? '' : rawRemarks

  // For milk, size field gets the milk type label; for others, use the size field
  let sizeField = answers.size ?? ''
  if (workflowName === 'milk') {
    const t = String(answers.milk_type ?? '').toLowerCase()
    sizeField = (t === '2' || t.includes('low')) ? 'Low Fat' : 'Full Cream'
  }

  const record = {
    timestamp:         now,
    nurse_name:        nurse,
    telegram_username: tgUser,
    patient_name:      answers.patient_name ?? '',
    room:              answers.room          ?? '',
    item_key:          itemKey,
    size:              sizeField,
    qty,
    remarks,
    source:            'telegram',
  }

  // Non-blocking full sheet save (logs + stock balance + alerts + patient/nurse usage)
  if (isSheetConfigured()) {
    saveFullInventoryRecord(record).catch((err) =>
      log.error('[inv-cmd] sheet save error:', err.message)
    )
  } else {
    log.warn('[inv-cmd] Google Sheet not configured — record saved locally only')
  }

  // ── Build reply fragments concurrently ──────────────────────────────────────

  // 1. Low stock inline warning — read current balance, subtract this qty
  let stockWarn = ''
  if (isSheetConfigured()) {
    try {
      const balanceRows = await getStockBalance().catch(() => [])
      const row         = balanceRows.find((r) => r.item_key === itemKey)
      const current     = row?.balance ?? DEFAULT_STOCK[itemKey] ?? 0
      const newBalance  = Math.max(0, current - qty)
      const minLevel    = MIN_LEVELS[itemKey] ?? 0
      if (newBalance <= minLevel) {
        const meta = ITEMS[itemKey]
        stockWarn = `\n\n⚠️ *Low Stock Alert:*\n${meta?.name ?? itemKey} remaining only *${newBalance}*`
      }
    } catch { /* non-fatal */ }
  }

  // 2. Anomaly check
  let anomalyMsg = ''
  if (record.patient_name) {
    const category = ITEMS[itemKey]?.category ?? ''
    try {
      const todayLogs  = isSheetConfigured()
        ? await getInventoryLogs({ date: todayIso() }).catch(() => [])
        : []
      const todayTotal = todayLogs
        .filter((r) =>
          r.patient_name === record.patient_name &&
          ITEMS[r.item_key]?.category === category,
        )
        .reduce((s, r) => s + r.qty, 0) + qty
      const check = detectAnomalousUsage(record.patient_name, category, todayTotal)
      if (check.flagged) anomalyMsg = `\n\n${check.message}`
    } catch { /* non-fatal */ }
  }

  const reply = formatInventoryConfirmReply(record)
  await bot.sendMessage(chatId, reply + stockWarn + anomalyMsg, { parse_mode: 'Markdown' })
  log.info(`[inv-cmd] saved — ${itemKey} ×${qty} by ${tgUser}`)
}

// ── /stock command ────────────────────────────────────────────────────────────

async function handleStockCommand(bot, msg) {
  const chatId = msg.chat.id
  try {
    let balanceMap = {}
    let alertList  = []

    if (isSheetConfigured()) {
      const [balanceRows, alertRows] = await Promise.all([
        getStockBalance().catch(() => []),
        getLowStockAlerts({ status: 'Active' }).catch(() => []),
      ])
      // Convert array of rows to itemKey → balance number
      for (const row of balanceRows) {
        if (row.item_key) balanceMap[row.item_key] = row.balance
      }
      // Map alert rows to the format formatStockReply expects
      alertList = alertRows.map((a) => ({
        itemKey:  a.item_key,
        name:     a.item_name,
        balance:  a.balance,
        minLevel: a.minimum_level,
        deficit:  a.deficit,
      }))
    } else {
      await bot.sendMessage(
        chatId,
        '⚠️ *Google Sheet not configured.*\n\n' +
        'Set `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` in your `.env` to enable live stock tracking.\n\n' +
        'Use `/stock` from the web dashboard while running `npm run telegram`.',
        { parse_mode: 'Markdown' },
      )
      return
    }

    const reply = formatStockReply(balanceMap, alertList)
    await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' })
  } catch (err) {
    log.error('[inv-cmd] /stock error:', err.message)
    await bot.sendMessage(chatId, '⚠️ Could not load stock data from Google Sheet. Please check the connection.')
  }
}

// ── /usage command ────────────────────────────────────────────────────────────

async function handleUsageCommand(bot, msg) {
  const chatId = msg.chat.id
  const text   = msg.text ?? ''
  const monthMatch = text.match(/\b(\d{4}-\d{2})\b/)
  const isToday    = /today/i.test(text)

  if (!isSheetConfigured()) {
    await bot.sendMessage(chatId,
      '⚠️ Google Sheet not configured — cannot retrieve usage data.\n\n' +
      'Set `GOOGLE_SHEET_ID` and credentials in `.env`.',
      { parse_mode: 'Markdown' },
    )
    return
  }

  try {
    let logs, label
    if (isToday || (!monthMatch && !/\d{4}/.test(text))) {
      logs  = await getInventoryLogs({ date: todayIso() }).catch(() => [])
      label = 'Today'
    } else {
      const month = monthMatch ? monthMatch[1] : new Date().toISOString().slice(0, 7)
      logs  = await getInventoryLogs({ month }).catch(() => [])
      label = new Date(`${month}-01`).toLocaleString('en-MY', { month: 'long', year: 'numeric' })
    }
    const reply = formatUsageReply(logs, label)
    await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' })
  } catch (err) {
    log.error('[inv-cmd] /usage error:', err.message)
    await bot.sendMessage(chatId, '⚠️ Could not load usage data.')
  }
}

// ── NLP global listener ───────────────────────────────────────────────────────

/**
 * Try to parse free-text as an inventory record.
 * Called from the global message handler for messages that have no active workflow.
 * Returns true if the message was consumed, false otherwise.
 *
 * Recognised patterns (all case-insensitive):
 *   "Room 2 Ali pampers 3"
 *   "pampers L 5 ali room 4"
 *   "wet tissue 2 Siti Room 3"
 */
export async function tryHandleInventoryNlp(bot, msg) {
  const text = (msg.text ?? '').trim()
  if (!text || text.startsWith('/')) return false

  const intent = classifyTelegramIntent(text)
  if (intent.category !== 'inventory' && !isClearInventoryMessage(text)) return false

  const parsed  = parseNlpInventory(text)
  if (!parsed.itemKey || !parsed.qty) return false  // not confident enough

  const chatId  = msg.chat.id
  const tgUser  = telegramUsername(msg)

  // Use nurse name from Telegram profile, overridden by NLP-parsed nurse name
  // e.g. "Nurse Aina gave Mary pampers M 4" → nurse = "Aina"
  const nurse   = parsed.nurseName ?? nurseName(msg)

  const itemKey = parsed.itemKey
  const item    = ITEMS[itemKey]

  // If item is generic (PAMPERS/GLOVES/MILK without size), ask the nurse to clarify
  if (['PAMPERS', 'GLOVES', 'MILK'].includes(itemKey) && !parsed.size) {
    await bot.sendMessage(
      chatId,
      `🤔 *Detected:* ${item?.name ?? itemKey}\n` +
      `Patient: *${parsed.patientName ?? '?'}*   Qty: *${parsed.qty}*\n\n` +
      `📐 Please specify a size (M / L / XL) or use the full command:\n` +
      `👉 /pampers   /wet   /milk   /gloves`,
      { parse_mode: 'Markdown' },
    )
    return true
  }

  const record = {
    timestamp:         new Date().toISOString(),
    nurse_name:        nurse,
    telegram_username: tgUser,
    patient_name:      parsed.patientName ?? '',
    room:              parsed.room        ?? '',
    item_key:          itemKey,
    size:              parsed.size        ?? '',
    qty:               parsed.qty,
    remarks:           '',
    source:            'telegram-nlp',
  }

  // Full sheet save (non-blocking)
  if (isSheetConfigured()) {
    saveFullInventoryRecord(record).catch((err) =>
      log.error('[inv-nlp] sheet save error:', err.message)
    )
  }

  // Low stock check (approximate, non-blocking)
  let stockWarn = ''
  if (isSheetConfigured()) {
    try {
      const balanceRows = await getStockBalance().catch(() => [])
      const row         = balanceRows.find((r) => r.item_key === itemKey)
      const current     = row?.balance ?? DEFAULT_STOCK[itemKey] ?? 0
      const newBalance  = Math.max(0, current - parsed.qty)
      const minLevel    = MIN_LEVELS[itemKey] ?? 0
      if (newBalance <= minLevel) {
        stockWarn = `\n\n⚠️ *Low Stock Alert:*\n${item?.name ?? itemKey} remaining only *${newBalance}*`
      }
    } catch { /* non-fatal */ }
  }

  const reply = formatInventoryConfirmReply(record)
  await bot.sendMessage(
    chatId,
    `🤖 *NLP Auto-Detected*\n\n${reply}${stockWarn}`,
    { parse_mode: 'Markdown' },
  )
  finishInventorySession(msg, 'inventory nlp complete')
  log.info(`[inv-nlp] saved: ${itemKey} ×${parsed.qty} by ${nurse} room ${parsed.room ?? '—'} patient ${parsed.patientName ?? '—'}`)
  return true
}

// ── Report commands ───────────────────────────────────────────────────────────

/** /daily_usage [YYYY-MM-DD] */
async function handleDailyUsageCommand(bot, msg) {
  const chatId = msg.chat.id
  const match  = (msg.text ?? '').match(/\b(\d{4}-\d{2}-\d{2})\b/)
  const date   = match ? match[1] : todayIso()

  const notConfigured = !isSheetConfigured()
  await bot.sendMessage(chatId,
    notConfigured
      ? `⚠️ Google Sheet not configured.\n\nConnect Google Sheets to see live usage data.\n_Set GOOGLE\\_SHEET\\_ID, GOOGLE\\_SERVICE\\_ACCOUNT\\_EMAIL, and GOOGLE\\_PRIVATE\\_KEY in .env_`
      : `⏳ Fetching daily report for ${date}…`,
    { parse_mode: 'Markdown' },
  )
  if (notConfigured) return

  try {
    const report = await buildDailyReport(date)
    await bot.sendMessage(chatId, formatDailyReportReply(report), { parse_mode: 'Markdown' })
  } catch (err) {
    log.error('[inv-cmd] /daily_usage error:', err.message)
    await bot.sendMessage(chatId, `⚠️ Could not load daily report.\n${err.message}`)
  }
}

/** /monthly_usage [YYYY-MM] */
async function handleMonthlyUsageCommand(bot, msg) {
  const chatId = msg.chat.id
  const match  = (msg.text ?? '').match(/\b(\d{4}-\d{2})\b/)
  const month  = match ? match[1] : new Date().toISOString().slice(0, 7)

  if (!isSheetConfigured()) {
    await bot.sendMessage(chatId,
      '⚠️ Google Sheet not configured.\n\nConnect Google Sheets to see monthly usage.',
      { parse_mode: 'Markdown' },
    )
    return
  }

  await bot.sendMessage(chatId, `⏳ Fetching monthly report for ${month}…`)
  try {
    const [monthLogs, patientRep] = await Promise.all([
      getInventoryLogs({ month }).catch(() => []),
      buildMonthlyPatientReport(month),
    ])
    const dailyRep = computeDailyReport(monthLogs)
    await bot.sendMessage(chatId, formatMonthlyReportReply(dailyRep, patientRep), { parse_mode: 'Markdown' })
  } catch (err) {
    log.error('[inv-cmd] /monthly_usage error:', err.message)
    await bot.sendMessage(chatId, `⚠️ Could not load monthly report.\n${err.message}`)
  }
}

/** /low_stock */
async function handleLowStockCommand(bot, msg) {
  const chatId = msg.chat.id

  if (!isSheetConfigured()) {
    await bot.sendMessage(chatId,
      '⚠️ Google Sheet not configured.\n\nConnect Google Sheets to see live stock levels.',
      { parse_mode: 'Markdown' },
    )
    return
  }

  try {
    const report = await buildLowStockReport()
    await bot.sendMessage(chatId, formatLowStockReply(report), { parse_mode: 'Markdown' })
  } catch (err) {
    log.error('[inv-cmd] /low_stock error:', err.message)
    await bot.sendMessage(chatId, `⚠️ Could not load low stock report.\n${err.message}`)
  }
}

/** /abnormal_usage [YYYY-MM-DD] */
async function handleAbnormalUsageCommand(bot, msg) {
  const chatId = msg.chat.id
  const match  = (msg.text ?? '').match(/\b(\d{4}-\d{2}-\d{2})\b/)
  const date   = match ? match[1] : todayIso()

  if (!isSheetConfigured()) {
    await bot.sendMessage(chatId,
      '⚠️ Google Sheet not configured.\n\nConnect Google Sheets to detect abnormal usage.',
      { parse_mode: 'Markdown' },
    )
    return
  }

  await bot.sendMessage(chatId, `⏳ Checking abnormal usage for ${date}…`)
  try {
    const report = await buildAbnormalReport(date)
    await bot.sendMessage(chatId, formatAbnormalReply(report), { parse_mode: 'Markdown' })
  } catch (err) {
    log.error('[inv-cmd] /abnormal_usage error:', err.message)
    await bot.sendMessage(chatId, `⚠️ Could not run abnormal usage check.\n${err.message}`)
  }
}

// ── /billing command ──────────────────────────────────────────────────────────

/**
 * /billing [patient_name] [YYYY-MM]
 *
 * Examples:
 *   /billing Ali
 *   /billing Ali Bin Ahmad
 *   /billing Ali 2026-05
 */
async function handleBillingCommand(bot, msg) {
  const chatId = msg.chat.id
  const raw    = (msg.text ?? '').replace(/^\/billing\s*/i, '').trim()

  if (!isSheetConfigured()) {
    await bot.sendMessage(chatId,
      '⚠️ Google Sheet not configured.\n\nConnect Google Sheets to generate billing.\n' +
      '_Set GOOGLE\\_SHEET\\_ID, GOOGLE\\_SERVICE\\_ACCOUNT\\_EMAIL, and GOOGLE\\_PRIVATE\\_KEY._',
      { parse_mode: 'Markdown' },
    )
    return
  }

  // Parse optional YYYY-MM month
  const monthMatch = raw.match(/\b(\d{4}-\d{2})\b/)
  const month      = monthMatch ? monthMatch[1] : currentYearMonth()
  const patientArg = raw.replace(month, '').trim()

  if (!patientArg) {
    await bot.sendMessage(chatId,
      '💰 *Inventory Billing*\n─────────────────────────\n' +
      'Usage: `/billing [patient name]`\n\n' +
      'Examples:\n`/billing Ali`\n`/billing Ali Bin Ahmad`\n`/billing Ali 2026-05`',
      { parse_mode: 'Markdown' },
    )
    return
  }

  await bot.sendMessage(chatId, `⏳ Generating billing for *${patientArg}* — ${month}…`, { parse_mode: 'Markdown' })

  try {
    // Generate billing (reads logs, upserts to sheet)
    await generateBillingForMonth(month, patientArg)

    // Fetch summary for this patient
    const summaries = await getBillingPatientSummary(month)
    const patient   = summaries.find((s) =>
      s.patient_name.toLowerCase().includes(patientArg.toLowerCase())
    )

    if (!patient || patient.items.length === 0) {
      await bot.sendMessage(chatId,
        `📭 No billing records found for *${patientArg}* in ${month}.\n\n` +
        `Ensure inventory was logged for this patient via /pampers, /wet, or /milk.`,
        { parse_mode: 'Markdown' },
      )
      return
    }

    // Format reply
    const D = '─────────────────────────'
    const monthLabel = new Date(month + '-01').toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
    const catEmoji   = { pampers: '👶', wet: '🧻', milk: '🥛', gloves: '🧤' }

    const lines = [
      `💰 *Inventory Billing Summary*`,
      `👤 Patient: ${patient.patient_name}`,
      patient.room ? `🏥 Room: ${patient.room}` : null,
      `📅 Month: ${monthLabel}`,
      D,
    ].filter(Boolean)

    for (const item of patient.items) {
      const emoji = catEmoji[item.item_category] ?? '📦'
      lines.push(
        `${emoji} ${item.item_name}: ${item.total_qty} × RM${item.unit_price.toFixed(2)} = *RM${item.total_amount.toFixed(2)}*`
      )
    }

    const statusIcon = patient.billing_status === 'Paid' ? '✅' : patient.billing_status === 'Waived' ? '🔵' : '🔴'
    lines.push(D)
    lines.push(`💵 Total: *RM${patient.grand_total.toFixed(2)}*`)
    lines.push(`${statusIcon} Status: ${patient.billing_status}`)

    await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' })
    log.info(`[inv-cmd] /billing — ${patientArg} ${month}: RM${patient.grand_total}`)
  } catch (err) {
    log.error('[inv-cmd] /billing error:', err.message)
    await bot.sendMessage(chatId, `⚠️ Could not generate billing.\n${err.message}`)
  }
}

function currentYearMonth() {
  return new Date().toISOString().slice(0, 7)
}

// ════════════════════════════════════════════════════════════════════════════
// /audit  —  Staff accountability & audit trail (Stage 7)
// ════════════════════════════════════════════════════════════════════════════

/**
 * /audit <search_term>
 *
 * Smart search: auto-detects if the term is a nurse name, patient name, or
 * an item keyword (pampers / wet / milk / gloves).
 *
 * Replies with the latest matching records, plus suspicious-usage warnings
 * if the search matches a nurse name.
 */
async function handleAuditCommand(bot, msg) {
  const chatId = msg.chat.id
  const raw    = (msg.text ?? '').replace(/^\/audit\s*/i, '').trim()

  if (!raw) {
    await bot.sendMessage(
      chatId,
      `🧾 *Inventory Audit Trail*\n\nUsage:\n/audit Ali — search by patient\n/audit Nurse Aina — search by nurse\n/audit pampers — search by item`,
      { parse_mode: 'Markdown' }
    )
    return
  }

  await bot.sendMessage(chatId, `🔍 Searching audit trail for: *${raw}*…`, { parse_mode: 'Markdown' })

  try {
    const ITEM_KEYWORDS = ['pampers', 'wet', 'milk', 'gloves', 'tissue']
    const isItemSearch  = ITEM_KEYWORDS.some((k) => raw.toLowerCase().includes(k))
    const isNurseSearch = /^nurse\s+/i.test(raw)
    const nurseName     = isNurseSearch ? raw.replace(/^nurse\s+/i, '').trim() : null

    let records  = []
    let suspicious = []

    if (isAuditConfigured()) {
      if (isItemSearch) {
        // Determine category keyword
        const cat = ['pampers', 'wet', 'milk', 'gloves'].find((k) => raw.toLowerCase().includes(k)) ?? raw
        records  = await getAuditTrail({ item_key: cat, limit: 10 })
      } else if (isNurseSearch) {
        records   = await getAuditTrail({ nurse: nurseName, limit: 10 })
        suspicious = await detectSuspiciousUsage(nurseName).catch(() => [])
      } else {
        // Try patient match first, then fall back to nurse match
        const byPatient = await getAuditTrail({ patient: raw, limit: 10 })
        const byNurse   = await getAuditTrail({ nurse:   raw, limit: 10 })
        records         = byPatient.length >= byNurse.length ? byPatient : byNurse
        if (byNurse.length > 0) {
          suspicious = await detectSuspiciousUsage(raw).catch(() => [])
        }
      }
    } else {
      // Demo mode
      const demo = buildDemoAuditTrail()
      const lc   = raw.toLowerCase()
      if (isItemSearch) {
        records = demo.filter((r) => (ITEMS[r.item_key]?.category ?? '').includes(lc)).slice(0, 10)
      } else if (isNurseSearch) {
        records = demo.filter((r) => r.nurse_name?.toLowerCase().includes((nurseName ?? '').toLowerCase())).slice(0, 10)
      } else {
        records = demo.filter((r) =>
          r.patient_name?.toLowerCase().includes(lc) ||
          r.nurse_name?.toLowerCase().includes(lc)
        ).slice(0, 10)
      }
    }

    const reply = formatAuditReply(raw, records, suspicious)
    await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' })
    log.info(`[inv-cmd] /audit "${raw}" — ${records.length} records`)
  } catch (err) {
    log.error('[inv-cmd] /audit error:', err.message)
    await bot.sendMessage(chatId, `⚠️ Audit search failed.\n${err.message}`)
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerInventoryCommands(bot) {
  // Structured multi-step commands
  bot.onText(/^\/inventory\b/i, (msg) => {
    const chatId = msg.chat.id
    bot.sendMessage(
      chatId,
      '📦 *Inventory Commands*\n' +
      '─────────────────────────\n' +
      '/pampers — log pampers usage\n' +
      '/wet — log wet tissue\n' +
      '/milk — log milk powder\n' +
      '/gloves — log gloves\n\n' +
      '💡 Or type naturally:\n' +
      '`Milk powder 2 scoops room 2 Ali`\n' +
      '`Pampers 1 piece room 3 Ahmad`',
      { parse_mode: 'Markdown' },
    )
  })
  bot.onText(/^\/pampers\b/i, (msg) => startInventoryWorkflow(bot, msg, 'pampers'))
  bot.onText(/^\/wet\b/i,     (msg) => startInventoryWorkflow(bot, msg, 'wet'))
  bot.onText(/^\/milk\b/i,    (msg) => startInventoryWorkflow(bot, msg, 'milk'))
  bot.onText(/^\/gloves\b/i,  (msg) => startInventoryWorkflow(bot, msg, 'gloves'))

  // Reporting commands
  bot.onText(/^\/stock\b/i,          (msg) => handleStockCommand(bot, msg))
  bot.onText(/^\/usage\b/i,          (msg) => handleUsageCommand(bot, msg))
  bot.onText(/^\/daily_usage\b/i,    (msg) => handleDailyUsageCommand(bot, msg))
  bot.onText(/^\/monthly_usage\b/i,  (msg) => handleMonthlyUsageCommand(bot, msg))
  bot.onText(/^\/low_stock\b/i,      (msg) => handleLowStockCommand(bot, msg))
  bot.onText(/^\/abnormal_usage\b/i, (msg) => handleAbnormalUsageCommand(bot, msg))
  bot.onText(/^\/billing\b/i,        (msg) => handleBillingCommand(bot, msg))
  bot.onText(/^\/audit\b/i,          (msg) => handleAuditCommand(bot, msg))

  log.info('[bot] inventory commands registered (/inventory /pampers /wet /milk /gloves /stock /usage)')
}
