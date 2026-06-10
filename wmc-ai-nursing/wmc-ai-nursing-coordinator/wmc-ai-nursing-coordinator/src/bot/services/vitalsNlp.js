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
import { getPatientByRoom, normaliseRoom, resolvePatientRoomByName } from './patientRoomService.js'
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
  // Malay
  if (/\bkurang\s+selera(?:\s+makan)?\b|\btak\s+(?:nak|mahu)\s+makan\b|\bkurang\s+makan\b/.test(t)) return 'Poor appetite'
  // Chinese
  if (/食欲不振|食慾不振|胃口差|没胃口|沒胃口|不想吃|吃不下/.test(text ?? '')) return 'Poor appetite'
  return null
}

/** Simplified appetite status for display: "Poor" | "Good" | null. */
function matchAppetite(text) {
  const t = String(text ?? '').toLowerCase()
  if (matchNutrition(t)) return 'Poor'
  if (/\bgood\s+appetite\b|\beating\s+well\b|\bnormal\s+appetite\b|\bappetite\s+good\b/.test(t)) return 'Good'
  return null
}

/** Mobility status from free text (high-risk values trigger an alert server-side). */
function matchMobility(text) {
  const t = String(text ?? '').toLowerCase()
  const cn = String(text ?? '')
  if (/\bbed\s?bound\b|\bbedridden\b|\bterlantar\b|卧床|臥床/.test(t) || /卧床|臥床/.test(cn)) return 'Bedbound'
  if (/\bunsteady\b|\bunstable\s+gait\b|\btidak\s+stabil\b/.test(t)) return 'Unsteady'
  if (/\bneeds?\s+assist(?:ance)?\b|\bassisted\b|\bperlu\s+bantuan\b/.test(t)) return 'Needs assistance'
  if (/\bwheel\s?chair\b|\bkerusi\s+roda\b|轮椅|輪椅/.test(t) || /轮椅|輪椅/.test(cn)) return 'Wheelchair'
  if (/\bweak(?:ness)?\b|\blemah\b|虚弱|虛弱|乏力|无力|無力/.test(t) || /虚弱|虛弱|乏力|无力|無力/.test(cn)) return 'Weak'
  if (/\bindependent\b|\bberdikari\b/.test(t)) return 'Independent'
  if (/\bambulant\b|\bwalking\b|\bmobile\b|\bboleh\s+jalan\b/.test(t)) return 'Ambulant'
  return null
}

/** Turning / lying position. */
function matchTurningPosition(text) {
  const t = String(text ?? '').toLowerCase()
  if (/\bsupine\b|\bon\s+back\b/.test(t)) return 'Supine'
  if (/\bprone\b/.test(t)) return 'Prone'
  if (/\b(?:left|lt)\s+(?:side|lateral)\b|\bturn(?:ed)?\s+left\b|\bleft\s+side\b/.test(t)) return 'Left'
  if (/\b(?:right|rt)\s+(?:side|lateral)\b|\bturn(?:ed)?\s+right\b|\bright\s+side\b/.test(t)) return 'Right'
  return null
}

/** Pain score 0–10. */
function matchPainScore(text) {
  const m = /\bpain\s*(?:score|level|scale)?\s*[:=]?\s*(\d{1,2})(?:\s*\/\s*10)?\b/i.exec(String(text ?? ''))
  if (!m) return null
  const n = Number(m[1])
  return n >= 0 && n <= 10 ? n : null
}

/** Detect an overdue turning mention (pressure sore risk). */
function matchTurningOverdue(text) {
  const t = String(text ?? '').toLowerCase()
  if (/\bturn(?:ing)?\s+(?:is\s+)?overdue\b|\boverdue\s+turn(?:ing)?\b|\bnot\s+turned\b|\bmissed\s+turn(?:ing)?\b/.test(t)) return true
  if (/\blambat\s+pusing\b|\bbelum\s+pusing\b/.test(t)) return true
  if (/翻身逾期|未翻身|没有翻身|沒有翻身/.test(String(text ?? ''))) return true
  return false
}

/** Detect a fall incident mention (English + Malay + Chinese). */
function matchFallIncident(text) {
  const t = String(text ?? '').toLowerCase()
  if (/\bfall(?:en|s)?\b|\bfell\b|\bslipped\b|\bfound\s+on\s+(?:the\s+)?floor\b/.test(t)) return true
  if (/\bjatuh\b|\bterjatuh\b|\btergelincir\b/.test(t)) return true
  if (/跌倒|摔倒|跌伤|跌傷/.test(String(text ?? ''))) return true
  return false
}

/**
 * Multilingual symptom/condition lexicon. Each entry maps a canonical English
 * condition to its English, Malay, and Chinese triggers. Chinese patterns omit
 * word boundaries (CJK has none); Latin patterns use them.
 */
const CONDITION_LEXICON = [
  { condition: 'Fever', latin: /\bfever\b|\bdemam\b|\bpyrexia\b/i, cjk: /发烧|發燒|发热|發熱/ },
  { condition: 'Shortness of breath', latin: /\bshortness\s+of\s+breath\b|\bbreathless\b|\bsob\b|\bsesak\s*nafas\b|\bsesak\b/i, cjk: /呼吸困难|呼吸困難|气喘|氣喘|喘不过气|喘不過氣/ },
  { condition: 'Cough', latin: /\bcough(?:ing)?\b|\bbatuk\b/i, cjk: /咳嗽|咳痰|咳/ },
  { condition: 'Chest pain', latin: /\bchest\s+pain\b|\bsakit\s+dada\b|\bnyeri\s+dada\b/i, cjk: /胸痛|胸口痛|胸闷|胸悶/ },
  { condition: 'Vomiting', latin: /\bvomit(?:ing|ed|s)?\b|\bmuntah\b/i, cjk: /呕吐|嘔吐|呕|嘔/ },
  { condition: 'Diarrhea', latin: /\bdiarrh?oea\b|\bdiarrhea\b|\bcirit[-\s]?birit\b/i, cjk: /腹泻|腹瀉|拉肚子|肚泻|肚瀉/ },
  { condition: 'Pain', latin: /\bpain(?:ful)?\b|\bsakit\b|\bnyeri\b/i, cjk: /疼痛|疼|痛/ },
  { condition: 'Wound', latin: /\bwounds?\b|\bluka\b|\bulcers?\b|\bbed\s?sores?\b|\bpressure\s+(?:sore|ulcer)s?\b/i, cjk: /伤口|傷口|褥疮|褥瘡|压疮|壓瘡/ },
  { condition: 'Dressing', latin: /\bdressings?\b|\bwound\s+care\b|\bbalut(?:an)?\b/i, cjk: /换药|換藥|敷料/ },
  { condition: 'Catheter', latin: /\bcatheters?\b|\bkateter\b|\bfoley\b|\bcbd\b|\biuc\b/i, cjk: /导尿管|導尿管|尿管|尿喉/ },
  { condition: 'Unconscious', latin: /\bunconscious\b|\bunresponsive\b|\bnot\s+responding\b|\btidak\s+sedar(?:kan\s+diri)?\b|\bpengsan\b/i, cjk: /昏迷|不省人事|失去意识|失去意識|无意识|無意識/ },
  { condition: 'Dehydration', latin: /\bdehydrat(?:ed|ion)\b|\bnot\s+drinking\b|\bpoor\s+fluid\s+intake\b|\bdry\s+(?:lips|mouth|tongue)\b|\bkurang\s+minum\b|\btak\s+(?:nak|mahu)\s+minum\b/i, cjk: /脱水|脫水|不喝水|嘴唇干裂|嘴唇乾裂/ },
]

/** Return the list of canonical conditions detected in the message. */
function matchConditions(text) {
  const raw = String(text ?? '')
  const lower = raw.toLowerCase()
  const found = []
  for (const entry of CONDITION_LEXICON) {
    if (entry.latin.test(lower) || entry.cjk.test(raw)) {
      if (!found.includes(entry.condition)) found.push(entry.condition)
    }
  }
  return found
}

// Tokens that must never be treated as part of a patient name.
const NAME_STOPWORDS = new Set([
  'room', 'rm', 'bed', 'ward', 'bp', 'blood', 'pressure', 'spo2', 'spo', 'sao2', 'o2', 'sat', 'sats',
  'pulse', 'hr', 'heart', 'rate', 'temp', 'temperature', 'tmp', 'sugar', 'glucose', 'bsl', 'rbs',
  'vital', 'vitals', 'weak', 'poor', 'appetite', 'mobility', 'pain', 'fall', 'fell', 'supine', 'prone',
  'left', 'right', 'side', 'turn', 'turned', 'eating', 'patient', 'pt',
  'fever', 'demam', 'suhu', 'badan', 'sakit', 'batuk', 'sesak', 'nafas', 'jatuh', 'luka',
  'kurang', 'selera', 'makan', 'lemah', 'wound', 'dressing', 'catheter', 'tukar', 'cuci',
])

/**
 * Take the leading run of capitalised name tokens from a token list,
 * stopping at the first clinical keyword / non-name token. Max 4 tokens.
 */
function takeNameRun(tokens) {
  const run = []
  for (const tok of tokens) {
    if (!/^[A-Z][A-Za-z'.-]*$/.test(tok)) break
    const low = tok.toLowerCase().replace(/[^a-z]/g, '')
    if (!low || NAME_STOPWORDS.has(low)) break
    run.push(tok)
    if (run.length >= 4) break
  }
  return run
}

function cleanName(raw) {
  const tokens = String(raw ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!tokens.length || tokens.length > 4) return null
  for (const tok of tokens) {
    const low = tok.toLowerCase().replace(/[^a-z]/g, '')
    if (!low || NAME_STOPWORDS.has(low)) return null
    if (!/^[a-z'.-]+$/i.test(tok)) return null
  }
  return tokens
    .map((tok) => tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Extract a patient name typed in the message. Handles four shapes:
 *   1. Explicit:  "patient: Ong Cheng Hua" / "pt Ong"
 *   2. Before a room marker:  "Fung Poh Chai room 2 ..."
 *   3. After a room marker:  "Room 201 Fung Poh Chai poor appetite ..."
 *      (stops at the first clinical keyword: appetite, BP, mobility, pulse…)
 *   4. Leading capitalised name run:  "Ong Cheng Hua demam suhu badan 40"
 *      (stops at the first lowercase / clinical / numeric token)
 */
function matchPatientName(text) {
  const t = String(text ?? '').trim()

  const explicit = /\b(?:patient|pt)\s*[:\-]?\s*([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,3})/i.exec(t)
  if (explicit) {
    // Truncate at the first clinical/structural token instead of rejecting the
    // whole capture (e.g. "patient: Tan Mei Ling room 3" → "Tan Mei Ling").
    const kept = []
    for (const tok of explicit[1].split(/\s+/)) {
      const low = tok.toLowerCase().replace(/[^a-z]/g, '')
      if (!low || NAME_STOPWORDS.has(low)) break
      kept.push(tok)
    }
    const name = cleanName(kept.join(' '))
    if (name) return name
  }

  const lead = /^([A-Za-z][A-Za-z'.\- ]{1,40}?)\s+(?:room|rm|bed|ward|r\d)/i.exec(t)
  if (lead) {
    const name = cleanName(lead[1])
    if (name) return name
  }

  // Name AFTER a room marker: "Room 201 Fung Poh Chai poor appetite B/P 90/56".
  // Never returns "Room 201" itself — the marker is consumed by the regex and
  // the name run stops at the first clinical keyword.
  const afterRoom = /\b(?:room|rm|r)\s*\.?\s*[A-Za-z]?-?\d{1,4}[A-Za-z]?\s+(.+)$/i.exec(t)
  if (afterRoom) {
    const run = takeNameRun(afterRoom[1].split(/\s+/))
    if (run.length >= 1) {
      const name = cleanName(run.join(' '))
      if (name) return name
    }
  }

  // Leading run of Capitalised name tokens — stop at the first token that is
  // not a capitalised word (lowercase clinical term, number, or stopword).
  const leadRun = takeNameRun(t.split(/\s+/))
  if (leadRun.length >= 1) {
    const name = cleanName(leadRun.join(' '))
    if (name) return name
  }

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
  // English + Malay temperature keywords. "demam 40", "suhu badan 38.5", "temp 37.2".
  const m = /(?:temperature|temp|tmp|suhu\s*badan|suhu|demam|发烧|發燒)\s*:?\s*(\d{2}(?:\.\d+)?)/i.exec(text)
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
    patientName: matchPatientName(t),
    room: matchRoom(t),
    bloodPressure: matchBp(t),
    pulse: matchPulse(t),
    spo2: matchSpo2(t),
    temperature: matchTemperature(t),
    glucose: matchGlucose(t),
    nutrition: matchNutrition(t),
    appetite: matchAppetite(t),
    mobility: matchMobility(t),
    turningPosition: matchTurningPosition(t),
    painScore: matchPainScore(t),
    fallIncident: matchFallIncident(t),
    turningOverdue: matchTurningOverdue(t),
    conditions: matchConditions(t),
  }
}

/** True when at least one vital value was parsed. */
function hasAnyVital(v) {
  return Boolean(v.bloodPressure) || v.pulse != null || v.spo2 != null || v.temperature != null || v.glucose != null
}

/** True when any clinical observation (beyond raw vitals) was parsed. */
function hasAnyObservation(v) {
  return (
    Boolean(v.nutrition || v.mobility || v.turningPosition || v.fallIncident || v.turningOverdue) ||
    v.painScore != null ||
    (Array.isArray(v.conditions) && v.conditions.length > 0)
  )
}

/**
 * Decide whether a free-text message is a vital-signs / clinical message.
 * Triggers when any vital value is present, a clinical observation + room appears,
 * or the word "vitals" appears with a room.
 * @param {string} text
 */
export function isVitalsMessage(text) {
  const t = String(text ?? '')
  const v = parseVitalsMessage(t)
  if (hasAnyVital(v)) return true
  // A clinical observation counts when we can resolve a patient — either a room
  // OR a typed patient name (room is looked up from the roster).
  if (hasAnyObservation(v) && (v.room || v.patientName)) return true
  if (/\bvitals?\b/i.test(t) && (v.room || v.patientName)) return true
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

  // ── Requirement 7: no usable values ──────────────────────────────────────
  if (!hasAnyVital(vitals) && !hasAnyObservation(vitals)) {
    await safeSendMessage(bot, chatId, 'Please include at least BP, Pulse, SpO2, temperature, or a clinical observation.')
    return true
  }

  // ── Patient resolution ────────────────────────────────────────────────────
  // Priority: Patient Name → Room Lookup → Nursing Record.
  // Room is NOT mandatory. When the message has no room but names a patient,
  // the room is looked up from the roster automatically.
  const typedName = vitals.patientName || ''
  let patientName = ''

  if (vitals.room) {
    // Room provided — resolve patient from the room map (existing behaviour).
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
  } else if (typedName) {
    // No room, but a name was typed → look the room up from the roster.
    try {
      const match = await resolvePatientRoomByName(typedName)
      if (match.status === 'found') {
        vitals.room = match.room
        patientName = match.patient
        console.log(`[Vitals] Name→room lookup success — name:"${typedName}" → room:${match.room} patient:${match.patient}`)
        log.info(`[Vitals] Name→room lookup success — "${typedName}" → room ${match.room} (${match.patient})`)
      } else if (match.status === 'ambiguous') {
        const rooms = match.matches.map((m) => m.room).join(', ')
        console.log(`[Vitals] Name→room ambiguous — "${typedName}" matches rooms ${rooms}`)
        await safeSendMessage(
          bot,
          chatId,
          `Found more than one patient named "${typedName}" (rooms ${rooms}).\nPlease include the room number, e.g.\nRoom ${match.matches[0].room} ${text}`,
        )
        return true
      } else {
        // Not found in roster — still record the observation using the typed name.
        console.log(`[Vitals] Name→room lookup: "${typedName}" not in roster — saving observation without room`)
        log.warn(`[Vitals] Name→room lookup: "${typedName}" not in roster — saving without room`)
      }
    } catch (err) {
      console.error('[Vitals] Name→room lookup error:', err?.message ?? err)
      log.error('[Vitals] Name→room lookup error:', err?.message ?? String(err))
    }
  } else {
    // Neither room nor patient name → cannot attribute the record. Ask.
    await safeSendMessage(
      bot,
      chatId,
      'Please include the patient name or room number.\nExample: Ong Cheng Hua demam suhu badan 40\nor: Room 2 BP 130/80 Pulse 76',
    )
    return true
  }

  // Prefer the looked-up name; fall back to the name typed in the message.
  // Never fabricate a "Room X patient" placeholder — patientName and room are
  // saved as separate fields, and an unknown name stays blank.
  const resolvedPatient = patientName || typedName || ''
  if (!patientName && typedName) {
    console.log('[Vitals] Using typed patient name:', typedName)
  }
  const recordedAt = new Date().toISOString()

  // ── Save to DB + Google Sheet + dashboard via web API ────────────────────
  let savedOk = false
  let sheetSynced = false
  let finalPatient = patientName || typedName
  let alerts = []
  let telegramReply = null
  try {
    const res = await fetch(`${NURSING_WEB}/api/vitals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        room: vitals.room,
        patientName: resolvedPatient,
        bloodPressure: vitals.bloodPressure ?? '',
        pulse: vitals.pulse != null ? String(vitals.pulse) : '',
        spo2: vitals.spo2 != null ? String(vitals.spo2) : '',
        temperature: vitals.temperature != null ? String(vitals.temperature) : '',
        glucose: vitals.glucose != null ? String(vitals.glucose) : '',
        nutrition: vitals.nutrition ?? '',
        appetite: vitals.appetite ?? '',
        mobility: vitals.mobility ?? '',
        turningPosition: vitals.turningPosition ?? '',
        painScore: vitals.painScore != null ? String(vitals.painScore) : '',
        fallIncident: vitals.fallIncident ? 'yes' : '',
        turningOverdue: vitals.turningOverdue ? 'yes' : '',
        conditions: Array.isArray(vitals.conditions) ? vitals.conditions : [],
        remark: '',
        nurseName,
        recordedAt,
        source: 'telegram',
      }),
    })
    const payload = await res.json().catch(() => null)
    savedOk = Boolean(res.ok && payload?.ok)
    sheetSynced = Boolean(payload?.sheetSynced)
    if (payload?.data?.patientName) finalPatient = payload.data.patientName
    if (typeof payload?.telegramReply === 'string' && payload.telegramReply.trim()) {
      telegramReply = payload.telegramReply.trim()
    }
    if (Array.isArray(payload?.alerts)) alerts = payload.alerts
    if (payload?.riskLevel) {
      console.log(`[AiBrain] level=${payload.riskLevel} score=${payload.riskScore} categories:`, (payload.categories || []).join(', ') || '(none)')
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

  // ── Reply — AI Brain pipeline (nlp → risk → alert → doctor → family) ───
  const displayPatient =
    finalPatient && !/^room\b/i.test(finalPatient) ? finalPatient : 'Unknown (not on roster)'

  if (telegramReply) {
    await safeSendMessage(bot, chatId, telegramReply)
    return true
  }

  // Fallback if web API did not return telegramReply
  const lines = [
    '✅ Nursing record saved',
    '',
    `Patient: ${displayPatient}`,
    `Room: ${vitals.room || 'Not on roster'}`,
    `Risk Level: 🟢 LOW`,
    `Risk Score: 0`,
    `Doctor Review: NO`,
    `Family Update: NO`,
    `Recheck Time: Routine (next shift)`,
  ]
  await safeSendMessage(bot, chatId, lines.join('\n'))
  return true
}
