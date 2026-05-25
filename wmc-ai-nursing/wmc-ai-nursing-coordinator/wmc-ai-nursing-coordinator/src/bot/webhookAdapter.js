/**
 * Webhook Adapter
 *
 * Bridges the new WMC AI Nursing Coordinator commands into the
 * existing Express webhook server WITHOUT modifying the original pipeline.
 *
 * How it works
 * ────────────
 *  1. Creates a TelegramBot instance with { webHook: false }
 *     → no polling, no port binding, nothing active
 *  2. Registers ALL commands (nursing workflows + attendance/OT)
 *  3. Exposes processWebhookUpdate(body) which feeds raw Telegram
 *     updates through node-telegram-bot-api's normal handler chain
 *
 * The existing executeTelegramInboundPipeline still runs for every
 * update. This adapter runs IN ADDITION to it. Both live in the same
 * Node.js process, so they share:
 *   - stateManager (in-memory workflow sessions)
 *   - activePunchMap (in-memory + JSON file punch state)
 *
 * Errors here never affect the original pipeline — every call is wrapped
 * in try/catch so a bad command handler cannot crash the server.
 */

import TelegramBot    from 'node-telegram-bot-api'
import { registerAllCommands } from './commands/index.js'
import { registerCommandMenu } from './utils/commandMenu.js'
import { log }        from './utils/logger.js'
import { checkSheetConfig }  from './services/googleSheetService.js'
import { activeCount }       from './state/activePunchMap.js'

/** Singleton bot instance (created once, reused for all webhook requests). */
let _bot = null

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Initialise the bot adapter.
 * Safe to call multiple times — only creates the instance once.
 *
 * @param {string} token — TELEGRAM_BOT_TOKEN
 * @returns {TelegramBot|null}
 */
export function initBotAdapter(token) {
  if (_bot) return _bot
  if (!token) {
    log.warn('[bot-adapter] TELEGRAM_BOT_TOKEN not set — new commands will not fire.')
    return null
  }

  try {
    // { webHook: false } = no polling, no webhook registration, no port binding.
    // Updates are delivered manually via _bot.processUpdate(body).
    _bot = new TelegramBot(token, { webHook: false })
    registerAllCommands(_bot)
    log.info('[bot-adapter] ✅ Initialized — all commands registered (nursing + attendance/OT + side turning)')
    // Push command menu to Telegram asynchronously — non-fatal if it fails
    registerCommandMenu(_bot).catch((err) =>
      log.warn('[bot-adapter] command menu registration skipped:', err?.message ?? err)
    )
  } catch (err) {
    log.error('[bot-adapter] ❌ Initialization failed:', err?.message ?? err)
    _bot = null
  }

  return _bot
}

// ── Update routing ────────────────────────────────────────────────────────────

/**
 * Feed a raw Telegram webhook body through all registered command handlers.
 * Call this inside the Express webhook POST handler after responding 200.
 *
 * @param {object} body — parsed JSON body from Telegram
 * @returns {boolean} true if the update was processed
 */
export function processWebhookUpdate(body) {
  if (!_bot) return false
  if (!body || typeof body !== 'object') return false

  try {
    _bot.processUpdate(body)
    return true
  } catch (err) {
    // Never let command errors propagate to the webhook server
    log.error('[bot-adapter] processUpdate error:', err?.message ?? err)
    return false
  }
}

// ── Status helpers (for startup logging + API endpoints) ─────────────────────

/**
 * Return a status object suitable for logging or API responses.
 */
export function getBotAdapterStatus() {
  const sheet = checkSheetConfig()
  return {
    initialized:      Boolean(_bot),
    activePunchCount: activeCount(),
    sheetReady:       sheet.ok,
    sheetMissing:     sheet.missing,
  }
}
