/**
 * WMC AI Nursing Coordinator — Telegram Bot Entry Point
 * Stage 1: Command skeleton with state management (polling mode)
 *
 * Run:
 *   npm run bot
 *
 * Note: Uses polling mode. If a webhook is registered with Telegram, it will
 * be automatically removed on startup so polling can work.
 */

import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import { registerAllCommands }  from './commands/index.js'
import { listActiveSessions }   from './services/stateManager.js'
import { checkSheetConfig }     from './services/googleSheetService.js'
import { checkAiConfig }        from './services/aiSummaryService.js'
import { checkBackendConfig }   from './services/backendApiService.js'
import { log }                  from './utils/logger.js'

// ── Validate environment ─────────────────────────────────────────────────────

const token = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim()

if (!token) {
  log.error('TELEGRAM_BOT_TOKEN is not set in .env')
  log.error('Please add: TELEGRAM_BOT_TOKEN=<your_bot_token>')
  process.exit(1)
}

// ── Create bot instance (polling mode) ──────────────────────────────────────

const bot = new TelegramBot(token, {
  polling: {
    interval: 1000,     // check every 1 second
    autoStart: false,   // manual start after webhook cleanup
    params: { timeout: 10 },
  },
})

// ── Remove existing webhook so polling can work ──────────────────────────────
// The webhook server (npm run telegram) uses the same token. Stop it first,
// or let this bot delete the webhook automatically.

log.info('WMC AI Nursing Coordinator — Stage 5 Bot')

// ── Check Google Sheet configuration ────────────────────────────────────────
const sheetConfig = checkSheetConfig()
if (sheetConfig.ok) {
  log.info('Google Sheet integration: READY ✓')
} else {
  log.warn('Google Sheet integration: MISSING ENV VARS →', sheetConfig.missing.join(', '))
  log.warn('Records will save locally only until .env is configured.')
}

// ── Check OpenAI configuration ───────────────────────────────────────────────
const aiConfig = checkAiConfig()
if (aiConfig.ok) {
  log.info('DeepSeek AI integration: READY ✓')
} else {
  log.warn('DeepSeek AI integration: DEEPSEEK_API_KEY not set — /handover will not work.')
}

// ── Check Backend API configuration ─────────────────────────────────────────
const backendConfig = checkBackendConfig()
if (backendConfig.ok) {
  log.info(`Backend API integration: READY ✓  →  ${backendConfig.url}`)
} else {
  log.warn('Backend API integration: WMC_BACKEND_API_URL not set — backend sync disabled.')
}

log.info('Removing existing webhook (if any)...')

bot.deleteWebHook()
  .then(() => {
    log.info('Webhook removed. Starting polling mode...')
    return bot.startPolling()
  })
  .then(() => {
    log.info('Bot is running! Send /start in your Telegram group to begin.')
    log.info('Press Ctrl+C to stop.')
  })
  .catch((err) => {
    log.error('Failed to start bot:', err?.message || err)
    process.exit(1)
  })

// ── Register all commands ────────────────────────────────────────────────────

registerAllCommands(bot)

// ── Error handling ───────────────────────────────────────────────────────────

bot.on('polling_error', (err) => {
  log.error('Polling error:', err?.message || err)
})

bot.on('error', (err) => {
  log.error('Bot error:', err?.message || err)
})

// ── Status logging every 5 minutes ───────────────────────────────────────────

setInterval(() => {
  const sessions = listActiveSessions()
  if (sessions.length > 0) {
    log.info(`Active sessions: ${sessions.length}`)
    for (const s of sessions) {
      log.info(`  chat:${s.chatId} → ${s.workflow} (step ${s.step})`)
    }
  }
}, 5 * 60 * 1000)

// ── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGINT', () => {
  log.info('Shutting down bot...')
  bot.stopPolling().then(() => {
    log.info('Bot stopped.')
    process.exit(0)
  })
})

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception (bot continues):', err?.message || err)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason)
})
