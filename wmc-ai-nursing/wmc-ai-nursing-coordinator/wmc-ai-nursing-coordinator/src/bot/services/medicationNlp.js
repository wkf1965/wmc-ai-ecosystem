/**
 * Medication NLP — natural-language medication assessment for Telegram.
 *
 * Example:
 *   Room 201 Fung Poh Chai medication missed 8pm blood pressure tablet
 */

import { log } from '../utils/logger.js'
import { getPatientByRoom, resolvePatientRoomByName } from './patientRoomService.js'
import { safeSendMessage } from '../utils/safeMessage.js'
import { parseVitalsMessage } from './vitalsNlp.js'

const NURSING_WEB = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const MED_CUE = /\b(?:medication|medicine|med|tablet|tablets|capsule|pill|dose|mar)\b/i
const EVENT_CUE =
  /\b(?:missed|refused|vomited|not\s+given|delayed|allergic\s+reaction|rash|adverse\s+reaction|breathing\s+difficult)\b/i

function matchMedicationName(text) {
  const t = String(text ?? '')
  if (/\b(?:blood\s+pressure|bp)\s+(?:tablet|tab|pill|medication|med)\b/i.test(t)) return 'blood pressure tablet'
  const trailing = /\b([a-z]+(?:\s+[a-z]+){0,3})\s+(?:tablet|tab|capsule|pill)\b/i.exec(t)
  if (trailing) return `${trailing[1]} tablet`.trim()
  return null
}

function matchScheduledTime(text) {
  const t = String(text ?? '')
  const bare = /\b(\d{1,2}\s*(?:am|pm))\b/i.exec(t)
  if (bare) return bare[1].replace(/\s+/g, '')
  const atTime = /\b(?:at|@)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i.exec(t)
  if (atTime) return atTime[1].trim()
  return null
}

function matchStatus(text) {
  const t = String(text ?? '').toLowerCase()
  if (/\bmedication\s+missed\b|\bmissed\s+(?:medication|med|dose|tablet)\b|\bdose\s+missed\b/.test(t)) return 'missed'
  if (/\brefused\s+(?:medication|med|tablet|dose)\b|\bmedication\s+refused\b/.test(t)) return 'refused'
  if (/\bvomit(?:ed|ing)?\s+after\s+(?:medication|med|tablet)\b/.test(t)) return 'vomited'
  return null
}

/** True when message is a medication administration assessment. */
export function isMedicationMessage(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  const parsed = parseVitalsMessage(t)
  if (!parsed.room && !parsed.patientName) return false
  return MED_CUE.test(t) && EVENT_CUE.test(t)
}

export function parseMedicationMessage(text) {
  const base = parseVitalsMessage(text)
  const status = matchStatus(text)
  return {
    ...base,
    medicationName: matchMedicationName(text),
    scheduledTime: matchScheduledTime(text),
    status,
    refused: status === 'refused',
    vomited: status === 'vomited',
    reaction: /\ballergic\b|\brash\b|\bbreathing\s+difficult/i.test(String(text ?? '')) ? text : '',
  }
}

export async function handleMedicationNlp(bot, msg, nurseName) {
  const chatId = msg.chat.id
  const text = String(msg.text ?? '')

  if (!isMedicationMessage(text)) return false

  console.log('[NLP] Medication assessment detected')
  log.info('[NLP] Medication assessment detected — text:', text.slice(0, 160))

  const med = parseMedicationMessage(text)
  const typedName = med.patientName || ''
  let patientName = ''
  let room = med.room || ''

  if (room) {
    try {
      patientName = (await getPatientByRoom(room)) || ''
    } catch (err) {
      log.warn('[Medication] Patient lookup error:', err?.message ?? String(err))
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
      log.warn('[Medication] Name→room lookup error:', err?.message ?? String(err))
    }
  } else {
    await safeSendMessage(bot, chatId, 'Please include the patient name or room number for medication assessment.')
    return true
  }

  const resolvedPatient = patientName || typedName || ''
  let telegramReply = null

  try {
    const res = await fetch(`${NURSING_WEB}/api/ai/medication`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        room,
        patientName: resolvedPatient,
        medicationName: med.medicationName ?? '',
        scheduledTime: med.scheduledTime ?? '',
        status: med.status ?? '',
        refused: med.refused,
        vomited: med.vomited,
        reaction: med.reaction ?? '',
      }),
    })
    const payload = await res.json().catch(() => null)
    if (res.ok && payload?.ok && typeof payload.telegramReply === 'string') {
      telegramReply = payload.telegramReply
      console.log(
        `[MedicationBrain] risk=${payload.medicationRisk} missed=${payload.missedMedication} room=${room}`,
      )
    } else {
      console.error('[Medication] API failed:', payload?.error ?? `HTTP ${res.status}`)
    }
  } catch (err) {
    console.error('[Medication] API error:', err?.message ?? err)
    log.error('[Medication] API error:', err?.message ?? String(err))
  }

  if (telegramReply) {
    await safeSendMessage(bot, chatId, telegramReply)
    return true
  }

  await safeSendMessage(bot, chatId, '⚠️ Could not assess medication risk. Please try again in a moment.')
  return true
}
