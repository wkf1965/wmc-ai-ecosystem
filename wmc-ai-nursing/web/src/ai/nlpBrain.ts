/**
 * NLP Brain — parse free-text nursing / vital messages into structured fields.
 */

export type NlpBrainInput = {
  text: string
}

export type NlpBrainResult = {
  text: string
  room: string | null
  patientName: string | null
  bloodPressure: string | null
  pulse: number | null
  spo2: number | null
  temperature: number | null
  nutrition: string | null
  mobility: string | null
  conditions: string[]
}

function matchRoom(text: string): string | null {
  const m = /\b(?:room|rm|r)\s*\.?\s*([A-Za-z]?-?\d{1,4}[A-Za-z]?)\b/i.exec(text)
  return m ? m[1] : null
}

function matchBp(text: string): string | null {
  const labelled = /\b(?:b\/?p|blood\s*pressure)\s*:?\s*(\d{2,3})\s*\/\s*(\d{2,3})\b/i.exec(text)
  if (labelled) return `${labelled[1]}/${labelled[2]}`
  const bare = /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/.exec(text)
  if (bare && Number(bare[1]) >= 60 && Number(bare[1]) <= 300) return `${bare[1]}/${bare[2]}`
  return null
}

function matchNumber(text: string, pattern: RegExp): number | null {
  const m = pattern.exec(text)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function matchNutrition(text: string): string | null {
  const t = text.toLowerCase()
  if (/\bpoor\s+appetite\b/.test(t)) return "Poor appetite"
  if (/\bnot\s+eating\b/.test(t)) return "Not eating"
  if (/\brefus(?:e|ed|ing)\s+(?:food|meal|to\s+eat)\b/.test(t)) return "Refusing food"
  return null
}

function matchMobility(text: string): string | null {
  const t = text.toLowerCase()
  if (/\bweak(?:ness)?(?:\s+mobility)?\b/.test(t) || /虚弱|虛弱|乏力/.test(text)) return "Weak"
  return null
}

function matchConditions(text: string): string[] {
  const found: string[] = []
  const lower = text.toLowerCase()
  if (/\bchest\s+pain\b|\bsakit\s+dada\b/i.test(lower) || /胸痛|胸口痛/.test(text)) found.push("Chest pain")
  if (/\bshortness\s+of\s+breath\b|\bdifficult(?:y)?\s+breathing\b|\bsesak\b/i.test(lower) || /呼吸困难|呼吸困難/.test(text)) {
    found.push("Shortness of breath")
  }
  if (/\bunconscious\b|\bunresponsive\b|\bpengsan\b/i.test(lower) || /昏迷|不省人事/.test(text)) found.push("Unconscious")
  if (/\bfever\b|\bdemam\b/i.test(lower) || /发烧|發燒/.test(text)) found.push("Fever")
  return found
}

/** Parse a nursing message into structured clinical fields. */
export function runNlpBrain(input: NlpBrainInput): NlpBrainResult {
  const text = String(input.text ?? "").trim()
  return {
    text,
    room: matchRoom(text),
    patientName: null,
    bloodPressure: matchBp(text),
    pulse: matchNumber(text, /\b(?:pulse|heart\s*rate|hr|p)\s*:?\s*(\d{2,3})\b/i),
    spo2: matchNumber(text, /\b(?:spo2|spo|sao2|o2\s*sat|sats?)\s*:?\s*(\d{2,3})\b/i),
    temperature: matchNumber(text, /(?:temperature|temp|tmp|suhu|demam)\s*:?\s*(\d{2}(?:\.\d+)?)/i),
    nutrition: matchNutrition(text),
    mobility: matchMobility(text),
    conditions: matchConditions(text),
  }
}
