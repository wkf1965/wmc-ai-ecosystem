/**
 * Family Update Brain — family notification decision and draft message.
 *
 * Generates a short family-friendly update for HIGH / EMERGENCY risk.
 * Does not send WhatsApp — message generation only.
 */

import type { RiskBrainResult } from "../lib/server/riskBrainV2"

export type FamilyUpdateBrainInput = {
  riskLevel: RiskBrainResult["riskLevel"]
  categories?: string[]
  patientName?: string | null
  room?: string | null
  reasons?: string[]
  nursingActions?: string[]
  doctorReview?: "YES" | "NO"
}

export type FamilyUpdateBrainResult = {
  familyUpdate: "YES" | "NO" | "RECOMMENDED"
  reason: string
  familyMessage: string
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return ""
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/** Map a clinical reason to plain language for family. */
function reasonToFamilyPhrase(reason: string): string | null {
  const r = reason.trim().toLowerCase()
  if (!r || r.includes("combined high risk") || r.includes("combined risk")) return null
  if (r.startsWith("bp ") || r.includes("hypotension")) return "low blood pressure"
  if (r.includes("poor appetite") || r.includes("not eating") || r.includes("refusing food")) return "poor appetite"
  if (r.includes("weak mobility") || r === "weak") return "weak mobility"
  if (r.includes("fever")) return "fever"
  if (r.includes("spo2") || r.includes("oxygen")) return "low oxygen level"
  if (r.includes("chest pain")) return "chest pain"
  if (r.includes("difficulty breathing") || r.includes("shortness of breath")) return "difficulty breathing"
  if (r.includes("unconscious") || r.includes("unresponsive")) return "reduced responsiveness"
  return reason.replace(/\([^)]*\)/g, "").trim().toLowerCase() || null
}

/** Map nursing actions to a family-friendly care plan phrase. */
function actionsToFamilyPhrase(actions: string[]): string {
  const parts: string[] = []

  for (const action of actions) {
    const a = action.toLowerCase()
    if (a.includes("recheck bp")) parts.push("recheck BP within 30 minutes")
    else if (a.includes("encourage") && a.includes("fluid")) parts.push("encourage fluid if allowed")
    else if (a.includes("assist") && (a.includes("walk") || a.includes("mobil"))) parts.push("assist mobility")
    else if (a.includes("inform nurse in charge")) parts.push("inform nurse in charge")
    else if (a.includes("call doctor immediately")) parts.push("contact the doctor immediately")
    else if (a.includes("recheck temperature")) parts.push("recheck temperature")
    else if (a.includes("recheck spo2")) parts.push("recheck oxygen level")
    else if (a.includes("fall precaution")) parts.push("take fall precautions")
    else if (a.includes("monitor dizziness")) parts.push("monitor for dizziness and weakness")
  }

  const unique = [...new Set(parts)]
  if (unique.length === 0) return "continue close monitoring"
  return joinWithAnd(unique)
}

function buildFamilyMessage(input: FamilyUpdateBrainInput): string {
  const patientName = String(input.patientName ?? "").trim() || "your loved one"
  const room = String(input.room ?? "").trim()
  const roomPhrase = room ? ` in Room ${room}` : ""

  const concerns = [...new Set((input.reasons ?? []).map(reasonToFamilyPhrase).filter(Boolean) as string[])]
  const concernText =
    concerns.length > 0 ? joinWithAnd(concerns) : "a change in condition that needs closer monitoring"

  const carePlan = actionsToFamilyPhrase(input.nursingActions ?? [])

  let doctorTail = ""
  if (input.doctorReview === "YES") {
    doctorTail =
      input.riskLevel === "EMERGENCY"
        ? " Doctor review is required urgently."
        : " Doctor review is recommended."
  }

  return `Dear family, today ${patientName}${roomPhrase} has ${concernText}. Our nursing team will ${carePlan}.${doctorTail}`
}

/** Determine family notification level and draft the family message. */
export function runFamilyUpdateBrain(input: FamilyUpdateBrainInput): FamilyUpdateBrainResult {
  const { riskLevel, categories = [] } = input

  if (riskLevel === "EMERGENCY") {
    return {
      familyUpdate: "YES",
      reason: "Emergency — family should be informed.",
      familyMessage: buildFamilyMessage({ ...input, doctorReview: input.doctorReview ?? "YES" }),
    }
  }

  if (riskLevel === "HIGH") {
    const label = categories.length ? categories.join(", ") : "High risk findings"
    return {
      familyUpdate: "RECOMMENDED",
      reason: `${label} — family update recommended.`,
      familyMessage: buildFamilyMessage({ ...input, doctorReview: input.doctorReview ?? "YES" }),
    }
  }

  return {
    familyUpdate: "NO",
    reason: "Low or moderate risk — no family update required.",
    familyMessage: "",
  }
}
