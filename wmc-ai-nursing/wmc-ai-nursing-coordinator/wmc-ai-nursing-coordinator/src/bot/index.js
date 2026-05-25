/**
 * WMC AI Nursing Coordinator — Telegram Bot Entry Point
 * Stage 1: Command skeleton with state management (polling mode)
 *
 * Run:
 *   npm run bot
 *   npm run telegram  (preferred — src/telegram/bot.js)
 *
 * Note: Uses polling mode. If a webhook is registered with Telegram, it will
 * be automatically removed on startup so polling can work.
 */

import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import TelegramBot from 'node-telegram-bot-api'
import { registerAllCommands }  from './commands/index.js'
import { listActiveSessions }   from './services/stateManager.js'
import { checkSheetConfig }     from './services/googleSheetService.js'
import { checkAiConfig }        from './services/aiSummaryService.js'
import { checkBackendConfig }   from './services/backendApiService.js'
import { log }                  from './utils/logger.js'
import { activeCount, getOnDutyToday, getOnOtToday } from './state/activePunchMap.js'
import { todayString }          from '../lib/attendanceCalculation.js'
import { registerCommandMenu }  from './utils/commandMenu.js'

/**
 * Start polling Telegram bot with hybrid command + NLP routing.
 */
export async function startTelegramBot() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim()

  if (!token) {
    log.error('TELEGRAM_BOT_TOKEN is not set in .env')
    log.error('Please add: TELEGRAM_BOT_TOKEN=<your_bot_token>')
    process.exit(1)
  }

  const bot = new TelegramBot(token, {
    polling: {
      interval: 1000,
      autoStart: false,
      params: { timeout: 10 },
    },
  })

  log.info('WMC AI Nursing Coordinator — polling bot')

  const sheetConfig = checkSheetConfig()
  if (sheetConfig.ok) {
    log.info('Google Sheet integration: READY ✓')
  } else {
    log.warn('Google Sheet integration: MISSING ENV VARS →', sheetConfig.missing.join(', '))
    log.warn('Records will save locally only until .env is configured.')
  }

  const aiConfig = checkAiConfig()
  if (aiConfig.ok) {
    log.info('DeepSeek AI integration: READY ✓')
  } else {
    log.warn('DeepSeek AI integration: DEEPSEEK_API_KEY not set — /handover will not work.')
  }

  const backendConfig = checkBackendConfig()
  if (backendConfig.ok) {
    log.info(`Backend API integration: READY ✓  →  ${backendConfig.url}`)
  } else {
    log.warn('Backend API integration: WMC_BACKEND_API_URL not set — backend sync disabled.')
  }

  log.info('Attendance + OT module: ENABLED ✓  (/punchin /punchout /ot_in /ot_out /attendance /ot_report)')
  log.info(`Active punch sessions loaded: ${activeCount()}`)

  registerAllCommands(bot)

  bot.on('polling_error', (err) => {
    log.error('Polling error:', err?.message || err)
  })

  bot.on('error', (err) => {
    log.error('Bot error:', err?.message || err)
  })

  setInterval(() => {
    const today    = todayString()
    const sessions = listActiveSessions()
    const onDuty   = getOnDutyToday(today)
    const onOt     = getOnOtToday(today)

    log.info(`── Status update ─────────────────────────────────────────────────`)
    log.info(`  Workflow sessions:  ${sessions.length}`)
    log.info(`  On normal duty:     ${onDuty.length}${onDuty.length ? '  [' + onDuty.map((s) => s.staff_name).join(', ') + ']' : ''}`)
    log.info(`  On OT now:          ${onOt.length}${onOt.length ? '  [' + onOt.map((s) => s.staff_name).join(', ') + ']' : ''}`)
    log.info(`  Active punch total: ${activeCount()}`)
    for (const s of sessions) {
      log.info(`    chat:${s.chatId} → ${s.workflow} (step ${s.step})`)
    }
    log.info(`──────────────────────────────────────────────────────────────────`)
  }, 5 * 60 * 1000)

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

  log.info('Removing existing webhook (if any)...')

  await bot.deleteWebHook()
  log.info('Webhook removed. Starting polling mode...')
  await bot.startPolling()
  log.info('Bot is running! Send /start in your Telegram group to begin.')
  log.info('Press Ctrl+C to stop.')
  await registerCommandMenu(bot)
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  startTelegramBot().catch((err) => {
    log.error('Failed to start bot:', err?.message || err)
    process.exit(1)
  })
}
