/**
 * Parse free-text medication messages into Medication Brain input.
 */

import type { MedicationBrainInput } from "../../ai/medicationBrain"

const NAME_STOPWORDS = new Set([
  "medication",
  "medicine",
  "med",
  "missed",
  "refused",
  "vomited",
  "tablet",
  "tablets",
  "capsule",
  "dose",
  "given",
  "blood",
  "pressure",
  "bp",
  "at",
  "pm",
  "am",
])

function matchRoom(text: string): string | null {
  const m = /\b(?:room|rm|r)\s*\.?\s*([A-Za-z]?-?\d{1,4}[A-Za-z]?)\b/i.exec(text)
  return m ? m[1] : null
}

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

function matchMedicationName(text: string): string | null {
  const t = String(text ?? "")

  const bpTablet = /\b(?:blood\s+pressure|bp)\s+(?:tablet|tab|pill|medication|med)\b/i.exec(t)
  if (bpTablet) return "blood pressure tablet"

  const afterMed =
    /\b(?:medication|medicine|med)\s+(?:missed|refused|given|delayed|for)?\s*[:\-]?\s*([a-z0-9][a-z0-9\s/-]{1,40})/i.exec(t) ||
    /\b(?:tablet|capsule|pill)\s+(?:for\s+)?([a-z0-9][a-z0-9\s/-]{1,40})/i.exec(t)
  if (afterMed) {
    const name = afterMed[1]
      .replace(/\b(?:missed|refused|at|8pm|9pm|10pm|8am|9am|10am|\d{1,2}\s*(?:am|pm))\b/gi, "")
      .trim()
    if (name) return name
  }

  const trailing = /\b([a-z]+(?:\s+[a-z]+){0,3})\s+(?:tablet|tab|capsule|pill)\b/i.exec(t)
  if (trailing) return `${trailing[1]} tablet`.trim()

  return null
}

function matchScheduledTime(text: string): string | null {
  const t = String(text ?? "")
  const atTime = /\b(?:at|@)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i.exec(t)
  if (atTime) return atTime[1].trim()

  const bare = /\b(\d{1,2}\s*(?:am|pm))\b/i.exec(t)
  if (bare) return bare[1].replace(/\s+/g, "").trim()

  return null
}

function matchStatus(text: string, payload: MedicationBrainInput): string | null {
  if (payload.status) return String(payload.status)
  const t = text.toLowerCase()
  if (/\bmedication\s+missed\b|\bmissed\s+(?:medication|med|dose|tablet)\b|\bdose\s+missed\b/.test(t)) return "missed"
  if (/\brefused\s+(?:medication|med|tablet|dose)\b|\bmedication\s+refused\b/.test(t)) return "refused"
  if (/\bvomit(?:ed|ing)?\s+after\s+(?:medication|med|tablet)\b/.test(t)) return "vomited"
  if (/\ballergic\s+reaction\b|\brash\b|\bbreathing\s+difficult/.test(t)) return "reaction"
  return null
}

export function isMedicationAssessmentText(text: string): boolean {
  const t = String(text ?? "").trim()
  if (!t) return false
  if (!matchRoom(t) && !matchPatientAfterRoom(t)) return false

  const medCue = /\b(?:medication|medicine|med|tablet|tablets|capsule|pill|dose|mar)\b/i.test(t)
  const eventCue =
    /\b(?:missed|refused|vomited|not\s+given|delayed|allergic\s+reaction|rash|adverse\s+reaction)\b/i.test(t)

  return medCue && eventCue
}

export function buildMedicationBrainInput(
  payload: MedicationBrainInput & { text?: string | null },
): MedicationBrainInput {
  const text = String(payload.text ?? "").trim()
  const status = matchStatus(text, payload)
  const medicationName = payload.medicationName ?? (text ? matchMedicationName(text) : null)

  return {
    room: payload.room ?? (text ? matchRoom(text) : null),
    patientName: payload.patientName ?? (text ? matchPatientAfterRoom(text) : null),
    medicationName,
    scheduledTime: payload.scheduledTime ?? (text ? matchScheduledTime(text) : null),
    givenTime: payload.givenTime ?? null,
    status,
    reaction: payload.reaction ?? (/\ballergic\b|\brash\b|\bbreathing\s+difficult/i.test(text) ? text : null),
    refused: payload.refused ?? status === "refused",
    vomited: payload.vomited ?? status === "vomited",
  }
}
