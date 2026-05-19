/**
 * Shared Telegram inbound pipeline for WMC AI Nursing Coordinator.
 * Wire-up: Express (`npm run telegram`) and Vite dev (`telegramWebhookPlugin`) both call this
 * so production webhooks and local dev hit the same backend logic.
 */

import { persistTelegramInboundBundle } from './telegramInboundPersistence.mjs'
import { processTelegramInboundUpdate, sendTelegramChatMessage } from './telegramWebhookProcessor.mjs'

export function isLiveTelegramMode(mode) {
  const m = String(mode || 'simulation').toLowerCase()
  return m === 'live' || m === 'production'
}

/**
 * Process one Telegram Update (or dev test body), optionally send reply, persist to mock store + memory + Sheet hook.
 *
 * @param {object} bodyJson — Telegram Update JSON, or `{ text, chat_id }` test shape
 * @param {object} ctx
 * @param {string} ctx.mode — TELEGRAM_MODE / VITE_TELEGRAM_MODE
 * @param {string} ctx.token — TELEGRAM_BOT_TOKEN (required for sendMessage in live mode)
 * @returns {Promise<{ processed: object, mode: string, telegramSent: boolean, telegramError: string|null, entry: object, memoryRecord: object }>}
 */
export async function executeTelegramInboundPipeline(bodyJson, ctx) {
  const mode = String(ctx.mode || process.env.TELEGRAM_MODE || 'simulation').toLowerCase()
  const token = String(ctx.token ?? process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
  const live = isLiveTelegramMode(mode)

  const processed = await processTelegramInboundUpdate(bodyJson)
  const { extracted, replyText, brainSignals, nursingRecord, rawUpdate, integration } = processed
  const { analysis, parsed } = integration

  let telegramSent = false
  let telegramError = null

  if (live && token && extracted.chatId != null) {
    try {
      await sendTelegramChatMessage(token, extracted.chatId, replyText)
      telegramSent = true
      console.log('[telegram] telegram reply sent:', { chat_id: extracted.chatId, ok: true })
    } catch (e) {
      telegramError = String(e?.message || e)
      console.log('[telegram] telegram reply sent:', { chat_id: extracted.chatId, ok: false, error: telegramError })
    }
  } else if (live && !token) {
    telegramError = 'TELEGRAM_BOT_TOKEN missing — cannot send reply'
    console.log('[telegram] telegram reply sent:', { ok: false, reason: telegramError })
  } else if (live && extracted.chatId == null) {
    telegramError = 'No chat.id on update — reply skipped'
    console.log('[telegram] telegram reply sent:', { ok: false, reason: telegramError })
  } else {
    console.log('[telegram] telegram reply skipped (simulation or missing chat)')
  }

  const { entry, memoryRecord } = await persistTelegramInboundBundle(processed, {
    mode,
    telegramSent,
    telegramError,
    parsePreview: {
      suggestedLoopCategory: parsed.suggestedLoopCategory,
      riskKeywords: parsed.riskKeywords,
      overallScore: analysis.overallScore,
      anyEscalation: analysis.anyEscalation,
    },
  })

  return {
    processed,
    rawUpdate,
    extracted,
    nursingRecord,
    brainSignals,
    replyText,
    analysis,
    parsed,
    integration,
    mode,
    telegramSent,
    telegramError,
    entry,
    memoryRecord,
  }
}
