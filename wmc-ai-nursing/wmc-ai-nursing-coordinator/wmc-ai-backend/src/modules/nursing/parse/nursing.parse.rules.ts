import type { ParsedNursingFields } from './nursing.parse.types.js'

function extractRoom(text: string): string | null {
  const m =
    text.match(/\b(?:room|rm|bed)\s*[#:]?\s*(\d+[a-z]?)\b/i)
    ?? text.match(/\b(\d+[a-z]?)\s*(?:room|rm)\b/i)
  return m ? m[1].toUpperCase() : null
}

function extractPatientName(text: string, room: string | null): string | null {
  let working = text
  if (room) {
    working = working.replace(new RegExp(`\\b(?:room|rm|bed)\\s*[#:]?\\s*${room}\\b`, 'i'), ' ')
  }
  const nameMatch = working.match(
    /\b(?:patient|pt|resident|mr|mrs|ms|encik|puan|cik)\.?\s+([A-Za-z][A-Za-z\s.'-]{1,40})/i,
  )
  if (nameMatch) return nameMatch[1].trim()

  const tokens = working
    .replace(/\b(room|rm|turned|left|right|side|poor|weak|appetite|mobility|vitals?)\b/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const capitalized = tokens.filter((t) => /^[A-Z][a-z]{2,}$/.test(t))
  if (capitalized.length >= 2) return `${capitalized[0]} ${capitalized[1]}`
  if (capitalized.length === 1) return capitalized[0]
  return null
}

function extractTurning(text: string): string | null {
  if (/\bturned?\s+left\b/i.test(text) || /\bleft\s+side\b/i.test(text)) return 'Left'
  if (/\bturned?\s+right\b/i.test(text) || /\bright\s+side\b/i.test(text)) return 'Right'
  if (/\bsupine\b/i.test(text)) return 'Supine'
  if (/\bprone\b/i.test(text)) return 'Prone'
  return null
}

function extractAppetite(text: string): string | null {
  if (/\bpoor\s+appetite\b/i.test(text)) return 'Poor'
  if (/\brefused\s+(food|meal|lunch|dinner|breakfast|tray)\b/i.test(text)) return 'Refused'
  if (/\bgood\s+appetite\b/i.test(text)) return 'Good'
  if (/\bfair\s+appetite\b/i.test(text)) return 'Fair'
  if (/\bappetite\b/i.test(text)) return 'Noted'
  return null
}

function extractMobility(text: string): string | null {
  if (/\bweak\s+mobility\b/i.test(text)) return 'Weak — needs assistance'
  if (/\bbedbound\b/i.test(text)) return 'Bedbound'
  if (/\bwheelchair\b/i.test(text)) return 'Wheelchair'
  if (/\bassist(?:ed|ance)\b/i.test(text)) return 'Needs assistance'
  if (/\bmobility\b/i.test(text)) return 'Noted'
  return null
}

function extractVitals(text: string) {
  const bp = text.match(/\b(\d{2,3}\s*\/\s*\d{2,3})\b/)
  const pulse = text.match(/\bpulse\s*[:=]?\s*(\d{2,3})\b/i)
  const temp = text.match(/\b(?:temp|temperature)\s*[:=]?\s*(\d{2}(?:\.\d)?)\b/i)
  const oxygen = text.match(/\b(?:o2|spo2|oxygen)\s*[:=]?\s*(\d{2,3})\b/i)
  return {
    bloodPressure: bp ? bp[1].replace(/\s+/g, '') : null,
    pulse: pulse ? Number(pulse[1]) : null,
    temperature: temp ? Number(temp[1]) : null,
    oxygen: oxygen ? Number(oxygen[1]) : null,
    painScore: null,
  }
}

function extractSymptoms(text: string): string[] {
  const found = new Set<string>()
  const patterns: Array<[RegExp, string]> = [
    [/\bconfus(ed|ion)\b/i, 'Confusion'],
    [/\bcough\b/i, 'Cough'],
    [/\bfever\b/i, 'Fever'],
    [/\bpain\b/i, 'Pain'],
    [/\bnausea\b/i, 'Nausea'],
    [/\bvomit/i, 'Vomiting'],
    [/\bdizzy\b/i, 'Dizziness'],
    [/\bshortness\s+of\s+breath\b/i, 'Shortness of breath'],
    [/\bweakness\b/i, 'Weakness'],
  ]
  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) found.add(label)
  }
  return [...found]
}

/** Rule-based NLP fallback — no external API required. */
export function parseNursingTextWithRules(text: string): ParsedNursingFields {
  const room = extractRoom(text)
  const patientName = extractPatientName(text, room)
  return {
    room,
    patientName,
    appetite: extractAppetite(text),
    mobility: extractMobility(text),
    turningPosition: extractTurning(text),
    vitals: extractVitals(text),
    symptoms: extractSymptoms(text),
    notes: text.trim(),
  }
}
