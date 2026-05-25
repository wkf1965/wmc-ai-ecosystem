/**
 * NLP Router — hybrid Telegram architecture entry point for free-text messages.
 *
 * Telegram Message
 *       ↓
 *   Is command? → COMMAND ROUTE (onText handlers)
 *       ↓ NO
 *   NLP ROUTER (this module) → intent classify → AI/local parse → reply
 *       ↓ not handled
 *   WORKFLOW ROUTE → step-by-step forms
 */

import { log } from '../utils/logger.js'
import {
  classifyTelegramIntent,
  computeNlpConfidence,
  hasNursingKeywords,
  isNursingIntentCategory,
} from '../../lib/telegramIntentClassifier.js'
import { tryHandleInventoryNlp } from '../commands/inventoryCommands.js'
import { buildNursingNlpReply } from './nursingNlpHandler.js'
import { parseNursingMessageViaBackend } from '../../../nursingParseApiClient.mjs'
import { cancelAllSessionStates } from './sessionReset.js'

export const NLP_LOW_CONFIDENCE_REPLY = '⚠️ Please include Room + Patient Name.'

function debug(tag, payload) {
  const line = `[${tag}] ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`
  console.log(line)
  log.info(line)
}

/**
 * @param {string} text
 * @param {ReturnType<typeof classifyTelegramIntent>} intent
 */
async function parseNursingViaAi(text, intent, meta) {
  let backendData = null
  try {
    const result = await parseNursingMessageViaBackend(text, meta)
    if (result.ok && result.data) backendData = result.data
    else debug('NLP PARSED', { backend: 'skipped', error: result.error })
  } catch (err) {
    debug('NLP PARSED', { backend: 'error', error: err?.message ?? String(err) })
  }

  const reply = buildNursingNlpReply(intent, backendData)
  debug('NLP PARSED', {
    category: intent.category,
    room: intent.room,
    patient: intent.patient_name,
    appetite: intent.appetite,
    parser: backendData?.parser ?? 'rules-local',
  })
  return { reply, backendData }
}

/**
 * Route a free-text nurse message through the NLP layer.
 * Works with or without an active workflow session.
 *
 * @param {{
 *   text: string,
 *   msg?: import('node-telegram-bot-api').Message,
 *   bot?: import('node-telegram-bot-api'),
 *   chatId?: string|number,
 *   nurseName?: string,
 *   clearWorkflowOnNursing?: boolean,
 * }} ctx
 * @returns {Promise<{
 *   handled: boolean,
 *   route?: 'nursing'|'inventory'|'fallback',
 *   reply?: string,
 *   intent?: object,
 *   confidence?: string,
 *   lowConfidence?: boolean,
 *   backendData?: object|null,
 * }>}
 */
export async function routeNlpMessage(ctx) {
  const text = String(ctx.text ?? '').trim()
  if (!text || text.startsWith('/')) {
    return { handled: false, reason: 'command-or-empty' }
  }

  debug('NLP ROUTER', { text: text.slice(0, 160) })

  const intent = classifyTelegramIntent(text)
  const confidence = computeNlpConfidence(intent, text)
  debug('NLP PARSED', { category: intent.category, confidence, room: intent.room, patient: intent.patient_name })

  const chatId = ctx.chatId ?? ctx.msg?.chat?.id
  const nurseName = ctx.nurseName ?? ctx.msg?.from?.first_name ?? ctx.msg?.from?.username ?? 'Nurse'

  // ── Inventory (explicit keywords or /inventory only) ─────────────────────
  if (intent.category === 'inventory') {
    if (ctx.bot && ctx.msg) {
      const handled = await tryHandleInventoryNlp(ctx.bot, ctx.msg)
      if (handled) {
        debug('NLP ROUTER', { route: 'inventory' })
        return { handled: true, route: 'inventory', intent, confidence }
      }
    }
    return { handled: false, intent, confidence }
  }

  // ── Nursing intents ───────────────────────────────────────────────────────
  const isNursing =
    isNursingIntentCategory(intent.category)
    || (hasNursingKeywords(text) && Boolean(intent.room || intent.patient_name))

  if (isNursing) {
    if (!intent.room || !intent.patient_name) {
      debug('NLP ROUTER', { route: 'fallback', reason: 'missing-room-or-patient', confidence })
      if (ctx.bot && chatId != null) {
        await ctx.bot.sendMessage(chatId, NLP_LOW_CONFIDENCE_REPLY)
      }
      return {
        handled: true,
        route: 'fallback',
        reply: NLP_LOW_CONFIDENCE_REPLY,
        intent,
        confidence,
        lowConfidence: true,
      }
    }

    const { reply, backendData } = await parseNursingViaAi(text, intent, {
      nurseName,
      chatId,
      source: 'telegram-nlp-router',
    })

    if (ctx.clearWorkflowOnNursing !== false && ctx.msg) {
      await cancelAllSessionStates(ctx.msg)
    }

    if (ctx.bot && chatId != null) {
      await ctx.bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' })
    }

    debug('NLP ROUTER', { route: 'nursing', category: intent.category })
    return {
      handled: true,
      route: 'nursing',
      reply,
      intent,
      confidence,
      backendData,
    }
  }

  if (hasNursingKeywords(text)) {
    debug('NLP ROUTER', { route: 'fallback', reason: 'missing-room-or-patient' })
    if (ctx.bot && chatId != null) {
      await ctx.bot.sendMessage(chatId, NLP_LOW_CONFIDENCE_REPLY)
    }
    return {
      handled: true,
      route: 'fallback',
      reply: NLP_LOW_CONFIDENCE_REPLY,
      intent,
      confidence,
      lowConfidence: true,
    }
  }

  return { handled: false, intent, confidence }
}

/**
 * True when free text should stay in an active workflow instead of NLP.
 * @param {string} text
 * @param {object|null} state
 */
export function shouldContinueWorkflowStep(text, state) {
  if (!state?.workflow && !state?.flow) return false
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return false

  // Clinical free-text always goes to NLP router first
  if (hasNursingKeywords(trimmed) && (/\broom\b/i.test(trimmed) || /\bappetite\b/i.test(trimmed) || /\bturned\b/i.test(trimmed))) {
    return false
  }

  // Short step answers (name, number, size) continue workflow
  if (trimmed.length <= 24 && !hasNursingKeywords(trimmed)) return true

  return false
}
