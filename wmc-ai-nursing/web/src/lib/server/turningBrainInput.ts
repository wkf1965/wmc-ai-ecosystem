/**
 * Parse free-text turning / pressure-sore messages into Turning Brain input.
 */

import type { TurningBrainInput } from "../../ai/turningBrain"

const BODY_SITES = [
  "sacrum",
  "heel",
  "heels",
  "elbow",
  "hip",
  "trochanter",
  "shoulder",
  "back",
  "buttock",
  "coccyx",
  "ankle",
]

function matchRoom(text: string): string | null {
  const m = /\b(?:room|rm|r)\s*\.?\s*([A-Za-z]?-?\d{1,4}[A-Za-z]?)\b/i.exec(text)
  return m ? m[1] : null
}

const NAME_STOPWORDS = new Set([
  "bedridden",
  "bedbound",
  "bed",
  "bound",
  "last",
  "turned",
  "turn",
  "redness",
  "red",
  "sacrum",
  "heel",
  "wound",
  "weak",
  "poor",
  "appetite",
  "hours",
  "hour",
  "ago",
  "overdue",
])

function takeNameTokens(tokens: string[]): string[] {
  const run: string[] = []
  for (const tok of tokens) {
    const low = tok.toLowerCase().replace(/[^a-z]/g, "")
    if (!low || NAME_STOPWORDS.has(low)) break
    if (!/^[A-Za-z][A-Za-z'.-]*$/.test(tok)) break
    run.push(tok)
    if (run.length >= 4) break
  }
  return run
}

function matchPatientAfterRoom(text: string): string | null {
  const afterRoom = /\b(?:room|rm|r)\s*\.?\s*[A-Za-z]?-?\d{1,4}[A-Za-z]?\s+(.+)$/i.exec(text)
  if (!afterRoom) return null
  const run = takeNameTokens(afterRoom[1].split(/\s+/))
  if (!run.length) return null
  return run.map((tok) => tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase()).join(" ")
}

function matchBedridden(text: string): boolean {
  return /\bbed\s?ridden\b|\bbedridden\b|\bbed\s?bound\b|\bterlantar\b|卧床|臥床/i.test(text)
}

function matchRedness(text: string): boolean {
  return /\bredness\b|\berythema\b|\bpressure\s+mark\b|发红|發紅/i.test(text)
}

function matchRednessSite(text: string): string | null {
  const direct =
    /\bredness\s+(?:at|on)\s+([a-z]+)\b/i.exec(text) ||
    /\b([a-z]+)\s+redness\b/i.exec(text) ||
    /\bredness\s+([a-z]+)\b/i.exec(text)
  if (direct) {
    const site = direct[1].toLowerCase()
    if (BODY_SITES.includes(site)) return site === "heels" ? "heel" : site
  }
  for (const site of BODY_SITES) {
    if (new RegExp(`\\b${site}\\b`, "i").test(text) && matchRedness(text)) {
      return site === "heels" ? "heel" : site
    }
  }
  return null
}

function matchWound(text: string): boolean {
  return /\bwound\b|\bulcer\b|\bpressure\s+sore\b|\bbroken\s+skin\b|伤口|傷口|褥疮|褥瘡/i.test(text)
}

/** Parse "last turned 3 hours ago" → ISO timestamp relative to now. */
export function parseLastTurnedAtFromText(text: string, now = new Date()): string | null {
  const hoursAgo =
    /\b(?:last\s+(?:turned|turn)|turned)\s+(?:about\s+)?(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)\s+ago\b/i.exec(text) ||
    /\b(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)\s+since\s+(?:last\s+)?turn/i.exec(text)
  if (hoursAgo) {
    const ms = Number(hoursAgo[1]) * 60 * 60 * 1000
    return new Date(now.getTime() - ms).toISOString()
  }

  const minutesAgo = /\b(?:last\s+(?:turned|turn)|turned)\s+(?:about\s+)?(\d+)\s*m(?:in(?:ute)?s?)?\s+ago\b/i.exec(text)
  if (minutesAgo) {
    const ms = Number(minutesAgo[1]) * 60 * 1000
    return new Date(now.getTime() - ms).toISOString()
  }

  return null
}

export function isTurningAssessmentText(text: string): boolean {
  const t = String(text ?? "").trim()
  if (!t) return false
  const hasPatientContext = matchRoom(t) !== null || matchPatientAfterRoom(t) !== null
  if (!hasPatientContext) return false

  const turningCue =
    /\b(?:last\s+(?:turned|turn)|turned\s+\d+\s+h(?:ours?|rs?)\s+ago|turning\s+overdue|not\s+turned|reposition|pressure\s+sore)\b/i.test(
      t,
    )
  const skinCue = matchRedness(t) || matchWound(t)
  const bedridden = matchBedridden(t)

  return turningCue || (bedridden && skinCue) || (bedridden && turningCue) || (skinCue && turningCue)
}

export function buildTurningBrainInput(
  payload: TurningBrainInput & { text?: string | null },
  now = new Date(),
): TurningBrainInput {
  const text = String(payload.text ?? "").trim()
  const rednessSite = payload.rednessSite ?? (text ? matchRednessSite(text) : null)
  const redness = payload.redness ?? (text ? matchRedness(text) || Boolean(rednessSite) : false)
  const bedridden = payload.bedridden ?? (text ? matchBedridden(text) : false)

  return {
    room: payload.room ?? (text ? matchRoom(text) : null),
    patientName: payload.patientName ?? (text ? matchPatientAfterRoom(text) : null),
    mobility: payload.mobility ?? (bedridden ? "Bedbound" : null),
    lastTurnedAt: payload.lastTurnedAt ?? (text ? parseLastTurnedAtFromText(text, now) : null),
    skinCondition: payload.skinCondition ?? (rednessSite ? `Redness at ${rednessSite}` : text ? text : null),
    redness,
    rednessSite,
    wound: payload.wound ?? (text ? matchWound(text) : false),
    bedridden,
  }
}
