/**
 * Mental Health NLP — natural-language mental health assessment for Telegram.
 *
 * Example:
 *   Room 201 Fung Poh Chai wandering agitation insomnia
 */

import { log } from '../utils/logger.js'
import { getPatientByRoom, resolvePatientRoomByName } from './patientRoomService.js'
import { safeSendMessage } from '../utils/safeMessage.js'
import { parseVitalsMessage } from './vitalsNlp.js'

const NURSING_WEB = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const MENTAL_HEALTH_CUE =
  /\b(?:agitat(?:ed|ion)|aggress(?:ive|ion)|wander(?:ing)?|anxious|anxiety|depress(?:ed|ion)|hallucinat(?:ion|ing|ed)|insomnia|suicidal|restless|hearing\s+voices|wants?\s+to\s+die)\b/i

/** True when message is a mental health / behavioural assessment. */
export function isMentalHealthMessage(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  const parsed = parseVitalsMessage(t)
  if (!parsed.room && !parsed.patientName) return false
  return MENTAL_HEALTH_CUE.test(t)
}

export function parseMentalHealthMessage(text) {
  return {
    ...parseVitalsMessage(text),
    text,
  }
}

export async function handleMentalHealthNlp(bot, msg, nurseName) {
  const chatId = msg.chat.id
  const text = String(msg.text ?? '')

  if (!isMentalHealthMessage(text)) return false

  console.log('[NLP] Mental health assessment detected')
  log.info('[NLP] Mental health assessment detected — text:', text.slice(0, 160))

  const parsed = parseMentalHealthMessage(text)
  const typedName = parsed.patientName || ''
  let patientName = ''
  let room = parsed.room || ''

  if (room) {
    try {
      patientName = (await getPatientByRoom(room)) || ''
    } catch (err) {
      log.warn('[MentalHealth] Patient lookup error:', err?.message ?? String(err))
    }
  } else if (typedName) {
    try {
      const match = await resolvePatientRoomByName(typedName)
      if (match.status === 'found') {
        room = match.room
        patientName = match.patient
      } else if (match.status === 'ambiguous') {
        await safeSendMessage(bot, chatId, `Found more than one patient named "${typedName}". Please include the room number.`)
        return true
      }
    } catch (err) {
      log.warn('[MentalHealth] Name→room lookup error:', err?.message ?? String(err))
    }
  } else {
    await safeSendMessage(bot, chatId, 'Please include the patient name or room number for mental health assessment.')
    return true
  }

  const resolvedPatient = patientName || typedName || ''
  let telegramReply = null

  try {
    const res = await fetch(`${NURSING_WEB}/api/ai/mental-health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        room,
        patientName: resolvedPatient,
      }),
    })
    const payload = await res.json().catch(() => null)
    if (res.ok && payload?.ok && typeof payload.telegramReply === 'string') {
      telegramReply = payload.telegramReply
      console.log(
        `[MentalHealthBrain] risk=${payload.mentalHealthRisk} reasons=${payload.reasons?.length ?? 0} room=${room}`,
      )
    } else {
      console.error('[MentalHealth] API failed:', payload?.error ?? `HTTP ${res.status}`)
    }
  } catch (err) {
    console.error('[MentalHealth] API error:', err?.message ?? err)
    log.error('[MentalHealth] API error:', err?.message ?? String(err))
  }

  if (telegramReply) {
    await safeSendMessage(bot, chatId, telegramReply)
    return true
  }

  await safeSendMessage(bot, chatId, '⚠️ Could not assess mental health risk. Please try again in a moment.')
  return true
}
