/**
 * Telegram intent classifier — routes free-text between nursing NLP and inventory.
 * Nursing keywords always win over inventory when both are present.
 */

export const NURSING_CATEGORIES = new Set([
  'nursing_record',
  'side_turning',
  'vital_signs',
  'incident',
  'handover',
  'overtime',
  'medication',
])

/**
 * Multilingual nursing/clinical lexicon (English + Malay + common Chinese).
 * Each entry maps a human-readable keyword label (used in debug logs) to a
 * matcher pattern. Any match means the message is a nursing observation and
 * must route to a NURSING RECORD — never to the admission workflow.
 */
const NURSING_KEYWORD_LEXICON = [
  // ── Structure / identifiers ──────────────────────────────────────────────
  { kw: 'room', re: /\broom\b/i },
  { kw: 'patient', re: /\bpatient\b/i },
  { kw: 'mobility', re: /\bmobility\b/i },
  { kw: 'weak mobility', re: /\bweak\s+mobility\b/i },
  { kw: 'handover', re: /\bhandover\b/i },
  { kw: 'vitals', re: /\bvitals?\b/i },
  // ── Vital signs ──────────────────────────────────────────────────────────
  { kw: 'bp', re: /\bbp\b/i },
  { kw: 'blood pressure', re: /\bblood\s+pressure\b/i },
  { kw: 'pulse', re: /\bpulse\b/i },
  { kw: 'spo2', re: /\bspo2\b/i },
  { kw: 'oxygen', re: /\boxygen\b/i },
  { kw: 'temperature', re: /\btemp(erature)?\b/i },
  // ── Appetite ─────────────────────────────────────────────────────────────
  { kw: 'appetite', re: /\bappetite\b/i },
  { kw: 'poor appetite', re: /\bpoor\s+appetite\b/i },
  // ── Mobility / weakness ──────────────────────────────────────────────────
  { kw: 'weak', re: /\bweak\b/i },
  // ── Turning ──────────────────────────────────────────────────────────────
  { kw: 'turned', re: /\bturned?\b/i },
  // ── Incident ─────────────────────────────────────────────────────────────
  { kw: 'fall', re: /\bfall\b/i },
  { kw: 'fell', re: /\bfell\b/i },
  // ── Conditions (English) ─────────────────────────────────────────────────
  { kw: 'fever', re: /\bfever\b/i },
  // ── Malay (Bahasa Melayu) ────────────────────────────────────────────────
  { kw: 'demam (fever)', re: /\bdemam\b/i },
  { kw: 'suhu badan (temperature)', re: /\bsuhu(\s+badan)?\b/i },
  { kw: 'kurang selera (poor appetite)', re: /\bkurang\s+selera\b/i },
  { kw: 'selera (appetite)', re: /\bselera\b/i },
  { kw: 'tak makan (not eating)', re: /\b(tak|tidak|tdk)\s+(makan|mahu\s+makan)\b/i },
  { kw: 'lemah (weak)', re: /\blemah\b/i },
  { kw: 'jatuh (fall)', re: /\bjatuh\b/i },
  { kw: 'sesak nafas (breathless)', re: /\bsesak(\s+nafas)?\b/i },
  { kw: 'batuk (cough)', re: /\bbatuk\b/i },
  { kw: 'muntah (vomit)', re: /\bmuntah\b/i },
  { kw: 'cirit-birit (diarrhea)', re: /\bcirit(\s*-?\s*birit)?\b/i },
  { kw: 'nadi (pulse)', re: /\bnadi\b/i },
  { kw: 'tekanan darah (blood pressure)', re: /\btekanan\s+darah\b/i },
  // ── Chinese (常见症状) ───────────────────────────────────────────────────
  { kw: '发烧 (fever)', re: /发烧|發燒/ },
  { kw: '体温 (temperature)', re: /体温|體溫/ },
  { kw: '胃口差 (poor appetite)', re: /胃口差|没胃口|沒胃口|食欲不振/ },
  { kw: '虚弱 (weak)', re: /虚弱|虛弱|无力|無力/ },
  { kw: '跌倒 (fall)', re: /跌倒|摔倒/ },
  { kw: '血压 (blood pressure)', re: /血压|血壓/ },
  { kw: '脉搏 (pulse)', re: /脉搏|脈搏/ },
]

const NURSING_KEYWORD_PATTERNS = NURSING_KEYWORD_LEXICON.map((entry) => entry.re)

/**
 * Explicit admission triggers. Admission may ONLY start when one of these is
 * present. Nursing observation text (fever, BP, appetite, etc.) must never
 * open the admission workflow.
 */
const ADMISSION_KEYWORD_LEXICON = [
  { kw: 'new admission', re: /\bnew\s+admission\b/i },
  { kw: 'admit patient', re: /\badmit\s+(a\s+)?(new\s+)?patient\b/i },
  { kw: 'admit new', re: /\badmit\s+new\b/i },
  { kw: 'new resident', re: /\bnew\s+resident\b/i },
  { kw: 'registration', re: /\bregistration\b/i },
  { kw: 'register patient', re: /\bregister\s+(a\s+)?(new\s+)?patient\b/i },
  { kw: 'admission form', re: /\badmission\s+form\b/i },
  { kw: 'kemasukan baru (new admission)', re: /\bkemasukan\s+baru\b/i },
  { kw: 'pesakit baru (new patient)', re: /\bpesakit\s+baru\b/i },
  { kw: 'daftar pesakit (register patient)', re: /\bdaftar\s+pesakit\b/i },
]

const INVENTORY_KEYWORD_PATTERNS = [
  /\bmilk\s+powder\b/i,
  /\bpampers\b/i,
  /\bdiapers?\b/i,
  /\bwet\s+tissue\b/i,
  /\bwet\s+wipes?\b/i,
  /\bgloves?\b/i,
  /\bstock\b/i,
  /\bqty\b/i,
  /\bquantity\b/i,
  /\bused\b/i,
  /\btaken\b/i,
  /\bscoops?\b/i,
  /\bpacks?\b/i,
  /\bpieces?\b/i,
  /\bmilk\b/i,
  /\bwipes\b/i,
]

const SIDE_TURNING_PATTERNS = [
  /\bturned?\s+left\b/i,
  /\bleft\s+side\b/i,
  /\bturned?\s+right\b/i,
  /\bright\s+side\b/i,
  /\bsupine\b/i,
  /\bprone\b/i,
  /\bturn\s+done\b/i,
]

const VITAL_SIGNS_PATTERNS = [
  /\bbp\b/i,
  /\bblood\s+pressure\b/i,
  /\bpulse\b/i,
  /\btemp(erature)?\s*[:=]?\s*\d/i,
  /\bspo2\b/i,
  /\boxygen\b/i,
  /\b\d{2,3}\s*\/\s*\d{2,3}\b/,
]

const INCIDENT_PATTERNS = [/\bfall\b/i, /\bfell\b/i, /\bslip(ped)?\b/i, /\btrip(ped)?\b/i]

const HANDOVER_PATTERNS = [/\bhandover\b/i, /\bshift\s+report\b/i]

const OVERTIME_PATTERNS = [/\bovertime\b/i, /\bot\s+(in|out|payroll|report)\b/i, /\bpunch\s*(in|out)\b/i]

const MEDICATION_PATTERNS = [/\bmedication\b/i, /\bmedicine\b/i, /\bmed\b/i, /\bpill\b/i, /\bdose\b/i, /\bmar\b/i]

function extractRoom(text) {
  const m =
    text.match(/\b(?:room|rm|bed)\s*[#:]?\s*(\d+[a-z]?)\b/i)
    ?? text.match(/\b(\d+[a-z]?)\s*(?:room|rm)\b/i)
  return m ? m[1].toUpperCase() : null
}

// Clinical / structural words that can never be part of a patient name.
const NAME_STOP_TOKENS = new Set([
  'room', 'rm', 'bed', 'ward', 'bp', 'pulse', 'spo2', 'spo', 'temp', 'temperature', 'fever',
  'appetite', 'mobility', 'pain', 'poor', 'weak', 'fall', 'fell', 'turned', 'turn', 'left',
  'right', 'side', 'vital', 'vitals', 'patient', 'pt', 'handover', 'medication', 'medicine',
  'demam', 'suhu', 'badan', 'kurang', 'selera', 'makan', 'lemah', 'sakit', 'jatuh', 'batuk',
  'sesak', 'nafas', 'luka', 'wound', 'dressing', 'catheter', 'tukar', 'cuci',
])

function extractPatientName(text, room) {
  let working = text
  if (room) {
    working = working.replace(new RegExp(`\\b(?:room|rm|bed)\\s*[#:]?\\s*${room}\\b`, 'i'), ' ')
  }

  const nameMatch = working.match(
    /\b(?:patient|pt|resident|mr|mrs|ms|encik|puan|cik)\.?\s+([A-Za-z][A-Za-z\s.'-]{0,30}?)(?=\s+(?:poor|weak|turned|turn|fell|fall|bp|pulse|fever|appetite|mobility)\b|\s*$)/i,
  )
  if (nameMatch) return nameMatch[1].trim()

  // First consecutive run of capitalised tokens that are not clinical keywords.
  // "Room 201 Fung Poh Chai poor appetite ..." → room stripped above →
  // run = [Fung, Poh, Chai], stopping at "poor".
  const toks = working.split(/\s+/).filter(Boolean)
  const run = []
  for (const tok of toks) {
    const isNameToken = /^[A-Z][A-Za-z'-]*$/.test(tok) && !NAME_STOP_TOKENS.has(tok.toLowerCase())
    if (isNameToken) {
      run.push(tok)
      if (run.length >= 4) break
    } else if (run.length > 0) {
      break
    }
  }
  if (run.length >= 1) return run.join(' ')

  const tokens = working
    .replace(/\b(room|rm|turned|turn|left|right|side|poor|weak|appetite|mobility|vitals?|patient|fever|fall|fell|handover)\b/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const plain = tokens.filter(
    (t) => /^[a-z]{2,}$/i.test(t) && !/^\d+$/.test(t) && !NAME_STOP_TOKENS.has(t.toLowerCase()),
  )
  const stopNames = new Set(['today', 'yesterday', 'morning', 'evening', 'night', 'breakfast', 'lunch', 'dinner'])
  if (plain[0] && !stopNames.has(plain[0].toLowerCase())) {
    return plain[0].charAt(0).toUpperCase() + plain[0].slice(1).toLowerCase()
  }
  return null
}

function extractAppetite(text) {
  if (/\bpoor\s+appetite\b/i.test(text)) return 'poor'
  if (/\brefused\s+(food|meal|lunch|dinner|breakfast|tray)\b/i.test(text)) return 'refused'
  if (/\bgood\s+appetite\b/i.test(text)) return 'good'
  if (/\bfair\s+appetite\b/i.test(text)) return 'fair'
  return null
}

function extractTurning(text) {
  if (/\bturned?\s+left\b/i.test(text) || /\bleft\s+side\b/i.test(text)) return 'left'
  if (/\bturned?\s+right\b/i.test(text) || /\bright\s+side\b/i.test(text)) return 'right'
  if (/\bsupine\b/i.test(text)) return 'supine'
  if (/\bprone\b/i.test(text)) return 'prone'
  return null
}

function hasAnyPattern(text, patterns) {
  return patterns.some((p) => p.test(text))
}

/**
 * Generic structural words that appear in BOTH nursing notes and admission
 * requests (e.g. "admit patient Ali to room 5"). They are nursing keywords but
 * are NOT clinical observations, so they must not block the admission workflow.
 */
const GENERIC_STRUCTURAL_KEYWORDS = new Set(['room', 'patient'])

export function hasNursingKeywords(text) {
  return hasAnyPattern(String(text ?? ''), NURSING_KEYWORD_PATTERNS)
}

/**
 * Return the list of matched nursing keyword labels (for debug logging).
 * @param {string} text
 * @returns {string[]}
 */
export function matchedNursingKeywords(text) {
  const s = String(text ?? '')
  return NURSING_KEYWORD_LEXICON.filter((entry) => entry.re.test(s)).map((entry) => entry.kw)
}

/**
 * Matched clinical observation keywords (vitals, symptoms, conditions) —
 * excludes generic structural words like "room" / "patient". A non-empty
 * result means the message describes a clinical observation and must be a
 * NURSING RECORD, never an admission.
 * @param {string} text
 * @returns {string[]}
 */
export function matchedClinicalKeywords(text) {
  return matchedNursingKeywords(text).filter((kw) => !GENERIC_STRUCTURAL_KEYWORDS.has(kw))
}

/**
 * True when the text contains at least one clinical observation keyword.
 * @param {string} text
 */
export function hasClinicalObservation(text) {
  return matchedClinicalKeywords(text).length > 0
}

/**
 * True only when the message explicitly requests a new patient admission.
 * @param {string} text
 */
export function hasAdmissionKeywords(text) {
  return ADMISSION_KEYWORD_LEXICON.some((entry) => entry.re.test(String(text ?? '')))
}

/**
 * Return matched admission keyword labels (for debug logging).
 * @param {string} text
 * @returns {string[]}
 */
export function matchedAdmissionKeywords(text) {
  const s = String(text ?? '')
  return ADMISSION_KEYWORD_LEXICON.filter((entry) => entry.re.test(s)).map((entry) => entry.kw)
}

export function hasInventoryKeywords(text) {
  return hasAnyPattern(String(text ?? ''), INVENTORY_KEYWORD_PATTERNS)
}

/**
 * True when message clearly describes consumable usage (item + quantity).
 */
export function isClearInventoryMessage(text) {
  const t = String(text ?? '').trim()
  if (!t || t.startsWith('/')) return false
  if (hasNursingKeywords(t) && !hasInventoryKeywords(t)) return false

  const hasQty = /\b\d+\b/.test(t)
  if (!hasInventoryKeywords(t)) return false
  if (!hasQty && !/\b(stock|qty|used|taken)\b/i.test(t)) return false
  return true
}

/**
 * @param {string} text
 * @returns {{
 *   category: string,
 *   room: string|null,
 *   patient_name: string|null,
 *   appetite: string|null,
 *   turning: string|null,
 *   risk: string|null,
 * }}
 */
export function classifyTelegramIntent(text) {
  const raw = String(text ?? '').trim()
  if (!raw) {
    return { category: 'unknown', room: null, patient_name: null, appetite: null, turning: null, risk: null, matchedKeywords: [] }
  }

  if (/^\/inventory\b/i.test(raw)) {
    return { category: 'inventory', room: null, patient_name: null, appetite: null, turning: null, risk: null, matchedKeywords: ['/inventory'] }
  }

  const room = extractRoom(raw)
  const patient_name = extractPatientName(raw, room)
  const appetite = extractAppetite(raw)
  const turning = extractTurning(raw)

  const nursing = hasNursingKeywords(raw)
  const inventory = hasInventoryKeywords(raw)
  const admission = hasAdmissionKeywords(raw)
  const matchedKeywords = matchedNursingKeywords(raw)

  // Admission may ONLY win when the message has explicit admission keywords AND
  // contains no clinical observation (fever, BP, appetite, etc.). Generic words
  // like "room"/"patient" don't block admission; real clinical text always does.
  if (admission && !hasClinicalObservation(raw)) {
    return {
      category: 'admission',
      room,
      patient_name,
      appetite,
      turning,
      risk: null,
      matchedKeywords: matchedAdmissionKeywords(raw),
    }
  }

  if (nursing && !inventory) {
    if (hasAnyPattern(raw, SIDE_TURNING_PATTERNS) || turning) {
      return { category: 'side_turning', room, patient_name, appetite, turning, risk: 'Low', matchedKeywords }
    }
    if (hasAnyPattern(raw, VITAL_SIGNS_PATTERNS)) {
      return { category: 'vital_signs', room, patient_name, appetite, turning, risk: 'Medium', matchedKeywords }
    }
    if (hasAnyPattern(raw, INCIDENT_PATTERNS)) {
      return { category: 'incident', room, patient_name, appetite, turning, risk: 'High', matchedKeywords }
    }
    if (hasAnyPattern(raw, HANDOVER_PATTERNS)) {
      return { category: 'handover', room, patient_name, appetite, turning, risk: null, matchedKeywords }
    }
    if (hasAnyPattern(raw, OVERTIME_PATTERNS)) {
      return { category: 'overtime', room, patient_name, appetite, turning, risk: null, matchedKeywords }
    }
    if (hasAnyPattern(raw, MEDICATION_PATTERNS)) {
      return { category: 'medication', room, patient_name, appetite, turning, risk: 'Medium', matchedKeywords }
    }
    const risk = appetite === 'poor' || appetite === 'refused' ? 'Medium' : 'Low'
    return { category: 'nursing_record', room, patient_name, appetite, turning, risk, matchedKeywords }
  }

  if (inventory && isClearInventoryMessage(raw)) {
    return { category: 'inventory', room, patient_name, appetite, turning, risk: null, matchedKeywords: [] }
  }

  if (nursing) {
    const risk = appetite === 'poor' || appetite === 'refused' ? 'Medium' : 'Low'
    return { category: 'nursing_record', room, patient_name, appetite, turning, risk, matchedKeywords }
  }

  return { category: 'unknown', room, patient_name, appetite, turning, risk: null, matchedKeywords }
}

export function isNursingIntentCategory(category) {
  return NURSING_CATEGORIES.has(category)
}

/**
 * @param {ReturnType<typeof classifyTelegramIntent>} intent
 * @param {string} text
 * @returns {'high'|'medium'|'low'}
 */
export function computeNlpConfidence(intent, text) {
  let score = 0
  if (intent.room) score += 35
  if (intent.patient_name) score += 35
  if (intent.category !== 'unknown') score += 10
  if (intent.appetite || intent.turning) score += 10
  if (hasNursingKeywords(text)) score += 10
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}
