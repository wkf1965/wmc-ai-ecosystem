/**
 * Normalize any vital / nursing payload (structured fields + free text) into Risk Brain V2 input.
 */

import { detectNutritionConcern } from "./clinicalAlerts"
import { runRiskBrainV2, type RiskBrainInput, type RiskBrainResult } from "./riskBrainV2"

export type NursingRiskPayload = {
  room?: string | null
  patientName?: string | null
  name?: string | null
  note?: string | null
  remark?: string | null
  remarks?: string | null
  bloodPressure?: string | null
  bp?: string | null
  pulse?: string | number | null
  spo2?: string | number | null
  temperature?: string | number | null
  nutrition?: string | null
  appetite?: string | null
  mobility?: string | null
  conditions?: string[] | null
  vitals?: {
    bp?: string | null
    bloodPressure?: string | null
    pulse?: string | number | null
    spo2?: string | number | null
    temperature?: string | number | null
  } | null
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseBpFromText(text: string): string | null {
  const labelled = /\b(?:b\/?p|blood\s*pressure)\s*:?\s*(\d{2,3})\s*\/\s*(\d{2,3})\b/i.exec(text)
  if (labelled) return `${labelled[1]}/${labelled[2]}`
  const bare = /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/.exec(text)
  if (bare) {
    const sys = Number(bare[1])
    if (sys >= 60 && sys <= 300) return `${bare[1]}/${bare[2]}`
  }
  return null
}

function parseSpo2FromText(text: string): number | null {
  const m = /\b(?:spo2|spo|sao2|o2\s*sat|sats?)\s*:?\s*(\d{2,3})\b/i.exec(text)
  return m ? Number(m[1]) : null
}

function parseTempFromText(text: string): number | null {
  const m = /(?:temperature|temp|tmp|suhu\s*badan|suhu|demam|发烧|發燒)\s*:?\s*(\d{2}(?:\.\d+)?)/i.exec(text)
  return m ? Number(m[1]) : null
}

function parseMobilityFromText(text: string): string | null {
  const t = text.toLowerCase()
  if (/\bweak(?:ness)?\s+mobility\b|\bweak\s+mobility\b/.test(t) || /\bweak(?:ness)?\b/.test(t)) return "Weak"
  if (/虚弱|虛弱|乏力|无力|無力/.test(text)) return "Weak"
  return null
}

function parseConditionsFromText(text: string): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []
  if (/\bchest\s+pain\b|\bsakit\s+dada\b|\bnyeri\s+dada\b/i.test(lower) || /胸痛|胸口痛|胸闷|胸悶/.test(text)) {
    found.push("Chest pain")
  }
  if (
    /\bdifficult(?:y)?\s+breathing\b|\bshortness\s+of\s+breath\b|\bbreathless\b|\bsob\b|\bsesak\s*nafas\b|\bsesak\b/i.test(
      lower,
    ) ||
    /呼吸困难|呼吸困難|气喘|氣喘|喘不过气|喘不過氣/.test(text)
  ) {
    found.push("Shortness of breath")
  }
  if (
    /\bunconscious\b|\bunresponsive\b|\bnot\s+responding\b|\btidak\s+sedar\b|\bpengsan\b/i.test(lower) ||
    /昏迷|不省人事|失去意识|失去意識|无意识|無意識/.test(text)
  ) {
    found.push("Unconscious")
  }
  if (/\bfever\b|\bdemam\b|\bpyrexia\b/i.test(lower) || /发烧|發燒|发热|發熱/.test(text)) {
    found.push("Fever")
  }
  return found
}

/** Merge structured fields and free text into a single Risk Brain V2 input. */
export function buildRiskBrainInput(payload: NursingRiskPayload): RiskBrainInput {
  const note = [payload.note, payload.remark, payload.remarks].filter(Boolean).join(" ").trim()
  const vitals = payload.vitals ?? {}

  const bloodPressure =
    String(payload.bloodPressure || payload.bp || vitals.bloodPressure || vitals.bp || "").trim() ||
    parseBpFromText(note) ||
    null

  const spo2Val = payload.spo2 ?? vitals.spo2 ?? parseSpo2FromText(note)
  const tempVal = payload.temperature ?? vitals.temperature ?? parseTempFromText(note)

  const nutrition =
    detectNutritionConcern(payload.nutrition) ||
    detectNutritionConcern(payload.appetite) ||
    detectNutritionConcern(note) ||
    null

  const mobility = String(payload.mobility || parseMobilityFromText(note) || "").trim() || null

  const fromText = parseConditionsFromText(note)
  const fromPayload = Array.isArray(payload.conditions) ? payload.conditions.filter(Boolean).map(String) : []
  const conditions = [...new Set([...fromPayload, ...fromText])]

  return {
    bloodPressure,
    pulse: payload.pulse ?? vitals.pulse ?? null,
    spo2: spo2Val != null && spo2Val !== "" ? spo2Val : null,
    temperature: tempVal != null && tempVal !== "" ? tempVal : null,
    nutrition,
    mobility,
    conditions,
    patientName: String(payload.patientName || payload.name || "").trim() || null,
    room: String(payload.room || "").trim() || null,
  }
}

/** Assess any vital / nursing input and return the full Risk Brain V2 result. */
export function assessNursingRisk(payload: NursingRiskPayload): RiskBrainResult {
  return runRiskBrainV2(buildRiskBrainInput(payload))
}
