/**
 * Fall Prevention Brain — fall risk assessment.
 *
 * Rules:
 *   Weak mobility                    → MEDIUM
 *   Weak mobility + low BP           → HIGH
 *   Previous fall                    → HIGH
 *   Dizziness                        → HIGH
 *   Confusion                        → HIGH
 *   Sedative medication              → MEDIUM
 *   Vision problem                   → MEDIUM
 *   Frequent toileting               → MEDIUM
 *   Previous fall + dizziness        → HIGH
 */

export type FallRiskLevel = "LOW" | "MEDIUM" | "HIGH"

export type FallPreventionBrainInput = {
  room?: string | null
  patientName?: string | null
  mobility?: string | null
  dizziness?: boolean | string | null
  confusion?: boolean | string | null
  previousFall?: boolean | string | null
  bp?: string | null
  walkingAid?: boolean | string | null
  sedativeMedication?: boolean | string | null
  visionProblem?: boolean | string | null
  toiletingFrequency?: string | null
}

export type FallPreventionBrainResult = {
  fallRisk: FallRiskLevel
  reasons: string[]
  nursingActions: string[]
  doctorReview: "YES" | "NO"
  alertMessage: string
}

const SEVERITY_RANK: Record<FallRiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 }

function maxRisk(current: FallRiskLevel, next: FallRiskLevel): FallRiskLevel {
  return SEVERITY_RANK[next] > SEVERITY_RANK[current] ? next : current
}

function isTruthy(value: boolean | string | null | undefined): boolean {
  if (value === true) return true
  if (typeof value === "string") return /^(true|yes|1|y|present|noted|positive)$/i.test(value.trim())
  return false
}

function parseBp(bp?: string | null): { systolic: number | null; diastolic: number | null } {
  if (!bp) return { systolic: null, diastolic: null }
  const m = /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(String(bp))
  if (!m) return { systolic: null, diastolic: null }
  return { systolic: Number(m[1]), diastolic: Number(m[2]) }
}

function isLowBp(bp?: string | null): boolean {
  const { systolic, diastolic } = parseBp(bp)
  if (systolic != null && diastolic != null) {
    return systolic <= 90 || diastolic <= 60
  }
  const s = String(bp ?? "")
    .trim()
    .toLowerCase()
  return /\blow\s+bp\b|\bhypotension\b|\bbp\s+low\b/.test(s)
}

function isWeakMobility(mobility?: string | null): boolean {
  const m = String(mobility ?? "")
    .trim()
    .toLowerCase()
  if (!m) return false
  return (
    m === "weak" ||
    /\bweak(?:ness)?\s+mobility\b|\bweak\s+mobility\b/.test(m) ||
    /\bweak(?:ness)?\b|\bunsteady\b|\bneeds?\s+assist/.test(m) ||
    /虚弱|虛弱|乏力|无力|無力/.test(m)
  )
}

function hasPreviousFall(value?: boolean | string | null): boolean {
  if (isTruthy(value)) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return /\bprevious\s+fall\b|\bfell\s+before\b|\bhistory\s+of\s+fall/.test(s) || /曾跌倒|有跌倒史/.test(s)
}

function hasDizziness(value?: boolean | string | null): boolean {
  if (isTruthy(value)) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return /\bdizz(?:y|iness)\b|\bvertigo\b|\blightheaded\b|\bgiddy\b/.test(s) || /头晕|頭暈|眩晕|眩暈/.test(s)
}

function hasConfusion(value?: boolean | string | null): boolean {
  if (isTruthy(value)) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return /\bconfus(?:ed|ion)\b|\bdelirium\b|\bdisoriented\b|\bnot\s+oriented\b/.test(s) || /糊涂|意识模糊|意识不清/.test(s)
}

function hasSedativeMedication(value?: boolean | string | null): boolean {
  if (isTruthy(value)) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return /\bsedative\b|\bsleeping\s+pill\b|\bhypnotic\b|\bbenzodiazepine\b|\bon\s+sedation\b/.test(s)
}

function hasVisionProblem(value?: boolean | string | null): boolean {
  if (isTruthy(value)) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return /\bvision\s+problem\b|\bpoor\s+vision\b|\bblurred\s+vision\b|\bvisual\s+impair/.test(s) || /视力|視力|看不清/.test(s)
}

function isFrequentToileting(value?: string | null): boolean {
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  if (!s) return false
  return (
    /\bfrequent\s+toilet/.test(s) ||
    /\btoilet(?:ing)?\s+often\b/.test(s) ||
    /\bnocturia\b|\bpasses\s+urine\s+often\b/.test(s) ||
    /频繁如厕|常上厕所/.test(s)
  )
}

function buildNursingActions(input: {
  fallRisk: FallRiskLevel
  weakMobility: boolean
  dizziness: boolean
}): string[] {
  if (input.fallRisk === "LOW") return ["Continue routine fall precautions"]

  const actions: string[] = ["Fall precaution", "Inform nurse in charge"]

  if (input.weakMobility || input.fallRisk !== "LOW") {
    actions.push("Assist transfer and ambulation")
  }

  actions.push("Keep call bell within reach")
  actions.push("Bed in lowest position")

  if (input.dizziness || input.fallRisk === "HIGH") {
    actions.push("Monitor dizziness")
  }

  return [...new Set(actions)]
}

function buildAlertMessage(
  fallRisk: FallRiskLevel,
  reasons: string[],
  patientName: string,
  room: string,
): string {
  if (fallRisk === "LOW") return ""

  const header = fallRisk === "HIGH" ? "🔴 HIGH FALL RISK" : "🟡 MEDIUM FALL RISK"
  const lines = [
    header,
    `Patient: ${patientName || "Unknown"}`,
    `Room: ${room || "—"}`,
    `Fall Risk: ${fallRisk}`,
  ]

  if (reasons.length > 0) {
    lines.push("Reasons:")
    reasons.forEach((reason, index) => lines.push(`${index + 1}. ${reason}`))
  }

  return lines.join("\n")
}

/** Assess fall risk for one patient record. */
export function analyzeFallRisk(record: FallPreventionBrainInput): FallPreventionBrainResult {
  const room = String(record.room ?? "").trim()
  const patientName = String(record.patientName ?? "").trim()

  let fallRisk: FallRiskLevel = "LOW"
  const reasons: string[] = []

  const weakMobility = isWeakMobility(record.mobility)
  const lowBp = isLowBp(record.bp)
  const previousFall = hasPreviousFall(record.previousFall)
  const dizziness = hasDizziness(record.dizziness)
  const confusion = hasConfusion(record.confusion)
  const sedativeMedication = hasSedativeMedication(record.sedativeMedication)
  const visionProblem = hasVisionProblem(record.visionProblem)
  const frequentToileting = isFrequentToileting(record.toiletingFrequency)

  if (weakMobility && lowBp) {
    fallRisk = "HIGH"
    reasons.push("Weak mobility with low BP")
  } else if (weakMobility) {
    fallRisk = maxRisk(fallRisk, "MEDIUM")
    reasons.push("Weak mobility")
  }

  if (previousFall && dizziness) {
    fallRisk = "HIGH"
    reasons.push("Previous fall with dizziness")
  } else {
    if (previousFall) {
      fallRisk = "HIGH"
      reasons.push("Previous fall")
    }
    if (dizziness) {
      fallRisk = "HIGH"
      reasons.push("Dizziness")
    }
  }

  if (confusion) {
    fallRisk = "HIGH"
    reasons.push("Confusion")
  }

  if (sedativeMedication) {
    fallRisk = maxRisk(fallRisk, "MEDIUM")
    reasons.push("Sedative medication")
  }

  if (visionProblem) {
    fallRisk = maxRisk(fallRisk, "MEDIUM")
    reasons.push("Vision problem")
  }

  if (frequentToileting) {
    fallRisk = maxRisk(fallRisk, "MEDIUM")
    reasons.push("Frequent toileting")
  }

  const doctorReview: "YES" | "NO" = fallRisk === "HIGH" ? "YES" : "NO"

  const nursingActions = buildNursingActions({
    fallRisk,
    weakMobility,
    dizziness,
  })

  const alertMessage = buildAlertMessage(fallRisk, reasons, patientName, room)

  return {
    fallRisk,
    reasons: [...new Set(reasons)],
    nursingActions,
    doctorReview,
    alertMessage,
  }
}
