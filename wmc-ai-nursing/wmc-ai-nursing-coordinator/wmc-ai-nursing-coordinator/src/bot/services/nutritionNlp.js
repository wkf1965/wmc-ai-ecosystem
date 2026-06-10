/**
 * Nutrition NLP — natural-language nutrition / dehydration assessment for Telegram.
 *
 * Example:
 *   Room 201 Fung Poh Chai poor appetite ate 20% low fluid weak
 */

import { log } from '../utils/logger.js'
import { getPatientByRoom, resolvePatientRoomByName } from './patientRoomService.js'
import { safeSendMessage } from '../utils/safeMessage.js'
import { parseVitalsMessage } from './vitalsNlp.js'

const NURSING_WEB = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const NUTRITION_CUE =
  /\b(?:poor\s+appetite|reduced\s+(?:intake|appetite)|not\s+eating|refus(?:ing|ed)\s+food|ate(?:n|s)?\s+\d+|meal\s+intake|low\s+fluid|fluid\s+intake|dehydrat|vomit|diarrh|dry\s+mouth|weight\s+loss|no\s+urine|urine\s+output)\b/i

function matchAppetite(text) {
  const t = String(text ?? '')
  if (/\bpoor\s+appetite\b/i.test(t)) return 'poor appetite'
  if (/\breduced\s+(?:intake|appetite|oral\s+intake)\b/i.test(t)) return 'reduced appetite'
  if (/\bnot\s+eating\b|\brefus(?:ing|ed)\s+food\b/i.test(t)) return 'poor appetite'
  return null
}

function matchMealPercentage(text) {
  const t = String(text ?? '')
  const ate =
    /\bate(?:n|s)?\s+(\d+(?:\.\d+)?)\s*%/i.exec(t) ||
    /\b(?:meal|food)\s+intake\s+(\d+(?:\.\d+)?)\s*%/i.exec(t) ||
    /\b(\d+(?:\.\d+)?)\s*%\s*(?:meal|food|intake|eaten|ate)\b/i.exec(t)
  if (ate) return Number(ate[1])
  return null
}

function matchFluidIntake(text) {
  const t = String(text ?? '')
  if (/\blow\s+fluid(?:\s+intake)?\b/i.test(t)) return 'low'
  if (/\bpoor\s+fluid(?:\s+intake)?\b|\bdehydrat(?:ed|ion)\b/i.test(t)) return 'low'
  return null
}

function matchUrineOutput(text) {
  const t = String(text ?? '')
  if (/\b(?:no|nil|zero)\s+(?:urine|void|urination|output)\b/i.test(t)) {
    const m = /\b(?:no|nil|zero)\s+(?:urine|void|urination|output)(?:\s+\d+\s*h(?:ours?|rs?)?)?\b/i.exec(t)
    return m ? m[0] : 'no urine'
  }
  return null
}

/** True when message is a nutrition / intake assessment. */
export function isNutritionMessage(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  const parsed = parseVitalsMessage(t)
  if (!parsed.room && !parsed.patientName) return false
  return NUTRITION_CUE.test(t)
}

export function parseNutritionMessage(text) {
  const base = parseVitalsMessage(text)
  return {
    ...base,
    appetite: matchAppetite(text) ?? base.appetite ?? '',
    mealPercentage: matchMealPercentage(text),
    fluidIntake: matchFluidIntake(text) ?? '',
    urineOutput: matchUrineOutput(text) ?? '',
    weightLoss: /\bweight\s+loss\b|\blosing\s+weight\b/i.test(String(text ?? '')),
    vomiting: /\bvomit(?:ed|ing)?\b/i.test(String(text ?? '')),
    diarrhea: /\bdiarrh(?:ea|oea)\b/i.test(String(text ?? '')),
    dryMouth: /\bdry\s+mouth\b/i.test(String(text ?? '')),
    weakness: /\bweak(?:ness)?\b/i.test(String(text ?? '')),
  }
}

export async function handleNutritionNlp(bot, msg, nurseName) {
  const chatId = msg.chat.id
  const text = String(msg.text ?? '')

  if (!isNutritionMessage(text)) return false

  console.log('[NLP] Nutrition assessment detected')
  log.info('[NLP] Nutrition assessment detected — text:', text.slice(0, 160))

  const nutrition = parseNutritionMessage(text)
  const typedName = nutrition.patientName || ''
  let patientName = ''
  let room = nutrition.room || ''

  if (room) {
    try {
      patientName = (await getPatientByRoom(room)) || ''
    } catch (err) {
      log.warn('[Nutrition] Patient lookup error:', err?.message ?? String(err))
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
      log.warn('[Nutrition] Name→room lookup error:', err?.message ?? String(err))
    }
  } else {
    await safeSendMessage(bot, chatId, 'Please include the patient name or room number for nutrition assessment.')
    return true
  }

  const resolvedPatient = patientName || typedName || ''
  let telegramReply = null

  try {
    const res = await fetch(`${NURSING_WEB}/api/ai/nutrition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        room,
        patientName: resolvedPatient,
        appetite: nutrition.appetite ?? '',
        mealPercentage: nutrition.mealPercentage ?? '',
        fluidIntake: nutrition.fluidIntake ?? '',
        urineOutput: nutrition.urineOutput ?? '',
        weightLoss: nutrition.weightLoss,
        vomiting: nutrition.vomiting,
        diarrhea: nutrition.diarrhea,
        dryMouth: nutrition.dryMouth,
        weakness: nutrition.weakness,
      }),
    })
    const payload = await res.json().catch(() => null)
    if (res.ok && payload?.ok && typeof payload.telegramReply === 'string') {
      telegramReply = payload.telegramReply
      console.log(
        `[NutritionBrain] nutrition=${payload.nutritionRisk} dehydration=${payload.dehydrationRisk} room=${room}`,
      )
    } else {
      console.error('[Nutrition] API failed:', payload?.error ?? `HTTP ${res.status}`)
    }
  } catch (err) {
    console.error('[Nutrition] API error:', err?.message ?? err)
    log.error('[Nutrition] API error:', err?.message ?? String(err))
  }

  if (telegramReply) {
    await safeSendMessage(bot, chatId, telegramReply)
    return true
  }

  await safeSendMessage(bot, chatId, '⚠️ Could not assess nutrition risk. Please try again in a moment.')
  return true
}
