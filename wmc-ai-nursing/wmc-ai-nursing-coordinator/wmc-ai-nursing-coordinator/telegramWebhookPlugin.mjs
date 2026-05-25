/**
 * Dev-server middleware: Telegram webhook + mock file store.
 * POST body = Telegram Update JSON or `{ "text": "Room 3 ..." }`
 */

import { readTelegramMockStoreState } from './telegramMockStore.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readTelegramNursingMemoryState,
  updateTelegramNursingMemoryRecord,
} from './telegramNursingMemory.mjs'
import { buildTelegramDashboardSnapshot } from './telegramDashboardSnapshot.mjs'
import { executeTelegramInboundPipeline } from './telegramWebhookPipeline.mjs'
import {
  logTelegramChatIdFromWebhook,
  telegramGetWebhookInfo,
  telegramSetWebhook,
} from './telegramWebhookProcessor.mjs'
import { processMobileNurseSubmit } from './mobileNurseSubmitApi.mjs'

const inboundQueue = []
const WORKFLOW_SESSIONS_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'src/bot/data/workflowSessions.json',
)

function readTelegramEnv() {
  return {
    mode: process.env.TELEGRAM_MODE || process.env.VITE_TELEGRAM_MODE || 'simulation',
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    webhookUrl: (process.env.TELEGRAM_WEBHOOK_URL || '').trim(),
    chatId: (process.env.TELEGRAM_CHAT_ID || '').trim(),
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function json(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

async function handleWebhookPost(req, res) {
  const { mode, token } = readTelegramEnv()
  let bodyJson
  try {
    bodyJson = await readJsonBody(req)
  } catch (e) {
    json(res, 200, { ok: true })
    console.error('[telegram/vite] webhook JSON parse error:', String(e?.message || e))
    return
  }

  try {
    const sanitized =
      bodyJson != null && typeof bodyJson === 'object' && !Array.isArray(bodyJson) ? bodyJson : {}
    const msg = sanitized.message || sanitized.edited_message || sanitized.channel_post
    const uid = sanitized.update_id ?? '(missing)'
    console.log(`[telegram/vite] webhook received update_id=${uid} chat.id=${msg?.chat?.id ?? '—'}`)
    logTelegramChatIdFromWebhook(sanitized, '[telegram/vite]')

    json(res, 200, { ok: true })

    const result = await executeTelegramInboundPipeline(sanitized, { mode, token })
    const {
      processed,
      telegramSent,
      telegramError,
      entry,
      memoryRecord,
      extracted,
      nursingRecord,
      brainSignals,
      replyText,
    } = result

    if (entry && memoryRecord) {
      inboundQueue.unshift({
        receivedAt: entry.receivedAt,
        update_id: processed.rawUpdate.update_id ?? null,
        chat_id: extracted.chatId,
        extracted,
        nursingRecord,
        memoryId: memoryRecord.id,
      })
      if (inboundQueue.length > 100) inboundQueue.pop()
    }

    console.log('[telegram/vite] pipeline complete telegramSent=', telegramSent, telegramError || '')
  } catch (e) {
    console.error('[telegram/vite] webhook pipeline error:', e)
  }
}

export function telegramWebhookPlugin() {
  return {
    name: 'wmc-telegram-webhook',
    configureServer(server) {
      server.middlewares.use('/api/admin/clear-workflow-sessions', async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { ok: false, error: 'Use POST' })
          return
        }
        try {
          mkdirSync(dirname(WORKFLOW_SESSIONS_FILE), { recursive: true })
          writeFileSync(WORKFLOW_SESSIONS_FILE, '{}', 'utf8')
          let clearedInMemory = 0
          try {
            const { clearAllSessions } = await import('./src/bot/services/stateManager.js')
            clearedInMemory = clearAllSessions()
          } catch {
            /* bot module unavailable in some dev setups */
          }
          json(res, 200, { ok: true, clearedInMemory, file: WORKFLOW_SESSIONS_FILE })
        } catch (e) {
          json(res, 500, { ok: false, error: String(e?.message || e) })
        }
      })

      server.middlewares.use('/api/nursing/mobile-submit', async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { ok: false, error: 'Use POST' })
          return
        }
        ;(async () => {
          let body = {}
          try {
            body = await readJsonBody(req)
          } catch (e) {
            json(res, 400, { ok: false, error: String(e?.message || e) })
            return
          }
          try {
            const out = await processMobileNurseSubmit(body)
            json(res, 200, out)
          } catch (e) {
            if (e.code === 'VALIDATION') json(res, 400, { ok: false, error: String(e.message || e) })
            else json(res, 500, { ok: false, error: String(e?.message || e) })
          }
        })().catch((e) => json(res, 500, { ok: false, error: String(e?.message || e) }))
      })

      server.middlewares.use('/api/integrations/telegram/webhook', (req, res) => {
        const mode = readTelegramEnv().mode

        if (req.method === 'GET') {
          json(res, 200, {
            ok: true,
            mode,
            pipeline: 'telegramWebhookPipeline.executeTelegramInboundPipeline',
            transport: 'vite-dev-middleware',
            message: 'Telegram webhook (dev). POST Telegram Update JSON or { text }. Production: run npm run telegram + ngrok on port 3001.',
            queued: inboundQueue.length,
          })
          return
        }

        if (req.method !== 'POST') {
          json(res, 405, { ok: false, error: 'Use POST' })
          return
        }

        handleWebhookPost(req, res).catch((e) => {
          json(res, 500, { ok: false, error: String(e?.message || e) })
        })
      })

      server.middlewares.use('/api/integrations/telegram/last', async (req, res) => {
        if (req.method !== 'GET') {
          json(res, 405, { ok: false, error: 'Use GET' })
          return
        }
        try {
          const state = await readTelegramMockStoreState()
          json(res, 200, {
            ok: true,
            last: state.last || null,
            entryCount: state.entries?.length ?? 0,
          })
        } catch (e) {
          json(res, 500, { ok: false, error: String(e?.message || e) })
        }
      })

      server.middlewares.use('/api/integrations/telegram/dashboard', async (req, res) => {
        if (req.method !== 'GET') {
          json(res, 405, { ok: false, error: 'Use GET' })
          return
        }
        try {
          const snapshot = await buildTelegramDashboardSnapshot()
          json(res, 200, snapshot)
        } catch (e) {
          json(res, 500, { ok: false, error: String(e?.message || e) })
        }
      })

      server.middlewares.use('/api/integrations/telegram/nursing-memory', async (req, res) => {
        if (req.method === 'GET') {
          try {
            let limit = 100
            const limitMatch = /[?&]limit=(\d+)/.exec(req.url || '')
            if (limitMatch) {
              const raw = parseInt(limitMatch[1], 10)
              if (Number.isFinite(raw)) limit = Math.min(500, Math.max(1, raw))
            }
            const state = await readTelegramNursingMemoryState()
            json(res, 200, {
              ok: true,
              records: (state.entries || []).slice(0, limit),
              recordCount: state.entries?.length ?? 0,
            })
          } catch (e) {
            json(res, 500, { ok: false, error: String(e?.message || e) })
          }
          return
        }
        if (req.method === 'PATCH') {
          ;(async () => {
            let body = {}
            try {
              body = await readJsonBody(req)
            } catch (e) {
              json(res, 400, { ok: false, error: String(e?.message || e) })
              return
            }
            const id = body.id
            if (!id) {
              json(res, 400, { ok: false, error: 'Body must include id (memory row id).' })
              return
            }
            try {
              const record = await updateTelegramNursingMemoryRecord(id, {
                status: body.status,
                escalatedToDoctor: body.escalatedToDoctor,
                familyUpdateDraft: body.familyUpdateDraft,
              })
              json(res, 200, { ok: true, record })
            } catch (e) {
              if (e.code === 'NOT_FOUND') json(res, 404, { ok: false, error: String(e.message || e) })
              else if (e.code === 'INVALID') json(res, 400, { ok: false, error: String(e.message || e) })
              else json(res, 500, { ok: false, error: String(e?.message || e) })
            }
          })().catch((e) => json(res, 500, { ok: false, error: String(e?.message || e) }))
          return
        }
        json(res, 405, { ok: false, error: 'Use GET or PATCH' })
      })

      server.middlewares.use('/api/integrations/telegram/entries', async (req, res) => {
        if (req.method !== 'GET') {
          json(res, 405, { ok: false, error: 'Use GET' })
          return
        }
        try {
          let limit = 15
          const limitMatch = /[?&]limit=(\d+)/.exec(req.url || '')
          if (limitMatch) {
            const raw = parseInt(limitMatch[1], 10)
            if (Number.isFinite(raw)) limit = Math.min(50, Math.max(1, raw))
          }
          const state = await readTelegramMockStoreState()
          const entries = (state.entries || []).slice(0, limit)
          json(res, 200, {
            ok: true,
            entries,
            entryCount: state.entries?.length ?? 0,
          })
        } catch (e) {
          json(res, 500, { ok: false, error: String(e?.message || e) })
        }
      })

      server.middlewares.use('/api/integrations/telegram/config', (req, res) => {
        if (req.method !== 'GET') {
          json(res, 405, { ok: false, error: 'Use GET' })
          return
        }
        const env = readTelegramEnv()
        json(res, 200, {
          ok: true,
          mode: env.mode,
          webhookUrl: env.webhookUrl,
          botTokenConfigured: Boolean(env.token),
          chatIdConfigured: Boolean(env.chatId),
          simulationDefault: env.mode === 'simulation' || !env.mode,
        })
      })

      server.middlewares.use('/api/integrations/telegram/set-webhook', (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { ok: false, error: 'Use POST' })
          return
        }
        ;(async () => {
          const env = readTelegramEnv()
          if (!env.token) {
            json(res, 400, { ok: false, error: 'TELEGRAM_BOT_TOKEN is missing in .env' })
            return
          }
          let body = {}
          try {
            body = await readJsonBody(req)
          } catch (e) {
            json(res, 400, { ok: false, error: String(e?.message || e) })
            return
          }
          const url = String(body.url || env.webhookUrl || '').trim()
          if (!url) {
            json(res, 400, {
              ok: false,
              error: 'Webhook URL missing — set TELEGRAM_WEBHOOK_URL in .env or POST { "url": "https://..." }',
            })
            return
          }
          try {
            const telegram = await telegramSetWebhook(env.token, url, {
              drop_pending_updates: body.drop_pending_updates === true,
            })
            json(res, 200, { ok: true, urlUsed: url, telegram })
          } catch (e) {
            json(res, 502, { ok: false, error: String(e?.message || e), urlAttempted: url })
          }
        })().catch((e) => json(res, 500, { ok: false, error: String(e?.message || e) }))
      })

      server.middlewares.use('/api/integrations/telegram/webhook-info', (req, res) => {
        if (req.method !== 'GET') {
          json(res, 405, { ok: false, error: 'Use GET' })
          return
        }
        ;(async () => {
          const env = readTelegramEnv()
          if (!env.token) {
            json(res, 400, { ok: false, error: 'TELEGRAM_BOT_TOKEN is missing in .env' })
            return
          }
          try {
            const info = await telegramGetWebhookInfo(env.token)
            json(res, 200, { ok: true, info })
          } catch (e) {
            json(res, 502, { ok: false, error: String(e?.message || e) })
          }
        })().catch((e) => json(res, 500, { ok: false, error: String(e?.message || e) }))
      })

      server.middlewares.use('/api/integrations/telegram/send-test-reply', (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { ok: false, error: 'Use POST' })
          return
        }
        ;(async () => {
          const env = readTelegramEnv()
          if (!env.token) {
            json(res, 400, { ok: false, error: 'TELEGRAM_BOT_TOKEN is missing in .env' })
            return
          }
          let body = {}
          try {
            body = await readJsonBody(req)
          } catch (e) {
            json(res, 400, { ok: false, error: String(e?.message || e) })
            return
          }
          const rawChat = body.chat_id ?? body.chatId ?? env.chatId
          if (rawChat === undefined || rawChat === null || String(rawChat).trim() === '') {
            json(res, 400, {
              ok: false,
              error: 'chat_id required — set TELEGRAM_CHAT_ID in .env or POST { "chat_id": "<your chat id>" }',
            })
            return
          }
          const chatId = /^-?\d+$/.test(String(rawChat).trim()) ? Number(String(rawChat).trim()) : rawChat
          const text =
            typeof body.text === 'string' && body.text.trim()
              ? body.text.trim()
              : 'WMC AI Nursing Coordinator: test reply OK.'
          try {
            const telegram = await sendTelegramChatMessage(env.token, chatId, text)
            json(res, 200, { ok: true, chat_id: chatId, telegram })
          } catch (e) {
            json(res, 502, { ok: false, error: String(e?.message || e), chat_id: chatId })
          }
        })().catch((e) => json(res, 500, { ok: false, error: String(e?.message || e) }))
      })

      server.middlewares.use('/api/integrations/telegram/sim-inbound', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end()
          return
        }
        json(res, 200, { ok: true, items: inboundQueue.slice(0, 50) })
      })
    },
  }
}
