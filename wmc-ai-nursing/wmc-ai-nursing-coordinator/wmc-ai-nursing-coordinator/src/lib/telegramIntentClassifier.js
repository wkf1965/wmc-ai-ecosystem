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

const NURSING_KEYWORD_PATTERNS = [
  /\broom\b/i,
  /\bpatient\b/i,
  /\bpoor\s+appetite\b/i,
  /\bweak\b/i,
  /\bfever\b/i,
  /\bturned?\b/i,
  /\bbp\b/i,
  /\bblood\s+pressure\b/i,
  /\bpulse\b/i,
  /\bfall\b/i,
  /\bfell\b/i,
  /\bhandover\b/i,
  /\bappetite\b/i,
  /\bmobility\b/i,
  /\bvitals?\b/i,
  /\btemp(erature)?\b/i,
  /\bspo2\b/i,
  /\boxygen\b/i,
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

function extractPatientName(text, room) {
  let working = text
  if (room) {
    working = working.replace(new RegExp(`\\b(?:room|rm|bed)\\s*[#:]?\\s*${room}\\b`, 'i'), ' ')
  }

  const nameMatch = working.match(
    /\b(?:patient|pt|resident|mr|mrs|ms|encik|puan|cik)\.?\s+([A-Za-z][A-Za-z\s.'-]{0,30}?)(?=\s+(?:poor|weak|turned|turn|fell|fall|bp|pulse|fever|appetite|mobility)\b|\s*$)/i,
  )
  if (nameMatch) return nameMatch[1].trim()

  const tokens = working
    .replace(/\b(room|rm|turned|turn|left|right|side|poor|weak|appetite|mobility|vitals?|patient|fever|fall|fell|handover)\b/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)

  const capitalized = tokens.filter((t) => /^[A-Z][a-z]{1,}$/.test(t))
  if (capitalized.length >= 1) return capitalized[0]
  const plain = tokens.filter((t) => /^[a-z]{2,}$/i.test(t) && !/^\d+$/.test(t))
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

export function hasNursingKeywords(text) {
  return hasAnyPattern(String(text ?? ''), NURSING_KEYWORD_PATTERNS)
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
  if (!raw) return { category: 'unknown', room: null, patient_name: null, appetite: null, turning: null, risk: null }

  if (/^\/inventory\b/i.test(raw)) {
    return { category: 'inventory', room: null, patient_name: null, appetite: null, turning: null, risk: null }
  }

  const room = extractRoom(raw)
  const patient_name = extractPatientName(raw, room)
  const appetite = extractAppetite(raw)
  const turning = extractTurning(raw)

  const nursing = hasNursingKeywords(raw)
  const inventory = hasInventoryKeywords(raw)

  if (nursing && !inventory) {
    if (hasAnyPattern(raw, SIDE_TURNING_PATTERNS) || turning) {
      return { category: 'side_turning', room, patient_name, appetite, turning, risk: 'Low' }
    }
    if (hasAnyPattern(raw, VITAL_SIGNS_PATTERNS)) {
      return { category: 'vital_signs', room, patient_name, appetite, turning, risk: 'Medium' }
    }
    if (hasAnyPattern(raw, INCIDENT_PATTERNS)) {
      return { category: 'incident', room, patient_name, appetite, turning, risk: 'High' }
    }
    if (hasAnyPattern(raw, HANDOVER_PATTERNS)) {
      return { category: 'handover', room, patient_name, appetite, turning, risk: null }
    }
    if (hasAnyPattern(raw, OVERTIME_PATTERNS)) {
      return { category: 'overtime', room, patient_name, appetite, turning, risk: null }
    }
    if (hasAnyPattern(raw, MEDICATION_PATTERNS)) {
      return { category: 'medication', room, patient_name, appetite, turning, risk: 'Medium' }
    }
    const risk = appetite === 'poor' || appetite === 'refused' ? 'Medium' : 'Low'
    return { category: 'nursing_record', room, patient_name, appetite, turning, risk }
  }

  if (inventory && isClearInventoryMessage(raw)) {
    return { category: 'inventory', room, patient_name, appetite, turning, risk: null }
  }

  if (nursing) {
    const risk = appetite === 'poor' || appetite === 'refused' ? 'Medium' : 'Low'
    return { category: 'nursing_record', room, patient_name, appetite, turning, risk }
  }

  return { category: 'unknown', room, patient_name, appetite, turning, risk: null }
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
