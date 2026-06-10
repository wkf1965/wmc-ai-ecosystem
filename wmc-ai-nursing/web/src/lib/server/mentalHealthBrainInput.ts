/**
 * Parse free-text mental health messages into Mental Health Brain input.
 */

import type { MentalHealthBrainInput } from "../../ai/mentalHealthBrain"

const NAME_STOPWORDS = new Set([
  "wandering",
  "agitation",
  "agitated",
  "aggressive",
  "aggression",
  "anxiety",
  "anxious",
  "depression",
  "depressed",
  "hallucination",
  "insomnia",
  "suicidal",
  "restless",
  "confused",
  "confusion",
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

export function isMentalHealthAssessmentText(text: string): boolean {
  const t = String(text ?? "").trim()
  if (!t) return false
  if (!matchRoom(t) && !matchPatientAfterRoom(t)) return false

  return (
    /\b(?:agitat(?:ed|ion)|aggress(?:ive|ion)|wander(?:ing)?|anxious|anxiety|depress(?:ed|ion)|hallucinat(?:ion|ing|ed)|insomnia|suicidal|restless|hearing\s+voices|wants?\s+to\s+die)\b/i.test(
      t,
    ) || /躁动|游走|焦虑|抑郁|幻觉|失眠|自杀/.test(t)
  )
}

export function buildMentalHealthBrainInput(
  payload: MentalHealthBrainInput & { text?: string | null },
): MentalHealthBrainInput {
  const text = String(payload.text ?? "").trim()

  return {
    room: payload.room ?? (text ? matchRoom(text) : null),
    patientName: payload.patientName ?? (text ? matchPatientAfterRoom(text) : null),
    text: text || null,
    agitation: payload.agitation ?? null,
    aggression: payload.aggression ?? null,
    wandering: payload.wandering ?? null,
    anxiety: payload.anxiety ?? null,
    depression: payload.depression ?? null,
    hallucination: payload.hallucination ?? null,
    insomnia: payload.insomnia ?? null,
    suicidalStatement: payload.suicidalStatement ?? null,
  }
}
