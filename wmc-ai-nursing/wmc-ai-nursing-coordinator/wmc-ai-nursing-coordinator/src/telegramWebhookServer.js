/**
 * AI Nursing Coordinator — Telegram webhook backend (Express).
 *
 * Run ngrok against THIS server (port 3001), not Vite (5173):
 *   ngrok http 3001
 *
 * Env (dotenv):
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_URL  — full HTTPS URL …/api/integrations/telegram/webhook
 *   TELEGRAM_MODE         — live | production = setWebhook + replies; simulation = log only
 */

import 'dotenv/config'
import http from 'node:http'
import express from 'express'
import axios from 'axios'
// ── New: Attendance + OT command bridge ───────────────────────────────────────
// This adapter feeds Telegram updates through node-telegram-bot-api's handler
// chain so all new commands (/punchin, /punchout, /ot_in, /ot_out, /attendance,
// /ot_report, etc.) fire alongside the original pipeline.
// The existing pipeline is UNTOUCHED — this is purely additive.
import {
  initBotAdapter,
  processWebhookUpdate,
  getBotAdapterStatus,
} from './src/bot/webhookAdapter.js'
import {
  getTodayRecords,
  getMonthlyOtSummary,
} from './src/bot/services/attendanceSheetService.js'
import {
  getOnDutyToday,
  getOnOtToday,
  getStalePunches,
} from './src/bot/state/activePunchMap.js'
import { todayString, currentYearMonth } from './src/lib/attendanceCalculation.js'
// ── Inventory module imports ──────────────────────────────────────────────────
import {
  saveFullInventoryRecord,
  isSheetConfigured  as invSheetConfigured,
  getInventoryLogs   as invGetLogs,
  getStockBalance    as invGetBalance,
  getLowStockAlerts  as invGetAlerts,
  getPatientUsage    as invGetPatientUsage,
  getNurseUsage      as invGetNurseUsage,
  addStock           as invAddStock,
  adjustStock        as invAdjustStock,
  setMinimumLevel    as invSetMinimum,
} from './src/bot/services/inventorySheets.js'
import {
  buildDailyReport,
  buildMonthlyPatientReport,
  buildMonthlyNurseReport,
  buildLowStockReport,
  buildAbnormalReport,
  computeDailyReport,
  computeMonthlyPatientSummary,
  computeMonthlyNurseSummary,
  computeLowStockReport,
  computeAbnormalReport,
} from './src/bot/services/inventoryReports.js'
import {
  getBilling,
  generateBillingForMonth,
  updateBillingStatus,
  computeBillingFromLogs,
  isBillingSheetConfigured,
} from './src/bot/services/billingSheets.js'
import {
  getPrices,
  updatePrice,
  DEFAULT_PRICES,
} from './src/bot/services/billingPrices.js'
import {
  logAuditEvent,
  getAuditTrail,
  getAuditByNurse,
  getAuditByPatient,
  getAuditByItem,
  detectSuspiciousUsage,
  buildDemoAuditTrail,
  isAuditConfigured,
} from './src/bot/services/auditTrailService.js'
import {
  todayIso as invTodayIso,
  currentYearMonth as invCurrentMonth,
  DEFAULT_STOCK,
  ITEMS,
  MIN_LEVELS,
} from './src/lib/inventoryCalculation.js'
// ─────────────────────────────────────────────────────────────────────────────
import { readTelegramMockStoreState } from '../telegramMockStore.mjs'
import {
  readTelegramNursingMemoryState,
  updateTelegramNursingMemoryRecord,
} from '../telegramNursingMemory.mjs'
import { buildTelegramDashboardSnapshot } from '../telegramDashboardSnapshot.mjs'
import { executeTelegramInboundPipeline } from '../telegramWebhookPipeline.mjs'
import { logTelegramChatIdFromWebhook } from '../telegramWebhookProcessor.mjs'
import { processMobileNurseSubmit } from '../mobileNurseSubmitApi.mjs'
import { workflowCategoryDisplay } from './lib/telegramNurseParser.js'
import { mapOverallScoreToWorkflowRiskLabel } from './lib/telegramWorkflowReply.js'
import { readCommandRecords } from './lib/commands/commandRecordStore.js'
import { COMMAND_REGISTRY, buildCommandHelpReply } from './lib/commands/commandRegistry.js'

/** Default 3001; optional TELEGRAM_SERVER_PORT override. */
const PORT = Number(process.env.TELEGRAM_SERVER_PORT) || 3001

const WEBHOOK_PATH = '/api/integrations/telegram/webhook'

const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
const webhookUrl = String(process.env.TELEGRAM_WEBHOOK_URL || '').trim()
const mode = String(process.env.TELEGRAM_MODE || 'simulation').toLowerCase()
const isLiveMode = mode === 'live' || mode === 'production'

process.on('uncaughtException', (err) => {
  console.error('[telegram] uncaughtException (process continues):', err?.stack || err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[telegram] unhandledRejection:', reason)
})

function waitForLocalHealth(port, attempts = 25) {
  return new Promise((resolve, reject) => {
    let n = 0
    const ping = () => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/health',
          method: 'GET',
          timeout: 2000,
        },
        (r) => {
          r.resume()
          if (r.statusCode === 200) resolve()
          else if (++n >= attempts) reject(new Error(`/health returned ${r.statusCode}`))
          else setTimeout(ping, 50)
        },
      )
      req.on('timeout', () => {
        req.destroy()
        if (++n >= attempts) reject(new Error('/health timeout'))
        else setTimeout(ping, 50)
      })
      req.on('error', () => {
        if (++n >= attempts) reject(new Error('/health unreachable'))
        else setTimeout(ping, 50)
      })
      req.end()
    }
    ping()
  })
}

function normalizeWebhookUrl(u) {
  return String(u || '')
    .trim()
    .replace(/\/+$/, '')
}

async function telegramApi(method, params = {}) {
  const apiUrl = `https://api.telegram.org/bot${token}/${method}`
  const { data } = await axios.get(apiUrl, { params })
  if (!data.ok) {
    throw new Error(data.description || `${method} failed`)
  }
  return data
}

async function registerWebhook() {
  if (!isLiveMode) {
    console.log('[telegram] simulation mode: skipping setWebhook (safe)')
    return
  }
  if (!token) {
    console.warn('[telegram] skipping setWebhook (no TELEGRAM_BOT_TOKEN)')
    return
  }
  if (!webhookUrl) {
    console.warn('[telegram] TELEGRAM_WEBHOOK_URL is empty; skipping setWebhook')
    return
  }
  try {
    const data = await telegramApi('setWebhook', { url: webhookUrl })
    console.log('[telegram] setWebhook OK:', data.result === true ? true : data)
  } catch (err) {
    console.error('[telegram] setWebhook failed:', err.response?.data ?? err.message)
  }
}

async function fetchAndPrintWebhookInfo() {
  if (!token) {
    console.log('[telegram] skipping getWebhookInfo (TELEGRAM_BOT_TOKEN not set)')
    return null
  }
  try {
    const data = await telegramApi('getWebhookInfo')
    const info = data.result || {}
    const registeredUrl = info.url || ''

    console.log('\n--- Telegram getWebhookInfo ---')
    console.log('[telegram] Current webhook URL:', registeredUrl || '(none)')
    console.log('[telegram] Pending updates:', info.pending_update_count ?? '—')
    console.log('[telegram] Max connections:', info.max_connections ?? '—')
    if (info.last_error_date) {
      console.warn('[telegram] Last delivery error:', info.last_error_message || 'unknown', `(unix ${info.last_error_date})`)
      console.warn('[telegram] Often caused by ngrok pointing at the wrong local port.')
      console.warn('[telegram] Please restart ngrok with: ngrok http 3001')
    }
    console.log('-------------------------------\n')

    const envNorm = normalizeWebhookUrl(webhookUrl)
    const telNorm = normalizeWebhookUrl(registeredUrl)
    if (isLiveMode && envNorm && telNorm && envNorm !== telNorm) {
      console.warn('[telegram] WARNING: TELEGRAM_WEBHOOK_URL in .env does not match Telegram registered URL.')
      console.warn(`  .env:      ${webhookUrl}`)
      console.warn(`  Telegram:  ${registeredUrl}`)
      console.warn('[telegram] Tunnel must hit port', PORT)
      console.warn('[telegram] Please restart ngrok with: ngrok http 3001')
    }

    if (isLiveMode && registeredUrl && !registeredUrl.includes(WEBHOOK_PATH)) {
      console.warn(`[telegram] Registered URL should end with ${WEBHOOK_PATH}`)
    }

    if (isLiveMode && /:5173|:5174\b/.test(webhookUrl)) {
      console.warn('[telegram] TELEGRAM_WEBHOOK_URL references port 5173/5174 (Vite). Webhook must target Express on port 3001.')
      console.warn('[telegram] Please restart ngrok with: ngrok http 3001')
    }

    if (isLiveMode && registeredUrl && /:5173|:5174\b/.test(registeredUrl)) {
      console.warn('[telegram] Telegram registered webhook URL references 5173/5174 — update registration and tunnel.')
      console.warn('[telegram] Please restart ngrok with: ngrok http 3001')
    }

    if (isLiveMode) {
      console.log(`[telegram] Ngrok must forward HTTPS to 127.0.0.1:${PORT}${WEBHOOK_PATH}`)
      console.log('[telegram] Example: ngrok http 3001')
    }

    return info
  } catch (err) {
    console.error('[telegram] getWebhookInfo failed:', err.response?.data ?? err.message)
    return null
  }
}

if (isLiveMode && !token) {
  console.error('[telegram] TELEGRAM_BOT_TOKEN is required when TELEGRAM_MODE is live or production')
  process.exit(1)
}
if (!token) {
  console.warn('[telegram] TELEGRAM_BOT_TOKEN not set — use TELEGRAM_MODE=live only after configuring the bot token')
}

function logInboundTelegramPayload(body) {
  const msg = body.message || body.edited_message || body.channel_post
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║ TELEGRAM WEBHOOK — incoming payload (async job)          ║')
  console.log('╠══════════════════════════════════════════════════════════╣')
  console.log('[telegram] update_id     :', body.update_id ?? '(missing)')
  console.log('[telegram] chat.id       :', msg?.chat?.id ?? '(no message)')
  console.log('[telegram] from          :', msg?.from?.username ?? msg?.from?.id ?? '—')
  console.log('[telegram] text/caption  :', msg?.text ?? msg?.caption ?? '(none)')
  console.log('[telegram] TELEGRAM_MODE :', mode)
  console.log('╚══════════════════════════════════════════════════════════╝\n')
}

function scheduleTelegramInboundProcessing(bodyJson) {
  setImmediate(() => {
    void (async () => {
      try {
        logInboundTelegramPayload(bodyJson)
        const result = await executeTelegramInboundPipeline(bodyJson, { mode, token })
        const { parsed, analysis, replyText, telegramSent, telegramError } = result

        const categories = workflowCategoryDisplay(parsed)
        const riskLevel = mapOverallScoreToWorkflowRiskLabel(analysis.overallScore)

        console.log('[telegram] categories:', categories)
        console.log('[telegram] riskLevel:', riskLevel)
        console.log('[telegram] replyText:\n' + replyText)
        console.log('[telegram] telegramSent:', telegramSent, telegramError ? `error: ${telegramError}` : '')
      } catch (err) {
        console.error('[telegram] async pipeline error:', err?.stack || err)
      }
    })()
  })
}

const app = express()
app.use(express.json({ limit: '512kb' }))

// ── Initialise attendance/OT bot adapter (non-blocking, safe) ────────────────
// Runs in same process → shares stateManager + activePunchMap with all handlers.
const botAdapter = initBotAdapter(token)
if (botAdapter) {
  const adapterStatus = getBotAdapterStatus()
  console.log('[bot-adapter] Google Sheet ready:', adapterStatus.sheetReady)
  if (!adapterStatus.sheetReady) {
    console.warn('[bot-adapter] Missing sheet env vars:', adapterStatus.sheetMissing.join(', '))
  }
} else {
  console.warn('[bot-adapter] Not initialized — set TELEGRAM_BOT_TOKEN to enable new commands')
}
// ─────────────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).json({ success: true })
})

/** Connectivity: same routing prefix as Vite dev middleware */
app.post('/api/nursing/mobile-submit', async (req, res) => {
  try {
    const out = await processMobileNurseSubmit(req.body && typeof req.body === 'object' ? req.body : {})
    res.json(out)
  } catch (e) {
    if (e.code === 'VALIDATION') res.status(400).json({ ok: false, error: String(e.message || e) })
    else res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.get('/api/integrations/telegram/backend', (_req, res) => {
  res.json({
    ok: true,
    service: 'wmc-ai-nursing-coordinator',
    transport: 'express',
    listenPort: PORT,
    webhookPath: WEBHOOK_PATH,
    pipeline: 'telegramWebhookPipeline.executeTelegramInboundPipeline',
    mode,
    tokenConfigured: Boolean(token),
    webhookUrlConfigured: Boolean(webhookUrl),
  })
})

app.get('/api/integrations/telegram/dashboard', async (_req, res) => {
  try {
    const snapshot = await buildTelegramDashboardSnapshot()
    res.json(snapshot)
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.get('/api/integrations/telegram/nursing-memory', async (req, res) => {
  try {
    const raw = parseInt(String(req.query.limit ?? '100'), 10)
    const limit = Number.isFinite(raw) ? Math.min(500, Math.max(1, raw)) : 100
    const state = await readTelegramNursingMemoryState()
    res.json({
      ok: true,
      records: (state.entries || []).slice(0, limit),
      recordCount: state.entries?.length ?? 0,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.patch('/api/integrations/telegram/nursing-memory', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const id = body.id
    if (!id) {
      res.status(400).json({ ok: false, error: 'Body must include id (memory row id).' })
      return
    }
    const record = await updateTelegramNursingMemoryRecord(id, {
      status: body.status,
      escalatedToDoctor: body.escalatedToDoctor,
      familyUpdateDraft: body.familyUpdateDraft,
    })
    res.json({ ok: true, record })
  } catch (e) {
    if (e.code === 'NOT_FOUND') res.status(404).json({ ok: false, error: String(e.message || e) })
    else if (e.code === 'INVALID') res.status(400).json({ ok: false, error: String(e.message || e) })
    else res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.get('/api/integrations/telegram/entries', async (req, res) => {
  try {
    const raw = parseInt(String(req.query.limit ?? '15'), 10)
    const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, raw)) : 15
    const state = await readTelegramMockStoreState()
    res.json({
      ok: true,
      entries: (state.entries || []).slice(0, limit),
      entryCount: state.entries?.length ?? 0,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.get('/api/integrations/telegram/last', async (req, res) => {
  try {
    const state = await readTelegramMockStoreState()
    res.json({
      ok: true,
      last: state.last || null,
      entryCount: state.entries?.length ?? 0,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.post(WEBHOOK_PATH, (req, res) => {
  try {
    let body = req.body
    if (body == null || typeof body !== 'object' || Array.isArray(body)) body = {}
    const msg = body.message || body.edited_message || body.channel_post
    const uid = body.update_id ?? '(missing)'
    console.log(`[telegram] webhook received update_id=${uid} chat.id=${msg?.chat?.id ?? '—'}`)
    try {
      logTelegramChatIdFromWebhook(body)
    } catch (logErr) {
      console.warn('[telegram] logTelegramChatIdFromWebhook:', logErr)
    }

    res.status(200).json({ ok: true })

    // ── Original pipeline (nursing workflows, AI summaries, etc.) ──────────
    scheduleTelegramInboundProcessing(body)

    // ── New adapter pipeline (attendance/OT + all new commands) ────────────
    // Runs after 200 OK is sent — never delays Telegram's ACK.
    // Errors here are caught inside processWebhookUpdate and logged only.
    processWebhookUpdate(body)
    // ───────────────────────────────────────────────────────────────────────
  } catch (handlerErr) {
    console.error('[telegram] webhook POST handler error:', handlerErr)
    if (!res.headersSent) res.status(200).json({ ok: true })
  }
})

app.get(WEBHOOK_PATH, (req, res) => {
  res.json({
    ok: true,
    mode,
    listenPort: PORT,
    simulationSafe: !isLiveMode,
    webhookUrlConfigured: Boolean(webhookUrl),
    path: WEBHOOK_PATH,
    message: `POST Telegram updates here. Uses executeTelegramInboundPipeline (same as Vite dev). Optional: GET /api/integrations/telegram/backend`,
  })
})

// ── Attendance & OT API endpoints ────────────────────────────────────────────

/**
 * GET /api/attendance/today
 * Live duty status (from activePunchMap) + completed records from Google Sheet.
 */
app.get('/api/attendance/today', async (_req, res) => {
  try {
    const today   = todayString()
    const onDuty  = getOnDutyToday(today)
    const onOt    = getOnOtToday(today)
    const stale   = getStalePunches(today)

    let sheetRecords = []
    try { sheetRecords = await getTodayRecords() } catch { /* non-fatal */ }

    res.json({
      ok:           true,
      date:         today,
      onDuty:       onDuty.map(({ staff_name, normal_punch_in, shift }) => ({ staff_name, punch_in: normal_punch_in, shift })),
      onOt:         onOt.map(({ staff_name, ot_in }) => ({ staff_name, ot_in })),
      missingPunchOut: stale.map(({ staff_name, date, normal_punch_in }) => ({ staff_name, date, punch_in: normal_punch_in })),
      completed:    sheetRecords,
      summary: {
        on_duty:           onDuty.length,
        on_ot:             onOt.length,
        missing_punch_out: stale.length,
        completed:         sheetRecords.length,
        total_ot_hours:    Math.round(sheetRecords.reduce((s, r) => s + (Number(r.ot_hours) || 0), 0) * 100) / 100,
      },
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message ?? err) })
  }
})

/**
 * GET /api/attendance/ot-summary?month=2026-05
 * Monthly OT payroll summary (Approved + OT Complete records only).
 */
app.get('/api/attendance/ot-summary', async (req, res) => {
  const month = String(req.query.month ?? currentYearMonth())
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ ok: false, error: 'month must be YYYY-MM' })
  }
  try {
    const summary = await getMonthlyOtSummary(month)
    const grandTotal = summary.reduce((s, r) => s + r.total_ot_amount, 0)
    res.json({ ok: true, month, rows: summary, grand_total_rm: Math.round(grandTotal * 100) / 100 })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message ?? err) })
  }
})

/**
 * GET /api/attendance/status
 * Adapter health + active punch count.
 */
app.get('/api/attendance/status', (_req, res) => {
  res.json({ ok: true, ...getBotAdapterStatus() })
})

// ── Command Workflow API endpoints ───────────────────────────────────────────

/** GET /api/commands/registry — list all registered commands and their schemas */
app.get('/api/commands/registry', (_req, res) => {
  const commands = Object.values(COMMAND_REGISTRY).map((def) => ({
    name: def.name,
    description: def.description,
    sheetTab: def.sheetTab,
    dbTable: def.dbTable,
    fields: def.fields.map((f) => ({
      key: f.key,
      label: f.label,
      required: f.required,
      aliases: f.aliases ?? [],
    })),
    helpText: def.helpText,
  }))
  res.json({ ok: true, commands, count: commands.length })
})

/** GET /api/commands/help — text listing of all commands */
app.get('/api/commands/help', (_req, res) => {
  res.json({ ok: true, text: buildCommandHelpReply() })
})

/** GET /api/commands/records — all command records (paginated) */
app.get('/api/commands/records', async (req, res) => {
  try {
    const limitRaw = parseInt(String(req.query.limit ?? '50'), 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, limitRaw)) : 50
    const commandName = req.query.command ? String(req.query.command) : undefined
    const records = await readCommandRecords({ commandName, limit })
    res.json({ ok: true, records, count: records.length })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

/** GET /api/commands/records/:command — records for a specific command type */
app.get('/api/commands/records/:command', async (req, res) => {
  try {
    const commandName = `/${req.params.command.replace(/^\//, '')}`
    const limitRaw = parseInt(String(req.query.limit ?? '50'), 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, limitRaw)) : 50
    if (!COMMAND_REGISTRY[commandName]) {
      return res.status(404).json({ ok: false, error: `Unknown command: ${commandName}` })
    }
    const records = await readCommandRecords({ commandName, limit })
    res.json({ ok: true, commandName, records, count: records.length })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

// ── Inventory API — CORS + demo-data helpers ──────────────────────────────────

/** Allow the Vite dev server (3000) and any configured origin to call these endpoints. */
app.use('/api/inventory', (req, res, next) => {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const sheetReady = () =>
  Boolean(process.env.GOOGLE_SHEET_ID) &&
  Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
  Boolean(process.env.GOOGLE_PRIVATE_KEY)

/**
 * Static demo inventory logs returned when Google Sheet is not configured.
 * Provides realistic data so the dashboard is fully functional out of the box.
 */
function buildDemoLogs() {
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  const seeds = [
    { item_key: 'PAMPERS_M',  qty: 4,  patient_name: 'Ahmad Bin Ali',    room: '1', nurse_name: '@sarah'  },
    { item_key: 'PAMPERS_L',  qty: 6,  patient_name: 'Siti Binti Hamid', room: '2', nurse_name: '@sarah'  },
    { item_key: 'PAMPERS_XL', qty: 3,  patient_name: 'Muthu Rajan',      room: '4', nurse_name: '@aini'   },
    { item_key: 'WET_TISSUE', qty: 2,  patient_name: 'Ahmad Bin Ali',    room: '1', nurse_name: '@rachel' },
    { item_key: 'WET_TISSUE', qty: 1,  patient_name: 'Siti Binti Hamid', room: '2', nurse_name: '@aini'   },
    { item_key: 'MILK_FULL',  qty: 3,  patient_name: 'Lee Wei Ming',     room: '3', nurse_name: '@rachel' },
    { item_key: 'MILK_LOW',   qty: 4,  patient_name: 'Lee Wei Ming',     room: '3', nurse_name: '@sarah'  },
    { item_key: 'GLOVES_M',   qty: 10, patient_name: '',                  room: '',  nurse_name: '@sarah'  },
    { item_key: 'PAMPERS_M',  qty: 3,  patient_name: 'Ahmad Bin Ali',    room: '1', nurse_name: '@rachel' },
    { item_key: 'PAMPERS_L',  qty: 4,  patient_name: 'Siti Binti Hamid', room: '2', nurse_name: '@rachel' },
  ]
  return seeds.map((s, i) => ({
    id:                `demo_${i}`,
    timestamp:         `${today}T0${String(7 + i).padStart(2, '0')}:${String(i * 6).padStart(2, '0')}:00.000Z`,
    nurse_name:        s.nurse_name,
    telegram_username: s.nurse_name,
    patient_name:      s.patient_name,
    room:              s.room,
    item_key:          s.item_key,
    item_name:         ITEMS[s.item_key]?.name ?? s.item_key,
    size:              '',
    qty:               s.qty,
    remarks:           'demo data',
    source:            'demo',
  }))
}

function buildDemoBalance() {
  const logs    = buildDemoLogs()
  const balance = { ...DEFAULT_STOCK }
  for (const log of logs) {
    if (balance[log.item_key] !== undefined) {
      balance[log.item_key] = Math.max(0, balance[log.item_key] - log.qty)
    }
  }
  // Make one item "low" for demo realism
  balance['PAMPERS_XL'] = 8
  balance['WET_TISSUE'] = 9
  return balance
}

function buildDemoAlerts(balance) {
  return Object.entries(MIN_LEVELS)
    .filter(([key, min]) => (balance[key] ?? DEFAULT_STOCK[key]) < min)
    .map(([key, min]) => ({
      itemKey:  key,
      name:     ITEMS[key]?.name ?? key,
      balance:  balance[key] ?? DEFAULT_STOCK[key],
      minLevel: min,
      deficit:  min - (balance[key] ?? DEFAULT_STOCK[key]),
    }))
}

function buildDemoPatientUsage(logs) {
  const map = new Map()
  for (const log of logs) {
    const key = log.patient_name || 'Unknown'
    if (!map.has(key)) map.set(key, { patient_name: key, room: log.room, total_qty: 0, breakdown: {} })
    const e = map.get(key)
    e.total_qty += log.qty
    e.breakdown[log.item_key] = (e.breakdown[log.item_key] ?? 0) + log.qty
  }
  return [...map.values()].sort((a, b) => b.total_qty - a.total_qty)
}

function buildDemoNurseUsage(logs) {
  const map = new Map()
  for (const log of logs) {
    const key = log.nurse_name || 'Unknown'
    if (!map.has(key)) map.set(key, { nurse_name: key, total_qty: 0, item_count: 0 })
    const e = map.get(key)
    e.total_qty  += log.qty
    e.item_count += 1
  }
  return [...map.values()].sort((a, b) => b.total_qty - a.total_qty)
}

// ── Inventory API endpoints ───────────────────────────────────────────────────
// All GET endpoints: real Google Sheet data when configured, demo data otherwise.
// POST /add: full 5-tab save (logs + stock balance + alerts + patient/nurse usage).

/**
 * GET /api/inventory/logs?date=YYYY-MM-DD&month=YYYY-MM&limit=100
 */
app.get('/api/inventory/logs', async (req, res) => {
  try {
    let logs, source
    if (invSheetConfigured()) {
      const { date, month, limit = 100 } = req.query
      const opts = {}
      if (date)  opts.date  = String(date)
      if (month) opts.month = String(month)
      if (limit) opts.limit = Number(limit)
      logs   = await invGetLogs(opts)
      source = 'sheet'
    } else {
      logs   = buildDemoLogs()
      source = 'demo'
    }
    res.json({ ok: true, logs, count: logs.length, source })
  } catch (e) {
    const demo = buildDemoLogs()
    res.json({ ok: true, logs: demo, count: demo.length, source: 'demo', warning: String(e?.message ?? e) })
  }
})

/**
 * GET /api/inventory/stock
 * Returns stock balance as { [itemKey]: balance } object.
 */
app.get('/api/inventory/stock', async (req, res) => {
  try {
    let balance, source
    if (invSheetConfigured()) {
      const rows = await invGetBalance()
      balance    = Object.fromEntries(rows.map((r) => [r.item_key, r.balance]))
      source     = 'sheet'
    } else {
      balance = buildDemoBalance()
      source  = 'demo'
    }
    res.json({ ok: true, balance, source })
  } catch (e) {
    res.json({ ok: true, balance: buildDemoBalance(), source: 'demo', warning: String(e?.message ?? e) })
  }
})

/**
 * GET /api/inventory/alerts
 * Returns Active low-stock alerts.
 */
app.get('/api/inventory/alerts', async (req, res) => {
  try {
    let alerts, source
    if (invSheetConfigured()) {
      const rows = await invGetAlerts({ status: 'Active' })
      alerts = rows.map((a) => ({
        itemKey:  a.item_key,
        name:     a.item_name,
        balance:  a.balance,
        minLevel: a.minimum_level,
        deficit:  a.deficit,
      }))
      source = 'sheet'
    } else {
      alerts = buildDemoAlerts(buildDemoBalance())
      source = 'demo'
    }
    res.json({ ok: true, alerts, count: alerts.length, source })
  } catch (e) {
    const alerts = buildDemoAlerts(buildDemoBalance())
    res.json({ ok: true, alerts, count: alerts.length, source: 'demo', warning: String(e?.message ?? e) })
  }
})

/**
 * GET /api/inventory/patient-usage?month=YYYY-MM
 */
app.get('/api/inventory/patient-usage', async (req, res) => {
  try {
    const month = String(req.query.month ?? invCurrentMonth())
    let usage, source
    if (invSheetConfigured()) {
      const rows = await invGetPatientUsage(month)
      usage = rows.map((r) => ({
        patient_name:     r.patient_name,
        room:             '',
        total_qty:        r.total_qty,
        breakdown: {
          PAMPERS_M:  r.pampers_total,
          WET_TISSUE: r.wet_tissue_total,
          MILK_FULL:  r.milk_total,
          GLOVES_M:   r.gloves_total,
        },
      })).sort((a, b) => b.total_qty - a.total_qty)
      source = 'sheet'
    } else {
      usage  = buildDemoPatientUsage(buildDemoLogs())
      source = 'demo'
    }
    res.json({ ok: true, month, usage, source })
  } catch (e) {
    res.json({ ok: true, usage: buildDemoPatientUsage(buildDemoLogs()), source: 'demo', warning: String(e?.message ?? e) })
  }
})

/**
 * GET /api/inventory/nurse-usage?month=YYYY-MM
 */
app.get('/api/inventory/nurse-usage', async (req, res) => {
  try {
    const month = String(req.query.month ?? invCurrentMonth())
    let usage, source
    if (invSheetConfigured()) {
      const rows = await invGetNurseUsage(month)
      usage = rows.map((r) => ({
        nurse_name:  r.nurse_name,
        total_qty:   r.total_items_taken,
        item_count:  r.total_items_taken,
      })).sort((a, b) => b.total_qty - a.total_qty)
      source = 'sheet'
    } else {
      usage  = buildDemoNurseUsage(buildDemoLogs())
      source = 'demo'
    }
    res.json({ ok: true, month, usage, source })
  } catch (e) {
    res.json({ ok: true, usage: buildDemoNurseUsage(buildDemoLogs()), source: 'demo', warning: String(e?.message ?? e) })
  }
})

/**
 * POST /api/inventory/add
 * Body: { nurse_name, telegram_username, patient_name, room, item_key, size, qty, remarks }
 *
 * When Google Sheet is configured, triggers saveFullInventoryRecord which writes to
 * all 5 tabs: Inventory_Logs, Stock_Balance, Patient_Usage, Nurse_Usage, Low_Stock_Alerts.
 */
app.post('/api/inventory/add', async (req, res) => {
  try {
    const {
      nurse_name, telegram_username, patient_name, room,
      item_key, size, qty, remarks,
    } = req.body ?? {}

    if (!item_key || !qty || Number(qty) <= 0) {
      return res.status(400).json({ ok: false, error: 'item_key and qty (> 0) are required.' })
    }

    const record = {
      timestamp:         new Date().toISOString(),
      nurse_name:        nurse_name        ?? '',
      telegram_username: telegram_username ?? '',
      patient_name:      patient_name      ?? '',
      room:              room              ?? '',
      item_key:          String(item_key),
      item_name:         ITEMS[String(item_key)]?.name ?? item_key,
      size:              size              ?? '',
      qty:               Number(qty),
      remarks:           remarks           ?? '',
    }

    if (invSheetConfigured()) {
      await saveFullInventoryRecord(record)
      res.json({ ok: true, record, saved: 'sheet' })
    } else {
      console.warn('[inventory-api] POST /add — Google Sheet not configured; record acknowledged but not persisted.')
      res.json({ ok: true, record, saved: 'local-only', warning: 'Google Sheet not configured — set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY in .env to enable persistence.' })
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) })
  }
})

// ── Inventory Report endpoints ────────────────────────────────────────────────
// All 5 endpoints: real Sheet data when configured, computed demo fallback otherwise.

/**
 * GET /api/inventory/report/daily?date=YYYY-MM-DD
 */
app.get('/api/inventory/report/daily', async (req, res) => {
  const date = String(req.query.date ?? invTodayIso())
  try {
    if (invSheetConfigured()) {
      const report = await buildDailyReport(date)
      return res.json({ ok: true, ...report })
    }
    const report = computeDailyReport(buildDemoLogs(), date)
    res.json({ ok: true, ...report, source: 'demo' })
  } catch (e) {
    const report = computeDailyReport(buildDemoLogs(), date)
    res.json({ ok: true, ...report, source: 'demo', warning: String(e?.message ?? e) })
  }
})

/**
 * GET /api/inventory/report/monthly-patient?month=YYYY-MM
 */
app.get('/api/inventory/report/monthly-patient', async (req, res) => {
  const month = String(req.query.month ?? invCurrentMonth())
  try {
    if (invSheetConfigured()) {
      const report = await buildMonthlyPatientReport(month)
      return res.json({ ok: true, ...report })
    }
    const patients = computeMonthlyPatientSummary(buildDemoLogs())
    res.json({ ok: true, month, patients, source: 'demo' })
  } catch (e) {
    const patients = computeMonthlyPatientSummary(buildDemoLogs())
    res.json({ ok: true, month, patients, source: 'demo', warning: String(e?.message ?? e) })
  }
})

/**
 * GET /api/inventory/report/monthly-nurse?month=YYYY-MM
 */
app.get('/api/inventory/report/monthly-nurse', async (req, res) => {
  const month = String(req.query.month ?? invCurrentMonth())
  try {
    if (invSheetConfigured()) {
      const report = await buildMonthlyNurseReport(month)
      return res.json({ ok: true, ...report })
    }
    const nurses = computeMonthlyNurseSummary(buildDemoLogs())
    res.json({ ok: true, month, nurses, source: 'demo' })
  } catch (e) {
    const nurses = computeMonthlyNurseSummary(buildDemoLogs())
    res.json({ ok: true, month, nurses, source: 'demo', warning: String(e?.message ?? e) })
  }
})

/**
 * GET /api/inventory/report/low-stock
 */
app.get('/api/inventory/report/low-stock', async (req, res) => {
  try {
    if (invSheetConfigured()) {
      const report = await buildLowStockReport()
      return res.json({ ok: true, ...report })
    }
    // Demo: build balance rows from demo data and compute alerts
    const demoBalance = buildDemoBalance()
    const demoRows    = Object.entries(demoBalance).map(([item_key, balance]) => ({
      item_key, balance, minimum_level: MIN_LEVELS[item_key] ?? 0,
    }))
    const alerts = computeLowStockReport(demoRows)
    res.json({ ok: true, alerts, count: alerts.length, source: 'demo' })
  } catch (e) {
    const demoBalance = buildDemoBalance()
    const demoRows    = Object.entries(demoBalance).map(([item_key, balance]) => ({
      item_key, balance, minimum_level: MIN_LEVELS[item_key] ?? 0,
    }))
    const alerts = computeLowStockReport(demoRows)
    res.json({ ok: true, alerts, count: alerts.length, source: 'demo', warning: String(e?.message ?? e) })
  }
})

/**
 * GET /api/inventory/report/abnormal?date=YYYY-MM-DD
 */
app.get('/api/inventory/report/abnormal', async (req, res) => {
  const date = String(req.query.date ?? invTodayIso())
  try {
    if (invSheetConfigured()) {
      const report = await buildAbnormalReport(date)
      return res.json({ ok: true, ...report })
    }
    const abnormal = computeAbnormalReport(buildDemoLogs(), date)
    res.json({ ok: true, date, abnormal, count: abnormal.length, source: 'demo' })
  } catch (e) {
    const abnormal = computeAbnormalReport(buildDemoLogs(), date)
    res.json({ ok: true, date, abnormal, count: abnormal.length, source: 'demo', warning: String(e?.message ?? e) })
  }
})

// ── Billing API endpoints ─────────────────────────────────────────────────────

/**
 * GET /api/inventory/billing?month=YYYY-MM&patient_name=&room=&billing_status=
 */
app.get('/api/inventory/billing', async (req, res) => {
  const { month, patient_name, room, billing_status } = req.query
  const opts = {
    month:          month          ? String(month)          : invCurrentMonth(),
    patient_name:   patient_name   ? String(patient_name)   : undefined,
    room:           room           ? String(room)           : undefined,
    billing_status: billing_status ? String(billing_status) : undefined,
  }
  try {
    if (isBillingSheetConfigured()) {
      const billing = await getBilling(opts)
      const prices  = getPrices()
      return res.json({ ok: true, billing, count: billing.length, prices, source: 'sheet' })
    }
    // Demo fallback
    const demoLogs  = buildDemoLogs()
    const billing   = computeBillingFromLogs(demoLogs, opts.month)
    const prices    = getPrices()
    res.json({ ok: true, billing, count: billing.length, prices, source: 'demo' })
  } catch (e) {
    const billing = computeBillingFromLogs(buildDemoLogs(), opts.month)
    res.json({ ok: true, billing, count: billing.length, prices: getPrices(), source: 'demo', warning: String(e?.message ?? e) })
  }
})

/**
 * POST /api/inventory/billing/generate
 * Body: { month?, patient_name? }
 */
app.post('/api/inventory/billing/generate', async (req, res) => {
  const { month = invCurrentMonth(), patient_name } = req.body ?? {}
  try {
    if (isBillingSheetConfigured()) {
      const rows = await generateBillingForMonth(String(month), patient_name ? String(patient_name) : undefined)
      return res.json({ ok: true, generated: rows.length, month, patient_name: patient_name ?? 'all', source: 'sheet' })
    }
    // Demo: compute and return without persisting
    const filtered = patient_name
      ? buildDemoLogs().filter((l) => l.patient_name?.toLowerCase().includes(String(patient_name).toLowerCase()))
      : buildDemoLogs()
    const rows = computeBillingFromLogs(filtered, String(month))
    res.json({ ok: true, generated: rows.length, month, patient_name: patient_name ?? 'all', source: 'demo', warning: 'Google Sheet not configured — demo data only.' })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) })
  }
})

/**
 * POST /api/inventory/billing/update-price
 * Body: { category, unit_price }
 */
app.post('/api/inventory/billing/update-price', (req, res) => {
  const { category, unit_price } = req.body ?? {}
  if (!category || unit_price === undefined) {
    return res.status(400).json({ ok: false, error: 'category and unit_price are required.' })
  }
  const allowedCategories = ['pampers', 'wet', 'milk', 'gloves']
  if (!allowedCategories.includes(String(category))) {
    return res.status(400).json({ ok: false, error: `category must be one of: ${allowedCategories.join(', ')}` })
  }
  const updated = updatePrice(String(category), Number(unit_price))
  // Audit trail — fire and forget
  logAuditEvent({
    timestamp:   new Date().toISOString(),
    action_type: 'PRICE_UPDATE',
    item_key:    category,
    qty:         0,
    before_stock: 0,
    after_stock:  0,
    source:      'api',
    remarks:     `${category} price updated to RM${Number(unit_price).toFixed(2)}`,
  }).catch(() => {})
  res.json({ ok: true, prices: updated, updated_category: category, new_price: updated[category] })
})

/**
 * POST /api/inventory/billing/mark-paid
 * Body: { month, patient_name, billing_status, remarks? }
 */
app.post('/api/inventory/billing/mark-paid', async (req, res) => {
  const { month, patient_name, billing_status = 'Paid', remarks } = req.body ?? {}
  if (!month || !patient_name) {
    return res.status(400).json({ ok: false, error: 'month and patient_name are required.' })
  }
  const validStatuses = ['Paid', 'Unpaid', 'Waived']
  if (!validStatuses.includes(billing_status)) {
    return res.status(400).json({ ok: false, error: `billing_status must be one of: ${validStatuses.join(', ')}` })
  }
  try {
    if (isBillingSheetConfigured()) {
      const count = await updateBillingStatus(String(month), String(patient_name), billing_status, remarks)
      return res.json({ ok: true, updated_rows: count, month, patient_name, billing_status })
    }
    res.json({ ok: true, updated_rows: 0, source: 'demo', warning: 'Google Sheet not configured — status not persisted.' })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) })
  }
})

// ── Prices endpoint ───────────────────────────────────────────────────────────

/** GET /api/inventory/billing/prices */
app.get('/api/inventory/billing/prices', (_req, res) => {
  res.json({ ok: true, prices: getPrices(), defaults: DEFAULT_PRICES })
})

// ── Stage 9: Health check ─────────────────────────────────────────────────────

/**
 * GET /api/inventory/health
 * Returns the operational status of every inventory sub-system.
 */
app.get('/api/inventory/health', (_req, res) => {
  const sheetsOk    = invSheetConfigured()
  const telegramOk  = Boolean(process.env.TELEGRAM_BOT_TOKEN)
  const auditOk     = isAuditConfigured()

  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    services: {
      inventory:    'ok',
      googleSheets: sheetsOk  ? 'connected'     : 'fallback (demo mode)',
      auditTrail:   auditOk   ? 'connected'     : 'fallback (demo mode)',
      telegram:     telegramOk? 'ready'          : 'not configured — set TELEGRAM_BOT_TOKEN',
      dashboard:    'ready',
      mobileUI:     'ready',
      billing:      'ready',
      reports:      'ready',
    },
    env: {
      GOOGLE_SHEET_ID:            sheetsOk ? '✅ set' : '❌ missing',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: sheetsOk ? '✅ set' : '❌ missing',
      GOOGLE_PRIVATE_KEY:         sheetsOk ? '✅ set' : '❌ missing',
      TELEGRAM_BOT_TOKEN:         telegramOk ? '✅ set' : '❌ missing',
    },
  })
})

// ── Stage 9: Seed test data ───────────────────────────────────────────────────

/**
 * POST /api/inventory/seed-test-data
 * Saves realistic test records for 3 patients × 3 nurses × multiple items.
 * Only usable when Google Sheet is configured; otherwise returns demo snapshot.
 */
app.post('/api/inventory/seed-test-data', async (req, res) => {
  const today = invTodayIso()
  const month = invCurrentMonth()

  const TEST_RECORDS = [
    // Ali — Room 2
    { patient_name: 'Ali',        room: '2', item_key: 'PAMPERS_M',  size: 'M',  qty: 3,  nurse_name: 'Nurse Aina',  telegram_username: '@aina',  remarks: 'After bath' },
    { patient_name: 'Ali',        room: '2', item_key: 'PAMPERS_M',  size: 'M',  qty: 4,  nurse_name: 'Nurse Mei',   telegram_username: '@mei',   remarks: 'Morning shift' },
    { patient_name: 'Ali',        room: '2', item_key: 'WET_TISSUE', size: '',   qty: 2,  nurse_name: 'Nurse Aina',  telegram_username: '@aina',  remarks: '' },
    { patient_name: 'Ali',        room: '2', item_key: 'MILK_FULL',  size: '',   qty: 3,  nurse_name: 'Nurse Siti',  telegram_username: '@siti',  remarks: 'Breakfast' },
    // Mary — Room 5
    { patient_name: 'Mary',       room: '5', item_key: 'PAMPERS_L',  size: 'L',  qty: 4,  nurse_name: 'Nurse Mei',   telegram_username: '@mei',   remarks: '' },
    { patient_name: 'Mary',       room: '5', item_key: 'PAMPERS_L',  size: 'L',  qty: 3,  nurse_name: 'Nurse Siti',  telegram_username: '@siti',  remarks: 'Evening' },
    { patient_name: 'Mary',       room: '5', item_key: 'WET_TISSUE', size: '',   qty: 1,  nurse_name: 'Nurse Siti',  telegram_username: '@siti',  remarks: '' },
    { patient_name: 'Mary',       room: '5', item_key: 'MILK_LOW',   size: '',   qty: 4,  nurse_name: 'Nurse Aina',  telegram_username: '@aina',  remarks: 'Lunch' },
    // Tan Ah Kow — Room 7
    { patient_name: 'Tan Ah Kow', room: '7', item_key: 'PAMPERS_XL', size: 'XL', qty: 3,  nurse_name: 'Nurse Siti',  telegram_username: '@siti',  remarks: '' },
    { patient_name: 'Tan Ah Kow', room: '7', item_key: 'PAMPERS_XL', size: 'XL', qty: 2,  nurse_name: 'Nurse Mei',   telegram_username: '@mei',   remarks: 'Night shift' },
    { patient_name: 'Tan Ah Kow', room: '7', item_key: 'WET_TISSUE', size: '',   qty: 3,  nurse_name: 'Nurse Mei',   telegram_username: '@mei',   remarks: '' },
    { patient_name: 'Tan Ah Kow', room: '7', item_key: 'MILK_FULL',  size: '',   qty: 5,  nurse_name: 'Nurse Aina',  telegram_username: '@aina',  remarks: 'Dinner' },
    // Gloves (no patient)
    { patient_name: '',           room: '',  item_key: 'GLOVES_M',   size: 'M',  qty: 10, nurse_name: 'Nurse Aina',  telegram_username: '@aina',  remarks: 'Ward use' },
    { patient_name: '',           room: '',  item_key: 'GLOVES_M',   size: 'M',  qty: 10, nurse_name: 'Nurse Mei',   telegram_username: '@mei',   remarks: 'Ward use' },
  ]

  const saved = []
  const errors = []

  for (let i = 0; i < TEST_RECORDS.length; i++) {
    const r = TEST_RECORDS[i]
    const record = {
      ...r,
      timestamp:         `${today}T${String(8 + Math.floor(i / 3)).padStart(2,'0')}:${String((i * 11) % 60).padStart(2,'0')}:00.000Z`,
      source:            'seed',
    }
    try {
      if (invSheetConfigured()) {
        await saveFullInventoryRecord(record)
      }
      saved.push(record)
    } catch (err) {
      errors.push({ record: r.item_key, error: err.message })
    }
  }

  res.json({
    ok:        true,
    saved:     saved.length,
    errors:    errors.length,
    errorList: errors,
    patients:  ['Ali (Room 2)', 'Mary (Room 5)', 'Tan Ah Kow (Room 7)'],
    nurses:    ['Nurse Aina', 'Nurse Mei', 'Nurse Siti'],
    source:    invSheetConfigured() ? 'sheets' : 'demo-only',
    note:      invSheetConfigured()
      ? `${saved.length} records saved to Google Sheet.`
      : 'Google Sheet not configured — records shown only, not persisted.',
    preview:   saved.slice(0, 3),
  })
})

// ── Stage 8: Admin Stock Control endpoints ────────────────────────────────────

/**
 * POST /api/inventory/stock/add
 * Body: { item_key, qty, nurse_name?, remarks? }
 * Adds new stock (restock / delivery). Increases opening_stock.
 */
app.post('/api/inventory/stock/add', async (req, res) => {
  try {
    const { item_key, qty, nurse_name, remarks } = req.body ?? {}
    if (!item_key || qty === undefined) {
      return res.status(400).json({ ok: false, error: 'item_key and qty are required.' })
    }
    const qty_  = Number(qty)
    if (qty_ <= 0) return res.status(400).json({ ok: false, error: 'qty must be > 0.' })

    let result = { balance: 0, opening_stock: 0 }
    if (invSheetConfigured()) {
      result = await invAddStock(item_key, qty_)
    }

    // Audit trail
    logAuditEvent({
      timestamp:   new Date().toISOString(),
      action_type: 'STOCK_ADD',
      nurse_name:  nurse_name ?? '',
      item_key,
      qty:         qty_,
      before_stock: Math.max(0, result.balance - qty_),
      after_stock:  result.balance,
      source:      'api',
      remarks:     remarks ?? `Stock added: +${qty_}`,
    }).catch(() => {})

    res.json({ ok: true, item_key, qty: qty_, ...result, source: invSheetConfigured() ? 'sheets' : 'demo' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * POST /api/inventory/stock/adjust
 * Body: { item_key, new_balance, nurse_name?, reason? }
 * Manually sets the stock balance (correction / audit override).
 */
app.post('/api/inventory/stock/adjust', async (req, res) => {
  try {
    const { item_key, new_balance, nurse_name, reason } = req.body ?? {}
    if (!item_key || new_balance === undefined) {
      return res.status(400).json({ ok: false, error: 'item_key and new_balance are required.' })
    }

    let before = 0
    let result = { balance: Number(new_balance) }

    if (invSheetConfigured()) {
      const currentRows = await invGetBalance()
      const current     = currentRows.find((r) => r.item_key === item_key)
      before            = current?.balance ?? 0
      result            = await invAdjustStock(item_key, Number(new_balance))
    }

    logAuditEvent({
      timestamp:   new Date().toISOString(),
      action_type: 'STOCK_ADJUSTMENT',
      nurse_name:  nurse_name ?? '',
      item_key,
      qty:         Number(new_balance) - before,
      before_stock: before,
      after_stock:  result.balance,
      source:      'api',
      remarks:     reason ?? 'Manual stock adjustment',
    }).catch(() => {})

    res.json({ ok: true, item_key, ...result, source: invSheetConfigured() ? 'sheets' : 'demo' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * POST /api/inventory/stock/set-minimum
 * Body: { item_key, minimum_level, nurse_name? }
 */
app.post('/api/inventory/stock/set-minimum', async (req, res) => {
  try {
    const { item_key, minimum_level, nurse_name } = req.body ?? {}
    if (!item_key || minimum_level === undefined) {
      return res.status(400).json({ ok: false, error: 'item_key and minimum_level are required.' })
    }

    let result = { minimum_level: Number(minimum_level) }
    if (invSheetConfigured()) {
      result = await invSetMinimum(item_key, Number(minimum_level))
    }

    logAuditEvent({
      timestamp:   new Date().toISOString(),
      action_type: 'STOCK_ADJUSTMENT',
      nurse_name:  nurse_name ?? '',
      item_key,
      qty:         0,
      before_stock: 0,
      after_stock:  0,
      source:      'api',
      remarks:     `Minimum level set to ${minimum_level}`,
    }).catch(() => {})

    res.json({ ok: true, item_key, ...result, source: invSheetConfigured() ? 'sheets' : 'demo' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * POST /api/inventory/price/set
 * Body: { category, unit_price, nurse_name? }
 * Admin endpoint for setting item category prices.
 */
app.post('/api/inventory/price/set', (req, res) => {
  const { category, unit_price, nurse_name } = req.body ?? {}
  if (!category || unit_price === undefined) {
    return res.status(400).json({ ok: false, error: 'category and unit_price are required.' })
  }
  const allowed = ['pampers', 'wet', 'milk', 'gloves']
  if (!allowed.includes(String(category))) {
    return res.status(400).json({ ok: false, error: `category must be one of: ${allowed.join(', ')}` })
  }
  const updated = updatePrice(String(category), Number(unit_price))
  logAuditEvent({
    timestamp:   new Date().toISOString(),
    action_type: 'PRICE_UPDATE',
    nurse_name:  nurse_name ?? '',
    item_key:    category,
    qty:         0,
    before_stock: 0,
    after_stock:  0,
    source:      'api',
    remarks:     `${category} price set to RM${Number(unit_price).toFixed(2)}`,
  }).catch(() => {})
  res.json({ ok: true, prices: updated, updated_category: category, new_price: updated[category] })
})

// ── Stage 7: Audit Trail endpoints ───────────────────────────────────────────

/**
 * GET /api/inventory/audit
 * Query params: date, month, nurse, patient, item_key, limit (default 100)
 */
app.get('/api/inventory/audit', async (req, res) => {
  try {
    const opts = {
      date:     req.query.date     || undefined,
      month:    req.query.month    || undefined,
      nurse:    req.query.nurse    || undefined,
      patient:  req.query.patient  || undefined,
      item_key: req.query.item_key || undefined,
      limit:    req.query.limit ? Number(req.query.limit) : 100,
    }

    if (isAuditConfigured()) {
      const records = await getAuditTrail(opts)
      return res.json({ ok: true, records, source: 'sheets' })
    }

    // Demo fallback
    const demo = buildDemoAuditTrail(opts.date || invTodayIso())
    const filtered = demo.filter((r) => {
      if (opts.nurse   && !r.nurse_name?.toLowerCase().includes(opts.nurse.toLowerCase())) return false
      if (opts.patient && !r.patient_name?.toLowerCase().includes(opts.patient.toLowerCase())) return false
      if (opts.item_key && r.item_key !== opts.item_key && !(r.item_name ?? '').toLowerCase().includes(opts.item_key.toLowerCase())) return false
      return true
    }).slice(0, opts.limit ?? 100)
    res.json({ ok: true, records: filtered, source: 'demo' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * GET /api/inventory/audit/by-nurse?name=Aina&date=YYYY-MM-DD
 */
app.get('/api/inventory/audit/by-nurse', async (req, res) => {
  try {
    const name = req.query.name || ''
    const date = req.query.date || invTodayIso()

    if (!name) return res.status(400).json({ ok: false, error: 'name required' })

    if (isAuditConfigured()) {
      const records    = await getAuditByNurse(name, date)
      const suspicious = await detectSuspiciousUsage(name, date).catch(() => [])
      return res.json({ ok: true, records, suspicious, source: 'sheets' })
    }

    const demo    = buildDemoAuditTrail(date)
    const records = demo.filter((r) => r.nurse_name?.toLowerCase().includes(name.toLowerCase()))
    res.json({ ok: true, records, suspicious: [], source: 'demo' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * GET /api/inventory/audit/by-patient?name=Ali&month=YYYY-MM
 */
app.get('/api/inventory/audit/by-patient', async (req, res) => {
  try {
    const name  = req.query.name  || ''
    const month = req.query.month || invCurrentMonth()

    if (!name) return res.status(400).json({ ok: false, error: 'name required' })

    if (isAuditConfigured()) {
      const records = await getAuditByPatient(name, month)
      return res.json({ ok: true, records, source: 'sheets' })
    }

    const demo    = buildDemoAuditTrail()
    const records = demo.filter((r) => r.patient_name?.toLowerCase().includes(name.toLowerCase()))
    res.json({ ok: true, records, source: 'demo' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * GET /api/inventory/audit/by-item?item_key=PAMPERS_M&date=YYYY-MM-DD
 * item_key can also be a category keyword: pampers | wet | milk | gloves
 */
app.get('/api/inventory/audit/by-item', async (req, res) => {
  try {
    const itemKey = req.query.item_key || ''
    const date    = req.query.date    || invTodayIso()

    if (!itemKey) return res.status(400).json({ ok: false, error: 'item_key required' })

    if (isAuditConfigured()) {
      const records = await getAuditByItem(itemKey, date)
      return res.json({ ok: true, records, source: 'sheets' })
    }

    const demo    = buildDemoAuditTrail(date)
    const lc      = itemKey.toLowerCase()
    const records = demo.filter((r) =>
      r.item_key === itemKey ||
      (r.item_name ?? '').toLowerCase().includes(lc) ||
      (r.item_key  ?? '').toLowerCase().includes(lc)
    )
    res.json({ ok: true, records, source: 'demo' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  const badJson = err instanceof SyntaxError && err.status === 400 && 'body' in err
  const path = req.originalUrl || req.url || ''
  if (badJson && path.startsWith(WEBHOOK_PATH)) {
    console.error('[telegram] webhook JSON parse error:', err.message)
    res.status(200).json({ ok: true })
    return
  }
  console.error('[telegram] Express error:', err)
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: String(err?.message || err) })
  }
})

async function startup() {
  if (isLiveMode && webhookUrl) {
    await registerWebhook()
  } else if (isLiveMode && !webhookUrl) {
    console.warn('[telegram] TELEGRAM_MODE=live but TELEGRAM_WEBHOOK_URL is empty — setWebhook skipped.')
  }
  await fetchAndPrintWebhookInfo()
}

app.listen(PORT, () => {
  console.log(`[telegram] WMC AI Nursing Coordinator listening on http://127.0.0.1:${PORT}`)
  console.log(`[telegram] Health: GET http://127.0.0.1:${PORT}/health`)
  console.log(`[telegram] Webhook path: POST http://127.0.0.1:${PORT}${WEBHOOK_PATH}`)
  console.log(`[telegram] Backend meta: GET http://127.0.0.1:${PORT}/api/integrations/telegram/backend`)
  console.log(`[telegram] TELEGRAM_MODE=${mode} (${isLiveMode ? 'live: setWebhook + workflow replies' : 'simulation: mock store only, no Telegram send'})`)
  console.log(
    `[telegram] TELEGRAM_CHAT_ID (.env at startup): ${String(process.env.TELEGRAM_CHAT_ID || '').trim() || '(not set)'}`,
  )
  console.log(`[telegram] TELEGRAM_WEBHOOK_URL (.env): ${webhookUrl || '(not set)'}`)
  ;(async () => {
    try {
      await waitForLocalHealth(PORT)
      console.log('')
      console.log('════════════════════════════════════════════════════════')
      console.log('  Telegram webhook active and healthy')
      console.log('════════════════════════════════════════════════════════')
      console.log('')
    } catch (e) {
      console.warn('[telegram] Local /health check failed — fix binding/firewall if needed:', e?.message || e)
    }
    try {
      await startup()
    } catch (err) {
      console.error('[telegram] startup error:', err)
    }
  })()
})
