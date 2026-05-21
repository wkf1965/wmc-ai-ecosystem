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
    scheduleTelegramInboundProcessing(body)
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
