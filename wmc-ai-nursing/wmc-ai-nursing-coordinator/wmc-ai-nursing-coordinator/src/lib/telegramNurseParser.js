/**
 * Parse free-text Telegram-style nurse messages (simulation).
 * Example: "Room 12: Patient refused lunch, confused, weak mobility"
 */

/** Priority order for ties — later keys win equal scores (more acute loops). */
const LOOP_KEYS = /** @type {const} */ ([
  'rehabilitation',
  'hydration',
  'nutrition',
  'medication',
  'mental_health',
  'infection',
  'fall_risk',
  'doctor_review',
])

/** Weighted cues → suggested loop category (requirement #2). */
const LOOP_SIGNALS = [
  {
    key: 'doctor_review',
    weight: 16,
    patterns: [
      /\bunresponsive\b/i,
      /\bcode\s*blue\b/i,
      /\bchest\s+pain\b/i,
      /\bstroke\b/i,
      /\bsevere\s+bleed/i,
      /\b911\b/i,
      /\bambulance\b/i,
      /\bcannot\s+breathe\b/i,
      /\baspirat/i,
      /\b(md|physician|doctor)\s+(called|notified|paged)/i,
      /\burgent\s+provider/i,
      /\brapid\s+response/i,
    ],
  },
  {
    key: 'infection',
    weight: 11,
    patterns: [
      /\bfever\b/i,
      /\b38\.?\d*\s*°?c/i,
      /\buti\b/i,
      /\bcough\b/i,
      /\bproductive\s+cough/i,
      /\bspo2\b/i,
      /\boxygen\b/i,
      /\bisolate\b/i,
      /\bantibiotic/i,
      /\bsepsis\b/i,
      /\bwound\s+infection/i,
      /\bpurulent/i,
    ],
  },
  {
    key: 'fall_risk',
    weight: 10,
    patterns: [
      /\bfell\b/i,
      /\bfall\b/i,
      /\bslip(ped)?\b/i,
      /\btrip(ped)?\b/i,
      /\bbathroom\b/i,
      /\bweak\s+mobility\b/i,
      /\bunsteady\b/i,
      /\bnear\s+fall\b/i,
      /\b(syncope|dizzy)\b/i,
    ],
  },
  {
    key: 'medication',
    weight: 9,
    patterns: [/\brefused\s+med/i, /\bmedication\b/i, /\bmar\b/i, /\bpill\b/i, /\bdose\b/i, /\bheld\s+med/i],
  },
  {
    key: 'nutrition',
    weight: 8,
    patterns: [
      /\blunch\b/i,
      /\bmeal\b/i,
      /\bappetite\b/i,
      /\bfood\b/i,
      /\brefused\s+(the\s+)?tray/i,
      /\bnpo\b/i,
      /\bpoor\s+intake\b/i,
    ],
  },
  {
    key: 'mental_health',
    weight: 9,
    patterns: [
      /\bconfus/i,
      /\bagitat/i,
      /\banxious\b/i,
      /\bdisorient/i,
      /\bhallucin/i,
      /\bsundown/i,
      /\bdepress/i,
    ],
  },
  {
    key: 'hydration',
    weight: 8,
    patterns: [
      /\burine\b/i,
      /\bdark\s+urine\b/i,
      /\bdehydrat/i,
      /\bdry\s+mouth\b/i,
      /\bfluid\b/i,
      /\bpo\s+intake\b/i,
      /\blow\s+void/i,
    ],
  },
  {
    key: 'rehabilitation',
    weight: 9,
    patterns: [
      /\bpt\b/i,
      /\bot\b/i,
      /\brehab\b/i,
      /\btherapy\b/i,
      /\bambulation\b/i,
      /\bmobil/i,
      /\bgait\b/i,
      /\bdeclin/i,
      /\bplateau\b/i,
      /\bfunctional\s+decline/i,
    ],
  },
]

const RISK_KEYWORD_BANK = [
  { kw: 'Fall / mobility', re: /\bfell\b|\bfall\b|\bweak\s+mobility\b|\bunsteady\b|\bbathroom\b/i },
  { kw: 'Confusion / cognition', re: /\bconfus|\bdisorient|\bagitat/i },
  { kw: 'Refusal / intake', re: /\brefused\b|\bpoor\s+appetite\b|\bminimal\s+intake\b/i },
  { kw: 'Hydration / urine', re: /\bdark\s+urine\b|\bdehydrat|\burine\b/i },
  { kw: 'Medication', re: /\bmedication\b|\bmar\b|\bpill\b|\brefused\s+med/i },
  { kw: 'Wound / skin', re: /\bwound\b|\bredness\b|\bdrainage\b|\bskin\b/i },
  { kw: 'Pain', re: /\bpain\b|\bach(e|ing)\b/i },
  { kw: 'Respiratory / SpO2', re: /\bsob\b|\bshortness\b|\bo2\b|\boxygen\b|\bwheeze\b|\bspo2\b/i },
  { kw: 'Infection', re: /\bfever\b|\buti\b|\bcough\b|\bsepsis\b|\bisolation\b/i },
  { kw: 'Rehab / mobility', re: /\brehab\b|\bpt\b|\bot\b|\btherapy\b|\bdeclin/i },
  { kw: 'Doctor review', re: /\b(md|doctor|physician)\b|\burgent\b|\bstroke\b|\bchest\s+pain\b|\bcode\b/i },
]

export function normalizeRoomToken(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

/**
 * Normalize inbound Telegram text before room extraction (BOM, exotic spaces, fullwidth digits).
 */
export function normalizeTelegramTextForRoomParse(text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .normalize('NFKC')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48))
    .trim()
}

/** Tokens that must never be treated as a room id after “room/bed/ward …”. */
const FALSE_ROOM_TOKENS = new Set([
  'patient',
  'name',
  'names',
  'status',
  'update',
  'report',
  'note',
  'notes',
  'care',
  'the',
  'and',
  'for',
  'with',
  'poor',
  'appetite',
  'weak',
  'mobility',
  'number',
  'num',
  'no',
])

/**
 * Room ids in this product line almost always contain a digit (filters “room patient …”).
 */
function isPlausibleRoomToken(raw) {
  const s = String(raw || '').trim()
  if (!s || s.length > 14) return false
  const lower = s.toLowerCase()
  if (FALSE_ROOM_TOKENS.has(lower)) return false
  return /\d/.test(s)
}

/**
 * Scan **entire** message (not line-anchored) for room / bed / ward / rm patterns.
 *
 * Supports anywhere in text: Room 5 patient Ali, Patient Ali room 5, Ali room 5, rm5, rm 5,
 * room: 5, Room #5, bed 5, ward 12, glued room5 / bed3, etc.
 */
export function extractRoomFromMessage(text) {
  const t = normalizeTelegramTextForRoomParse(text)
  if (!t) return null

  const ROOM_CHUNK = '([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)'
  const GLUED_DIGITS = '(\\d+[A-Za-z0-9]*)'

  /** @type {{ re: RegExp, priority: number }[]} */
  const patterns = [
    {
      re: /\bpatient\b[^\n\r]{0,200}?\broom\s*[#:]?\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)\b/gi,
      priority: 102,
    },
    {
      re: /\bpatient\b[^\n\r]{0,200}?\brm\.?\s*[#:]?\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)\b/gi,
      priority: 101,
    },
    { re: new RegExp(`\\b(?:room|bed|ward)\\s*[#:]?\\s*${ROOM_CHUNK}\\b`, 'gi'), priority: 100 },
    { re: new RegExp(`\\b(?:room|bed|ward)${GLUED_DIGITS}\\b`, 'gi'), priority: 99 },
    { re: new RegExp(`\\brm\\.?\\s*[#:]?\\s*${ROOM_CHUNK}\\b`, 'gi'), priority: 98 },
    { re: /\brm\.?(\d+)\b/gi, priority: 97 },
    { re: new RegExp(`\\b#\\s*${ROOM_CHUNK}\\b`, 'gi'), priority: 75 },
  ]

  /** @type {{ token: string, index: number, priority: number }[]} */
  const hits = []

  for (const { re, priority } of patterns) {
    const flags = re.global ? re.flags : `${re.flags}g`
    const rx = new RegExp(re.source, flags)
    let m
    while ((m = rx.exec(t)) !== null) {
      const raw = m[1] != null ? String(m[1]).trim() : ''
      if (!raw || !isPlausibleRoomToken(raw)) continue
      hits.push({
        token: normalizeRoomDisplay(raw),
        index: m.index,
        priority,
      })
    }
  }

  if (hits.length === 0) return null

  hits.sort((a, b) => a.index - b.index || b.priority - a.priority)
  return hits[0].token
}

function normalizeRoomDisplay(token) {
  const x = String(token).trim()
  if (/^\d+$/.test(x)) return x
  return x.toUpperCase()
}

function patientRoomTokenFromRow(p) {
  const r = p?.room ?? p?.Room ?? p?.roomNumber ?? ''
  return r ? normalizeRoomToken(r) : ''
}

/**
 * Resolve roster patient id by **sheet/normalized room only** (no demo room map).
 */
export function resolvePatientIdFromRoom(roomDisplay, patients = []) {
  if (!roomDisplay) return null
  const norm = normalizeRoomToken(roomDisplay)
  const list = Array.isArray(patients) ? patients : []
  for (const p of list) {
    const pid = String(p?.id ?? '').trim()
    const pr = patientRoomTokenFromRow(p)
    if (pid && pr && pr === norm) return pid
  }
  return null
}

/** Leading token after "patient …" that is clearly not a person's name */
const NOT_PERSON_FIRST = new Set([
  'refused',
  'declined',
  'reports',
  'states',
  'complains',
  'has',
  'had',
  'is',
  'was',
  'will',
  'needs',
  'denies',
  'with',
  'the',
  'a',
  'an',
  'and',
  'for',
  'no',
  'not',
  'poor',
  'appetite',
  'minimal',
  'unable',
  'name',
])

function normalizePatientNameExtract(raw) {
  if (!raw) return null
  let s = String(raw)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,.;]+$/g, '')
    .trim()
  if (s.length < 2) return null
  return s
}

/** Words / stems that end a name block or cannot be name tokens (must stay aligned). */
const NAME_BOUNDARY_ALTS =
  'fell|fall(?:ing|en)?|down|fever|fevers|temp(?:erature)?|refused|denies|reports|states|complains|complaining|cough|coughing|confused|confusion|pain|aches?|nausea|vomit(?:ing)?|diarrhoea|diarrhea|bleed(?:ing)?|sob|shortness|wheeze|dizzy|dizziness|weak(?:ness)?|weak|mobility|unsteady|syncope|slipped|tripped|sepsis|uti|o2|oxygen|spo2|bp|hr|pulse|isolate|isolation|wound|redness|poor|appetite|minimal|unable|intake|meal|meals|tray|fluid|hydration|nutrition|eating|hunger'

/** Name capture ends before punctuation/EOL or before these clinical / narrative tokens */
const CLINICAL_AFTER_NAME_PATTERN = NAME_BOUNDARY_ALTS

function buildPatientNameTailLookahead() {
  return `(?=\\s*[,.;]|\\s*$|\\n|\\s+(?:${CLINICAL_AFTER_NAME_PATTERN})\\b)`
}

/** One given/family token; must not be a standalone clinical token */
const NAME_TOKEN = `(?!(?:${NAME_BOUNDARY_ALTS})\\b)[A-Za-z\u00C0-\u024F](?:[A-Za-z\u00C0-\u024F]|['.\\-])*`

/** Up to 5 name tokens; spaces only between words (avoids eating "… fell"). */
const PATIENT_NAME_WORDS = `${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,4}`

/**
 * "Room 6 lee si ming fell …" — name tokens immediately after room, before clinical wording.
 */
function extractImplicitNameAfterRoom(fullText, roomToken) {
  if (!roomToken) return null
  let rest = stripLeadingRoomClause(fullText, roomToken).trim()
  if (!rest) return null
  if (/^(?:patient\s+name|name\s+is|name\s+|patient\s+)/i.test(rest)) return null

  const boundary = CLINICAL_AFTER_NAME_PATTERN
  const re = new RegExp(`^(${PATIENT_NAME_WORDS})\\s+(?:${boundary})\\b`, 'iu')
  const m = rest.match(re)
  if (!m?.[1]) return null
  const n = normalizePatientNameExtract(m[1])
  const first = n?.split(/\s+/)[0]?.toLowerCase()
  if (!n || !first || NOT_PERSON_FIRST.has(first)) return null
  if (first === 'pt' || first === 'rm') return null
  return n
}

/**
 * Optional resident name: explicit phrases ("patient name …", "name …") or implicit after Room N ("lee si ming fell").
 */
export function extractPatientNameGuess(text) {
  const t = String(text || '')
  const tailLa = buildPatientNameTailLookahead()

  let m = t.match(
    new RegExp(`\\bpatient\\s+name\\s+(${PATIENT_NAME_WORDS})${tailLa}`, 'iu'),
  )
  if (m?.[1]) {
    const n = normalizePatientNameExtract(m[1])
    if (n) return n
  }

  m = t.match(new RegExp(`\\bname\\s+is\\s+(${PATIENT_NAME_WORDS})${tailLa}`, 'iu'))
  if (m?.[1]) {
    const n = normalizePatientNameExtract(m[1])
    if (n) return n
  }

  m = t.match(new RegExp(`\\bname\\s+(${PATIENT_NAME_WORDS})${tailLa}`, 'iu'))
  if (m?.[1]) {
    const n = normalizePatientNameExtract(m[1])
    const first = n?.split(/\s+/)[0]?.toLowerCase()
    if (n && first && !NOT_PERSON_FIRST.has(first)) return n
  }

  m = t.match(new RegExp(`\\bpatient\\s+(${PATIENT_NAME_WORDS})${tailLa}`, 'iu'))
  if (m?.[1]) {
    const n = normalizePatientNameExtract(m[1])
    const first = n?.split(/\s+/)[0]?.toLowerCase()
    if (n && first && !NOT_PERSON_FIRST.has(first)) return n
  }

  const legacy =
    t.match(
      new RegExp(`\\b(?:patient|pt\\.?|resident)\\s*[-:]?\\s*(${PATIENT_NAME_WORDS})${tailLa}`, 'iu'),
    ) || t.match(new RegExp(`\\b(?:named)\\s+(${PATIENT_NAME_WORDS})${tailLa}`, 'iu'))
  if (legacy?.[1]) {
    const n = normalizePatientNameExtract(legacy[1])
    const first = n?.split(/\s+/)[0]?.toLowerCase()
    if (n && first && !NOT_PERSON_FIRST.has(first)) return n
  }

  const room = extractRoomFromMessage(t)
  return extractImplicitNameAfterRoom(t, room)
}

function stripLeadingRoomClause(text, roomToken) {
  let rest = String(text || '').trim()
  rest = rest
    .replace(
      /^(?:(?:room|bed|ward)\s*[#:]?\s*|rm\.?\s*[#:]?\s*|rm\.?(?=[A-Za-z0-9]))[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?\s*[-–—:]?\s*/i,
      '',
    )
    .trim()
  if (roomToken) {
    const esc = roomToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    rest = rest.replace(new RegExp(`^${esc}\\s*[-–—:]?\\s*`, 'i'), '').trim()
  }
  return rest || String(text || '').trim()
}

function scoreLoopCategories(bodyLower) {
  const scores = {}
  for (const k of LOOP_KEYS) scores[k] = 0
  for (const { key, weight, patterns } of LOOP_SIGNALS) {
    for (const re of patterns) {
      if (re.test(bodyLower)) scores[key] += weight
    }
  }
  let best = LOOP_KEYS[0]
  let max = scores[best]
  for (const k of LOOP_KEYS) {
    if (scores[k] >= max) {
      max = scores[k]
      best = k
    }
  }
  if (max === 0) best = 'mental_health'
  return { primary: best, scores, max }
}

export function extractRiskKeywords(text) {
  const out = []
  const body = String(text || '')
  for (const { kw, re } of RISK_KEYWORD_BANK) {
    if (re.test(body)) out.push(kw)
  }
  return [...new Set(out)]
}

export function loopCategoryLabel(key) {
  const map = {
    nutrition: 'Nutrition',
    hydration: 'Hydration',
    medication: 'Medication',
    fall_risk: 'Fall risk',
    mental_health: 'Mental health',
    rehabilitation: 'Rehabilitation',
    infection: 'Infection',
    doctor_review: 'Doctor review',
  }
  return map[key] || key
}

/**
 * Human-readable category line for Telegram replies — combines strong secondary loops (e.g. "Nutrition + Rehabilitation").
 */
export function workflowCategoryDisplay(parsed) {
  const scores = parsed.loopScores || {}
  let ranked = LOOP_KEYS.map((key) => ({
    key,
    score: Number(scores[key]) || 0,
    label: loopCategoryLabel(key),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))

  const origMax = ranked[0]?.score ?? 0
  const fr = ranked.find((x) => x.key === 'fall_risk')
  const nu = ranked.find((x) => x.key === 'nutrition')
  const rb = ranked.find((x) => x.key === 'rehabilitation')
  // Weak mobility often scores both fall_risk and rehabilitation; prefer intake + rehab wording when appropriate.
  if (fr && nu && rb && fr.score <= rb.score + 2 && nu.score >= origMax * 0.7) {
    ranked = ranked.filter((x) => x.key !== 'fall_risk')
  }

  if (!ranked.length) return parsed.loopCategoryLabel || 'General'

  const max = ranked[0].score
  const threshold = Math.max(max * 0.55, max - 5)
  let picked = ranked.filter((x) => x.score >= threshold).slice(0, 3)

  if (picked.length === 1) return picked[0].label

  picked = [...picked].sort((a, b) => a.label.localeCompare(b.label))
  return picked.map((x) => x.label).join(' + ')
}

/**
 * Full parse result for UI + webhook.
 */
export function parseTelegramNurseMessage(rawText) {
  const original = String(rawText || '').trim()
  const patientRoom = extractRoomFromMessage(original)
  const patientNameGuess = extractPatientNameGuess(original)
  const bodyAfterRoom = stripLeadingRoomClause(original, patientRoom || '')
  const nursingNoteText = bodyAfterRoom || original

  const bodyLower = nursingNoteText.toLowerCase()
  const { primary: suggestedLoopCategory, scores: loopScores } = scoreLoopCategories(
    `${original.toLowerCase()} ${bodyLower}`,
  )

  const riskKeywords = extractRiskKeywords(original)

  if (typeof console !== 'undefined' && typeof console.log === 'function') {
    console.log('[telegram room-parse] original text =', original)
    console.log('[telegram room-parse] detected room =', patientRoom ?? '(none)')
  }

  return {
    originalText: original,
    patientRoom,
    patientNameGuess,
    nursingNoteText,
    riskKeywords,
    suggestedLoopCategory,
    loopScores,
    loopCategoryLabel: loopCategoryLabel(suggestedLoopCategory),
  }
}

export function generateAiNursingNoteDraft(parse, patientNameResolved) {
  const who = patientNameResolved
    ? patientNameResolved
    : parse.patientRoom
      ? `Room ${parse.patientRoom} — verify identity against roster before naming in documentation`
      : 'Identity pending roster verification — do not assign a resident name from free text alone'
  const flags = parse.riskKeywords.length ? parse.riskKeywords.join('; ') : 'No keyword flags matched'
  return (
    `[AI draft — Telegram simulation]\n` +
    `Subject: ${who}\n` +
    `Reported: ${parse.nursingNoteText}\n` +
    `Suggested focus: ${parse.loopCategoryLabel}\n` +
    `Risk cues: ${flags}\n` +
    `Verify at bedside; amend before signing official documentation.`
  )
}
