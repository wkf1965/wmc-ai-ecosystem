/**
 * Nursing NLP handler for the Telegram polling bot.
 * Routes classified nursing intents to the central backend parse API.
 */

import { log } from '../utils/logger.js'
import { parseNursingMessageViaBackend } from '../../../nursingParseApiClient.mjs'
import { isNursingIntentCategory } from '../../lib/telegramIntentClassifier.js'

function capitalize(s) {
  if (!s) return '—'
  return String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase()
}

function titleForCategory(category) {
  const map = {
    nursing_record: 'Nursing Record Saved',
    side_turning: 'Side Turning Saved',
    vital_signs: 'Vital Signs Saved',
    incident: 'Incident Record Saved',
    handover: 'Handover Noted',
    overtime: 'Overtime Noted',
    medication: 'Medication Record Saved',
  }
  return map[category] ?? 'Nursing Record Saved'
}

/**
 * Build Telegram confirmation from classified intent + optional backend payload.
 * @param {ReturnType<import('../../lib/telegramIntentClassifier.js').classifyTelegramIntent>} intent
 * @param {object|null} backendData
 */
export function buildNursingNlpReply(intent, backendData = null) {
  const parsed = backendData?.parsed ?? {}
  const alerts = Array.isArray(backendData?.alerts) ? backendData.alerts : []

  const room = parsed.room ?? intent.room ?? '—'
  const patient = parsed.patientName ?? intent.patient_name ?? '—'
  const appetite = parsed.appetite ?? (intent.appetite ? capitalize(intent.appetite) : null)
  const turning = parsed.turningPosition ?? (intent.turning ? capitalize(intent.turning) : null)

  let risk = intent.risk ?? 'Low'
  if (alerts.some((a) => a.severity === 'critical' || a.severity === 'high')) risk = 'High'
  else if (alerts.some((a) => a.severity === 'medium')) risk = 'Medium'
  else if (appetite && /poor|refused/i.test(String(appetite))) risk = 'Medium'

  const lines = [`✅ ${titleForCategory(intent.category)}`, '', `Room: ${room}`, `Patient: ${patient}`]

  if (appetite) lines.push(`Appetite: ${capitalize(appetite)}`)
  if (turning) lines.push(`Turning: ${capitalize(turning)}`)

  const vitals = parsed.vitals ?? {}
  if (vitals.bloodPressure || vitals.pulse) {
    lines.push(`BP: ${vitals.bloodPressure ?? '—'}`, `Pulse: ${vitals.pulse ?? '—'}`)
  }

  if (risk) lines.push(`Risk: ${risk}`)

  if (alerts.length > 0) {
    lines.push('', '⚠️ Alerts:')
    for (const alert of alerts) lines.push(`• ${alert.message}`)
  }

  return lines.join('\n')
}

/**
 * @param {import('node-telegram-bot-api')} bot
 * @param {import('node-telegram-bot-api').Message} msg
 * @param {ReturnType<import('../../lib/telegramIntentClassifier.js').classifyTelegramIntent>} intent
 * @returns {Promise<boolean>}
 */
export async function tryHandleNursingNlp(bot, msg, intent) {
  if (!intent || !isNursingIntentCategory(intent.category)) return false

  const text = (msg.text ?? '').trim()
  if (!text) return false

  const chatId = msg.chat.id
  const nurseName = msg.from?.first_name ?? msg.from?.username ?? 'Nurse'

  let backendData = null
  try {
    const result = await parseNursingMessageViaBackend(text, {
      nurseName,
      chatId,
      source: 'telegram-bot',
    })
    if (result.ok && result.data) backendData = result.data
    else log.warn('[nursing-nlp] backend parse skipped:', result.error)
  } catch (err) {
    log.warn('[nursing-nlp] backend parse error:', err?.message ?? err)
  }

  const reply = buildNursingNlpReply(intent, backendData)

  await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' })
  log.info(`[nursing-nlp] saved ${intent.category} room ${intent.room ?? '—'} patient ${intent.patient_name ?? '—'}`)
  return true
}
