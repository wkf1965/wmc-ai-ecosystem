/**
 * Nursing Services NLP — natural-language chargeable-procedure capture for Telegram.
 *
 * Understands free-text messages (English / Malay / Chinese) like:
 *   "Ong Cheng Hua room 2 wound dressing done"
 *   "Ong Cheng Hua room 2 cuci luka RM30"
 *   "Fung Poh Chai room 2 tukar catheter"
 *   "Ali room 3 tukar tiub makan"
 *
 * Flow:
 *   detect service → resolve patient (room or name) → POST /api/nursing-services
 *   (applies configured rate, saves to store + Google Sheet + dashboard) → reply.
 *
 * Must run BEFORE the vitals NLP handler so a "wound dressing" message is billed
 * as a service rather than logged as a clinical observation.
 */

import { log } from '../utils/logger.js'
import { parseVitalsMessage } from './vitalsNlp.js'
import { getPatientByRoom, resolvePatientRoomByName } from './patientRoomService.js'
import { safeSendMessage } from '../utils/safeMessage.js'

const NURSING_WEB = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/**
 * Canonical chargeable services and their multilingual triggers.
 * Order matters: more specific procedures are tested before the broad
 * "dressing" trigger so "tukar tiub makan" isn't mis-read as a dressing.
 */
const SERVICE_LEXICON = [
  {
    id: 'feeding-tube-change',
    serviceName: 'Feeding tube change',
    latin: /\bfeeding\s*tube\b|\bryle'?s?\s*tube\b|\bng\s*tube\b|\bnasogastric\s*tube\b|\btukar\s*tiub\s*makan\b|\btukar\s*(?:feeding|ryle'?s?)\b|\bchange\s*ryle'?s?\b/i,
    cjk: /换食管|換食管|换胃管|換胃管|食管|鼻胃管/,
  },
  {
    id: 'catheter-change',
    serviceName: 'Urinary catheter change',
    latin: /\bcath?eter\b|\bfoley\b|\burinary\s*cath?eter\b|\btukar\s*cath?eter\b|\btukar\s*tiub\s*kencing\b|\bcbd\b/i,
    cjk: /换尿管|換尿管|换尿喉|換尿喉|尿管/,
  },
  {
    id: 'wound-dressing',
    serviceName: 'Wound dressing',
    latin: /\bwound\s*dressing\b|\bdressing\b|\bredressing\b|\bcuci\s*luka\b|\bwash\s*wound\b|\bbalut\s*luka\b|\bwound\s*care\b/i,
    cjk: /洗伤口|洗傷口|换药|換藥|敷料/,
  },
]

/**
 * Detect which chargeable nursing service (if any) a message refers to.
 * @param {string} text
 * @returns {{ id: string, serviceName: string } | null}
 */
export function detectNursingService(text) {
  const raw = String(text ?? '')
  const lower = raw.toLowerCase()
  for (const entry of SERVICE_LEXICON) {
    if (entry.latin.test(lower) || entry.cjk.test(raw)) {
      return { id: entry.id, serviceName: entry.serviceName }
    }
  }
  return null
}

/** Parse an explicit charge amount like "RM30" / "rm 30.50". */
function matchExplicitRate(text) {
  const m = /\brm\s*(\d{1,4}(?:\.\d{1,2})?)\b/i.exec(String(text ?? ''))
  return m ? Number(m[1]) : null
}

/** Parse an explicit quantity like "x2" / "2 times" / "qty 2". */
function matchQuantity(text) {
  const m = /\b(?:x\s*(\d{1,2})|qty\s*(\d{1,2})|(\d{1,2})\s*(?:times|kali|次))\b/i.exec(String(text ?? ''))
  if (!m) return 1
  const n = Number(m[1] || m[2] || m[3])
  return Number.isFinite(n) && n >= 1 && n <= 50 ? n : 1
}

/** True when the message looks like a chargeable nursing-service message. */
export function isNursingServiceMessage(text) {
  return detectNursingService(text) != null
}

/**
 * Handle a nursing-service NLP message: detect, resolve patient, save, reply.
 * Returns true when the message was handled (caller stops further routing).
 *
 * @param {import('node-telegram-bot-api')} bot
 * @param {import('node-telegram-bot-api').Message} msg
 * @param {string} nurseName
 * @returns {Promise<boolean>}
 */
export async function handleNursingServiceNlp(bot, msg, nurseName) {
  const chatId = msg.chat.id
  const text = String(msg.text ?? '')

  const service = detectNursingService(text)
  if (!service) return false

  console.log('[NLP] Nursing service detected:', service.serviceName)
  log.info(`[NLP] Nursing service detected — ${service.serviceName} — text: ${text.slice(0, 160)}`)

  // Reuse vitals parser for patient name + room extraction.
  const parsed = parseVitalsMessage(text)
  const typedName = parsed.patientName || ''
  let room = parsed.room || ''
  let patientName = ''

  if (room) {
    try {
      patientName = (await getPatientByRoom(room)) || ''
    } catch (err) {
      log.error('[Service] Patient lookup error:', err?.message ?? String(err))
    }
  } else if (typedName) {
    try {
      const match = await resolvePatientRoomByName(typedName)
      if (match.status === 'found') {
        room = match.room
        patientName = match.patient
        console.log(`[Service] Name→room lookup — "${typedName}" → room ${match.room} (${match.patient})`)
      } else if (match.status === 'ambiguous') {
        const rooms = match.matches.map((m) => m.room).join(', ')
        await safeSendMessage(
          bot,
          chatId,
          `Found more than one patient named "${typedName}" (rooms ${rooms}).\nPlease include the room number, e.g.\nRoom ${match.matches[0].room} ${text}`,
        )
        return true
      } else {
        console.log(`[Service] "${typedName}" not in roster — saving charge without room`)
      }
    } catch (err) {
      log.error('[Service] Name→room lookup error:', err?.message ?? String(err))
    }
  } else {
    await safeSendMessage(
      bot,
      chatId,
      'Please include the patient name or room number.\nExample: Ong Cheng Hua room 2 wound dressing',
    )
    return true
  }

  const resolvedPatient = patientName || typedName
  const explicitRate = matchExplicitRate(text)
  const quantity = matchQuantity(text)
  const recordedAt = new Date().toISOString()

  // ── Save via web API (applies configured rate + Google Sheet + dashboard) ──
  let record = null
  let savedOk = false
  let sheetSynced = false
  try {
    const body = {
      serviceId: service.id,
      patientName: resolvedPatient,
      room,
      nurseName,
      quantity,
      remarks: '',
      status: 'completed',
      source: 'telegram',
      recordedAt,
    }
    if (explicitRate != null && explicitRate > 0) body.unitRate = explicitRate

    const res = await fetch(`${NURSING_WEB}/api/nursing-services`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await res.json().catch(() => null)
    savedOk = Boolean(res.ok && payload?.ok)
    sheetSynced = Boolean(payload?.sheetSynced)
    record = payload?.data?.record ?? null
    if (savedOk) {
      console.log('[Service] Saved to database', sheetSynced ? '+ Google Sheet' : '')
      log.info(`[Service] Saved — ${service.serviceName} patient:${resolvedPatient} room:${room || 'n/a'}`)
    } else {
      console.error('[Service] Save failed:', payload?.error ?? `HTTP ${res.status}`)
      log.error('[Service] Save failed:', payload?.error ?? `HTTP ${res.status}`)
    }
  } catch (err) {
    console.error('[Service] Save request error:', err?.message ?? err)
    log.error('[Service] Save request error:', err?.message ?? String(err))
  }

  if (!savedOk || !record) {
    await safeSendMessage(bot, chatId, '⚠️ Could not save the nursing service charge. Please try again in a moment.')
    return true
  }

  const timeStr = new Date(recordedAt).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  const rm = (v) => `RM${(Number(v) || 0).toFixed(2)}`
  const displayPatient = record.patientName || resolvedPatient || (room ? `Room ${room}` : 'Unknown patient')

  const lines = [
    '✅ Nursing Service Charge Saved',
    '',
    `Patient: ${displayPatient}`,
    `Room: ${record.room || room || 'Not on roster'}`,
    `Service: ${record.serviceName}`,
    `Qty: ${record.quantity}`,
    `Rate: ${rm(record.unitRate)}`,
    `Total: ${rm(record.totalAmount)}`,
    `Recorded by: ${nurseName}`,
    `Time: ${timeStr}`,
    '',
    '💰 Added to patient billing.',
  ]

  await safeSendMessage(bot, chatId, lines.join('\n'))
  return true
}
