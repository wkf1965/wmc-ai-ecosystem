/**
 * Turning NLP — natural-language turning / pressure sore assessment for Telegram.
 *
 * Example:
 *   Room 201 Fung Poh Chai bedridden last turned 3 hours ago redness sacrum
 */

import { log } from '../utils/logger.js'
import { getPatientByRoom, resolvePatientRoomByName } from './patientRoomService.js'
import { safeSendMessage } from '../utils/safeMessage.js'
import { parseVitalsMessage } from './vitalsNlp.js'

const NURSING_WEB = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const TURNING_CUE =
  /\b(?:last\s+(?:turned|turn)|turned\s+\d+\s+h(?:ours?|rs?)\s+ago|\d+\s+h(?:ours?|rs?)\s+since\s+(?:last\s+)?turn|turning\s+overdue|not\s+turned|reposition|pressure\s+sore)\b/i

const SKIN_CUE = /\bredness\b|\bwound\b|\bulcer\b|\bpressure\s+sore\b|\bbroken\s+skin\b|发红|發紅|褥疮|褥瘡/i

const BEDRIDDEN_CUE = /\bbed\s?ridden\b|\bbedridden\b|\bbed\s?bound\b|\bterlantar\b|卧床|臥床/i

function matchBedridden(text) {
  return BEDRIDDEN_CUE.test(String(text ?? ''))
}

function matchRedness(text) {
  return SKIN_CUE.test(String(text ?? '')) && /\bredness\b|发红|發紅/i.test(String(text ?? ''))
}

function matchRednessSite(text) {
  const t = String(text ?? '')
  const direct =
    /\bredness\s+(?:at|on)\s+([a-z]+)\b/i.exec(t) ||
    /\b([a-z]+)\s+redness\b/i.exec(t) ||
    /\bredness\s+([a-z]+)\b/i.exec(t)
  if (direct) return direct[1].toLowerCase()
  if (/\bsacrum\b/i.test(t) && /\bredness\b/i.test(t)) return 'sacrum'
  if (/\bheel?s\b/i.test(t) && /\bredness\b/i.test(t)) return 'heel'
  return null
}

function matchLastTurnedAt(text) {
  const t = String(text ?? '')
  const hoursAgo =
    /\b(?:last\s+(?:turned|turn)|turned)\s+(?:about\s+)?(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)\s+ago\b/i.exec(t) ||
    /\b(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)\s+since\s+(?:last\s+)?turn/i.exec(t)
  if (hoursAgo) {
    const ms = Number(hoursAgo[1]) * 60 * 60 * 1000
    return new Date(Date.now() - ms).toISOString()
  }
  return null
}

/** True when message is a turning / pressure-sore assessment (not generic vitals). */
export function isTurningMessage(text) {
  const t = String(text ?? '').trim()
  if (!t) return false

  const parsed = parseVitalsMessage(t)
  if (!parsed.room && !parsed.patientName) return false

  const turningCue = TURNING_CUE.test(t)
  const skinCue = SKIN_CUE.test(t)
  const bedridden = matchBedridden(t)

  if (turningCue && (skinCue || bedridden || /\blast\s+(?:turned|turn)\b/i.test(t))) return true
  if (bedridden && skinCue) return true
  if (bedridden && turningCue) return true
  return false
}

export function parseTurningMessage(text) {
  const base = parseVitalsMessage(text)
  const rednessSite = matchRednessSite(text)
  return {
    ...base,
    bedridden: matchBedridden(text) || base.mobility === 'Bedbound',
    redness: matchRedness(text) || Boolean(rednessSite),
    rednessSite,
    wound: /\bwound\b|\bulcer\b|\bpressure\s+sore\b/i.test(String(text ?? '')),
    lastTurnedAt: matchLastTurnedAt(text),
  }
}

export async function handleTurningNlp(bot, msg, nurseName) {
  const chatId = msg.chat.id
  const text = String(msg.text ?? '')

  if (!isTurningMessage(text)) return false

  console.log('[NLP] Turning assessment detected')
  log.info('[NLP] Turning assessment detected — text:', text.slice(0, 160))

  const turning = parseTurningMessage(text)
  const typedName = turning.patientName || ''
  let patientName = ''
  let room = turning.room || ''

  if (room) {
    try {
      patientName = (await getPatientByRoom(room)) || ''
    } catch (err) {
      log.warn('[Turning] Patient lookup error:', err?.message ?? String(err))
    }
  } else if (typedName) {
    try {
      const match = await resolvePatientRoomByName(typedName)
      if (match.status === 'found') {
        room = match.room
        patientName = match.patient
      } else if (match.status === 'ambiguous') {
        await safeSendMessage(
          bot,
          chatId,
          `Found more than one patient named "${typedName}". Please include the room number.`,
        )
        return true
      }
    } catch (err) {
      log.warn('[Turning] Name→room lookup error:', err?.message ?? String(err))
    }
  } else {
    await safeSendMessage(bot, chatId, 'Please include the patient name or room number for turning assessment.')
    return true
  }

  const resolvedPatient = patientName || typedName || ''

  let telegramReply = null
  try {
    const res = await fetch(`${NURSING_WEB}/api/ai/turning`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        room,
        patientName: resolvedPatient,
        mobility: turning.bedridden ? 'Bedbound' : turning.mobility ?? '',
        lastTurnedAt: turning.lastTurnedAt,
        skinCondition: turning.rednessSite ? `Redness at ${turning.rednessSite}` : '',
        redness: turning.redness,
        rednessSite: turning.rednessSite,
        wound: turning.wound,
        bedridden: turning.bedridden,
      }),
    })
    const payload = await res.json().catch(() => null)
    if (res.ok && payload?.ok && typeof payload.telegramReply === 'string') {
      telegramReply = payload.telegramReply
      if (payload.patientName) patientName = payload.patientName
      console.log(
        `[TurningBrain] risk=${payload.pressureSoreRisk} overdue=${payload.turningOverdue} room=${room}`,
      )
    } else {
      console.error('[Turning] API failed:', payload?.error ?? `HTTP ${res.status}`)
    }
  } catch (err) {
    console.error('[Turning] API error:', err?.message ?? err)
    log.error('[Turning] API error:', err?.message ?? String(err))
  }

  if (telegramReply) {
    await safeSendMessage(bot, chatId, telegramReply)
    return true
  }

  await safeSendMessage(bot, chatId, '⚠️ Could not assess turning risk. Please try again in a moment.')
  return true
}
