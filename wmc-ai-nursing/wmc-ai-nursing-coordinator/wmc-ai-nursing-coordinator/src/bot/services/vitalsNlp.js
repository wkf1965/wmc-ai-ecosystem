/**
 * Vital Signs NLP — natural-language vital signs capture for Telegram.
 *
 * Understands free-text messages like:
 *   "Room 201 BP 130/80 Pulse 76 Spo2 98"
 *   "R201 BP 120/70 P 80 SpO2 97"
 *   "Room 5 temperature 37.2 pulse 88 spo2 96"
 *   "Room 201 sugar 7.8 bp 130/80"
 *
 * Flow:
 *   parse → lookup patient by room → POST /api/vitals (DB + Google Sheet + dashboard) → reply
 */

import { log } from '../utils/logger.js'
import { getPatientByRoom, normaliseRoom } from './patientRoomService.js'
import { safeSendMessage } from '../utils/safeMessage.js'

const NURSING_WEB = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export const VITALS_FORMAT_HINT =
  'Type like this:\nRoom 201 BP 130/80 Pulse 76 SpO2 98'

// ── Field extractors ──────────────────────────────────────────────────────────

function matchRoom(text) {
  // "Room 201", "Rm 5", "R201", "room A201"
  const m = /\b(?:room|rm|r)\s*\.?\s*([A-Za-z]?-?\d{1,4}[A-Za-z]?)\b/i.exec(text)
  return m ? normaliseRoom(m[1]) : null
}

function matchBp(text) {
  const labelled = /\b(?:b\/?p|blood\s*pressure)\s*:?\s*(\d{2,3})\s*\/\s*(\d{2,3})\b/i.exec(text)
  if (labelled) return `${labelled[1]}/${labelled[2]}`
  // Bare BP like "140/89" (no label). Require systolic 80–260 to avoid noise (e.g. dates).
  const bare = /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/.exec(text)
  if (bare) {
    const sys = Number(bare[1])
    if (sys >= 60 && sys <= 300) return `${bare[1]}/${bare[2]}`
  }
  return null
}

function matchNutrition(text) {
  const t = String(text ?? '').toLowerCase()
  if (/\bpoor\s+appetite\b/.test(t)) return 'Poor appetite'
  if (/\bnot\s+eating\b/.test(t)) return 'Not eating'
  if (/\brefus(?:e|ed|ing)\s+(?:food|meal|to\s+eat)\b/.test(t)) return 'Refusing food'
  if (/\breduced\s+(?:intake|appetite|oral\s+intake)\b/.test(t)) return 'Reduced intake'
  if (/\bpoor\s+(?:oral\s+)?intake\b/.test(t)) return 'Poor intake'
  return null
}

function matchPulse(text) {
  // "Pulse 76", "P 80", "HR 80" — bare "p" only when standalone (won't match the p in "bp"/"spo2")
  const m = /\b(?:pulse|heart\s*rate|hr|p)\s*:?\s*(\d{2,3})\b/i.exec(text)
  return m ? Number(m[1]) : null
}

function matchSpo2(text) {
  const m = /\b(?:spo2|spo|sao2|o2\s*sat|sats?)\s*:?\s*(\d{2,3})\b/i.exec(text)
  return m ? Number(m[1]) : null
}

function matchTemperature(text) {
  const m = /\b(?:temperature|temp|tmp)\s*:?\s*(\d{2}(?:\.\d+)?)\b/i.exec(text)
  return m ? Number(m[1]) : null
}

function matchGlucose(text) {
  const m = /\b(?:glucose|sugar|blood\s*sugar|bsl|rbs|dxt|dextrostix)\s*:?\s*(\d{1,2}(?:\.\d+)?)\b/i.exec(text)
  return m ? Number(m[1]) : null
}

/**
 * Parse a free-text message into vital-sign fields.
 * @param {string} text
 * @returns {{ room: string|null, bloodPressure: string|null, pulse: number|null,
 *             spo2: number|null, temperature: number|null, glucose: number|null }}
 */
export function parseVitalsMessage(text) {
  const t = String(text ?? '')
  return {
    room: matchRoom(t),
    bloodPressure: matchBp(t),
    pulse: matchPulse(t),
    spo2: matchSpo2(t),
    temperature: matchTemperature(t),
    glucose: matchGlucose(t),
    nutrition: matchNutrition(t),
  }
}

/** True when at least one vital value was parsed. */
function hasAnyVital(v) {
  return Boolean(v.bloodPressure) || v.pulse != null || v.spo2 != null || v.temperature != null || v.glucose != null
}

/**
 * Decide whether a free-text message is a vital-signs / clinical message.
 * Triggers when any vital value is present, a nutrition concern + room appears,
 * or the word "vitals" appears with a room.
 * @param {string} text
 */
export function isVitalsMessage(text) {
  const t = String(text ?? '')
  const v = parseVitalsMessage(t)
  if (hasAnyVital(v)) return true
  if (v.nutrition && v.room) return true
  if (/\bvitals?\b/i.test(t) && v.room) return true
  return false
}

// ── Handler ─────────────────────────────────────────────────────────────────

/**
 * Handle a vital-signs NLP message: parse, lookup patient, save, reply.
 * Returns true when the message was handled (so the caller stops further routing).
 *
 * @param {import('node-telegram-bot-api')} bot
 * @param {import('node-telegram-bot-api').Message} msg
 * @param {string} nurseName
 * @returns {Promise<boolean>}
 */
export async function handleVitalsNlp(bot, msg, nurseName) {
  const chatId = msg.chat.id
  const text = String(msg.text ?? '')

  if (!isVitalsMessage(text)) return false

  console.log('[NLP] Vital signs detected')
  log.info('[NLP] Vital signs detected — text:', text.slice(0, 160))

  const vitals = parseVitalsMessage(text)

  // ── Requirement 6: room missing ──────────────────────────────────────────
  if (!vitals.room) {
    await safeSendMessage(
      bot,
      chatId,
      'Please include room number. Example: Room 201 BP 130/80 Pulse 76 SpO2 98',
    )
    return true
  }

  // ── Requirement 7: no usable values ──────────────────────────────────────
  if (!hasAnyVital(vitals) && !vitals.nutrition) {
    await safeSendMessage(bot, chatId, 'Please include at least BP, Pulse, or SpO2.')
    return true
  }

  // ── Patient lookup by room ───────────────────────────────────────────────
  let patientName = ''
  try {
    patientName = (await getPatientByRoom(vitals.room)) || ''
    if (patientName) {
      console.log('[Vitals] Patient lookup success')
      log.info(`[Vitals] Patient lookup success — room:${vitals.room} patient:${patientName}`)
    } else {
      console.log('[Vitals] Patient lookup: no match for room', vitals.room)
      log.warn(`[Vitals] Patient lookup: no match for room ${vitals.room}`)
    }
  } catch (err) {
    console.error('[Vitals] Patient lookup error:', err?.message ?? err)
    log.error('[Vitals] Patient lookup error:', err?.message ?? String(err))
  }
  const resolvedPatient = patientName || `Room ${vitals.room} patient`
  const recordedAt = new Date().toISOString()

  // ── Save to DB + Google Sheet + dashboard via web API ────────────────────
  let savedOk = false
  let sheetSynced = false
  let finalPatient = patientName // authoritative name resolved server-side
  let alerts = [] // [{ alertType, severity, detail }]
  try {
    const res = await fetch(`${NURSING_WEB}/api/vitals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        room: vitals.room,
        patientName: resolvedPatient,
        bloodPressure: vitals.bloodPressure ?? '',
        pulse: vitals.pulse != null ? String(vitals.pulse) : '',
        spo2: vitals.spo2 != null ? String(vitals.spo2) : '',
        temperature: vitals.temperature != null ? String(vitals.temperature) : '',
        glucose: vitals.glucose != null ? String(vitals.glucose) : '',
        nutrition: vitals.nutrition ?? '',
        remark: vitals.nutrition ?? '',
        nurseName,
        recordedAt,
        source: 'telegram',
      }),
    })
    const payload = await res.json().catch(() => null)
    savedOk = Boolean(res.ok && payload?.ok)
    sheetSynced = Boolean(payload?.sheetSynced)
    if (payload?.data?.patientName) finalPatient = payload.data.patientName
    if (Array.isArray(payload?.alerts)) alerts = payload.alerts
    if (alerts.length > 0) {
      console.log(`[ClinicalAlert] ${alerts.length} alert(s):`, alerts.map((a) => a.alertType).join(', '))
    }
    if (savedOk) {
      console.log('[Vitals] Saved to database')
      log.info(`[Vitals] Saved to database — room:${vitals.room} patient:${resolvedPatient}`)
      if (sheetSynced) {
        console.log('[Vitals] Saved to Google Sheet')
        log.info('[Vitals] Saved to Google Sheet')
      } else {
        console.warn('[Vitals] Google Sheet sync skipped/failed')
      }
    } else {
      console.error('[Vitals] Save failed:', payload?.error ?? `HTTP ${res.status}`)
      log.error('[Vitals] Save failed:', payload?.error ?? `HTTP ${res.status}`)
    }
  } catch (err) {
    console.error('[Vitals] Save request error:', err?.message ?? err)
    log.error('[Vitals] Save request error:', err?.message ?? String(err))
  }

  if (!savedOk) {
    await safeSendMessage(
      bot,
      chatId,
      '⚠️ Could not save vital signs. Please try again in a moment.',
    )
    return true
  }

  // ── Reply ────────────────────────────────────────────────────────────────
  const timeStr = new Date(recordedAt).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  const displayPatient = finalPatient || `Room ${vitals.room}`

  const lines = [
    '✅ Vital signs saved',
    '',
    `Patient: ${displayPatient}`,
    `Room: ${vitals.room}`,
  ]
  if (vitals.bloodPressure) lines.push(`BP: ${vitals.bloodPressure}`)
  if (vitals.pulse != null) lines.push(`Pulse: ${vitals.pulse}`)
  if (vitals.spo2 != null) lines.push(`SpO2: ${vitals.spo2}`)
  if (vitals.temperature != null) lines.push(`Temperature: ${vitals.temperature}`)
  if (vitals.glucose != null) lines.push(`Glucose: ${vitals.glucose}`)
  if (vitals.nutrition) lines.push(`Nutrition: ${vitals.nutrition}`)
  lines.push(`Recorded by: ${nurseName}`, `Time: ${timeStr}`)

  // ── Clinical alerts ───────────────────────────────────────────────────────
  const alertBlock = buildAlertBlock(alerts, displayPatient, vitals.room)
  if (alertBlock) {
    lines.push('', alertBlock)
  }

  await safeSendMessage(bot, chatId, lines.join('\n'))
  return true
}

/**
 * Build a human-readable Telegram alert block from detected clinical alerts.
 * @param {Array<{alertType:string, severity:string, detail:string}>} alerts
 * @param {string} patient
 * @param {string} room
 * @returns {string} empty string when no alerts
 */
function buildAlertBlock(alerts, patient, room) {
  if (!Array.isArray(alerts) || alerts.length === 0) return ''
  const critical = alerts.filter((a) => a.severity === 'CRITICAL')
  const others = alerts.filter((a) => a.severity !== 'CRITICAL')
  const out = []

  for (const a of critical) {
    if (a.alertType === 'Low Oxygen') {
      out.push(
        '⚠️ LOW OXYGEN ALERT',
        `Patient: ${patient}`,
        `Room: ${room}`,
        a.detail,
        'Immediate assessment required.',
      )
    } else {
      out.push(`⚠️ CRITICAL ALERT: ${a.alertType}`, `${a.detail}`, 'Immediate assessment required.')
    }
  }

  for (const a of others) {
    const icon = a.severity === 'HIGH' ? '🔴' : '🟡'
    out.push(`${icon} ${a.alertType} (${a.severity}) — ${a.detail}`)
  }

  return out.join('\n')
}
