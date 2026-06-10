/**
 * WMC AI Nursing Risk Brain — V2
 *
 * Categories:
 *   Hypotension Risk     BP sys <= 90 OR dia <= 60 → HIGH; sys < 80 OR dia < 50 → EMERGENCY
 *   Nutrition Risk       poor appetite → HIGH
 *   Fall Risk            weak mobility → HIGH
 *   Infection/Fever Risk temp >= 38 → MEDIUM; temp >= 39 → HIGH
 *   Emergency Risk       SpO2 < 94 → HIGH; SpO2 < 90, chest pain, difficulty breathing,
 *                        unconscious → EMERGENCY
 *
 * Poor appetite + weak mobility = HIGH combined risk (score bonus).
 *
 * NOT a regulated medical device — always verify clinical findings at the bedside.
 */

export type BrainSeverity = "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY"

export type RiskBrainInput = {
  bloodPressure?: string | null
  pulse?: string | number | null
  spo2?: string | number | null
  temperature?: string | number | null
  /** Canonical nutrition concern, e.g. "Poor appetite" */
  nutrition?: string | null
  /** Mobility status, e.g. "Weak" */
  mobility?: string | null
  /** Canonical conditions, e.g. ["Chest pain", "Fever", "Unconscious"] */
  conditions?: string[] | null
  patientName?: string | null
  room?: string | null
}

export type RiskBrainResult = {
  riskLevel: BrainSeverity
  riskScore: number
  categories: string[]
  reasons: string[]
  nursingActions: string[]
  doctorReview: "YES" | "NO"
  familyUpdate: "YES" | "NO" | "RECOMMENDED"
  recheckTime: string
  alertMessage: string
}

const CATEGORY_ORDER = [
  "Hypotension Risk",
  "Nutrition Risk",
  "Fall Risk",
  "Infection / Fever Risk",
  "Emergency Risk",
] as const

type Category = (typeof CATEGORY_ORDER)[number]

type Finding = {
  category: Category
  severity: Exclude<BrainSeverity, "LOW">
  reason: string
  nursingActions: string[]
  alertActions: string[]
}

const SEVERITY_RANK: Record<BrainSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, EMERGENCY: 3 }
const SEVERITY_SCORE: Record<BrainSeverity, number> = { LOW: 0, MEDIUM: 10, HIGH: 25, EMERGENCY: 40 }

function toNum(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

function parseBp(bp?: string | null): { systolic: number | null; diastolic: number | null } {
  if (!bp) return { systolic: null, diastolic: null }
  const m = /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(String(bp))
  if (!m) return { systolic: null, diastolic: null }
  return { systolic: Number(m[1]), diastolic: Number(m[2]) }
}

function pushUnique(target: string[], items: string[]) {
  for (const item of items) {
    if (!target.includes(item)) target.push(item)
  }
}

function isWeakMobility(mobility: string): boolean {
  const m = mobility.trim().toLowerCase()
  if (!m) return false
  return m === "weak" || /\bweak(?:ness)?\b/.test(m) || /虚弱|虛弱|乏力|无力|無力/.test(mobility)
}

function detectFindings(input: RiskBrainInput): Finding[] {
  const findings: Finding[] = []
  const conditions = Array.isArray(input.conditions) ? input.conditions : []
  const mobilityRaw = String(input.mobility ?? "").trim()

  // Hypotension Risk — BP <= 90/60 HIGH; BP < 80/50 EMERGENCY
  const { systolic, diastolic } = parseBp(input.bloodPressure)
  if (systolic != null && diastolic != null) {
    const bpText = `BP ${systolic}/${diastolic}`
    if (systolic < 80 || diastolic < 50) {
      findings.push({
        category: "Hypotension Risk",
        severity: "EMERGENCY",
        reason: `${bpText} (critical hypotension)`,
        nursingActions: ["Recheck BP immediately", "Lay patient flat, raise legs", "Call doctor immediately"],
        alertActions: ["Recheck BP immediately", "Call doctor immediately"],
      })
    } else if (systolic <= 90 || diastolic <= 60) {
      findings.push({
        category: "Hypotension Risk",
        severity: "HIGH",
        reason: bpText,
        nursingActions: ["Recheck BP within 30 minutes", "Encourage oral fluid if allowed", "Monitor dizziness / weakness"],
        alertActions: ["Recheck BP within 30 minutes", "Encourage fluid if allowed"],
      })
    }
  }

  // Nutrition Risk — poor appetite → HIGH
  const nutrition = String(input.nutrition ?? "").trim()
  if (nutrition) {
    findings.push({
      category: "Nutrition Risk",
      severity: "HIGH",
      reason: nutrition,
      nursingActions: ["Encourage oral fluid if allowed"],
      alertActions: ["Encourage fluid if allowed"],
    })
  }

  // Fall Risk — weak mobility → HIGH
  if (isWeakMobility(mobilityRaw)) {
    findings.push({
      category: "Fall Risk",
      severity: "HIGH",
      reason: "Weak mobility",
      nursingActions: ["Assist when walking"],
      alertActions: ["Fall precaution"],
    })
  }

  // Infection / Fever Risk — >= 38 MEDIUM; >= 39 HIGH
  const temp = toNum(input.temperature)
  if (temp != null && temp >= 39) {
    findings.push({
      category: "Infection / Fever Risk",
      severity: "HIGH",
      reason: `Fever ${temp}°C`,
      nursingActions: ["Recheck temperature within 30 minutes", "Give antipyretic as prescribed", "Monitor for infection signs"],
      alertActions: ["Recheck temperature within 30 minutes", "Give antipyretic as prescribed"],
    })
  } else if ((temp != null && temp >= 38) || (temp == null && conditions.includes("Fever"))) {
    findings.push({
      category: "Infection / Fever Risk",
      severity: "MEDIUM",
      reason: temp != null ? `Fever ${temp}°C` : "Fever reported",
      nursingActions: ["Recheck temperature in 1 hour", "Monitor for infection signs"],
      alertActions: ["Recheck temperature in 1 hour"],
    })
  }

  // Emergency Risk — SpO2
  const spo2 = toNum(input.spo2)
  if (spo2 != null && spo2 < 90) {
    findings.push({
      category: "Emergency Risk",
      severity: "EMERGENCY",
      reason: `SpO2 ${spo2}% (critical)`,
      nursingActions: ["Give oxygen as prescribed", "Call doctor immediately", "Continuous SpO2 monitoring"],
      alertActions: ["Give oxygen as prescribed", "Call doctor immediately"],
    })
  } else if (spo2 != null && spo2 < 94) {
    findings.push({
      category: "Emergency Risk",
      severity: "HIGH",
      reason: `SpO2 ${spo2}%`,
      nursingActions: ["Recheck SpO2 within 30 minutes", "Position patient upright", "Give oxygen as prescribed"],
      alertActions: ["Recheck SpO2 within 30 minutes"],
    })
  }

  // Emergency Risk — chest pain / difficulty breathing / unconscious
  const emergencyConditions: Array<{ condition: string; reason: string }> = [
    { condition: "Chest pain", reason: "Chest pain" },
    { condition: "Shortness of breath", reason: "Difficulty breathing" },
    { condition: "Unconscious", reason: "Unconscious / unresponsive" },
  ]
  for (const { condition, reason } of emergencyConditions) {
    if (conditions.includes(condition)) {
      findings.push({
        category: "Emergency Risk",
        severity: "EMERGENCY",
        reason,
        nursingActions: ["Call doctor immediately", "Stay with patient", "Prepare emergency equipment"],
        alertActions: ["Call doctor immediately", "Stay with patient"],
      })
    }
  }

  return findings.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
}

function overallLevel(findings: Finding[]): BrainSeverity {
  let level: BrainSeverity = "LOW"
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[level]) level = f.severity
  }
  return level
}

function buildAlertMessage(
  level: BrainSeverity,
  reasons: string[],
  alertActions: string[],
  patientName: string,
  room: string,
): string {
  if (level === "LOW") return ""
  const header =
    level === "EMERGENCY" ? "🚨 EMERGENCY ALERT" : level === "HIGH" ? "🔴 HIGH RISK ALERT" : "🟡 MEDIUM RISK ALERT"

  const lines = [header, `Patient: ${patientName || "Unknown"}`, `Room: ${room || "—"}`, "Reasons:"]
  reasons.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
  lines.push("", "Actions:")
  alertActions.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
  return lines.join("\n")
}

/** Run Risk Brain V2 over normalized nursing / vital input. */
export function runRiskBrainV2(input: RiskBrainInput): RiskBrainResult {
  const findings = detectFindings(input)
  const riskLevel = overallLevel(findings)

  const categories: string[] = []
  for (const f of findings) pushUnique(categories, [f.category])
  if (riskLevel === "EMERGENCY") pushUnique(categories, ["Emergency Risk"])

  const reasons: string[] = []
  for (const f of findings) pushUnique(reasons, [f.reason])

  const hasNutrition = categories.includes("Nutrition Risk")
  const hasFall = categories.includes("Fall Risk")
  if (hasNutrition && hasFall) {
    pushUnique(reasons, ["Poor appetite + weak mobility (combined high risk)"])
  }

  const combinedBonus = hasNutrition && hasFall ? 10 : 0
  const riskScore = Math.min(
    100,
    findings.reduce((sum, f) => sum + SEVERITY_SCORE[f.severity], 0) + combinedBonus,
  )

  const doctorReview: "YES" | "NO" = riskLevel === "HIGH" || riskLevel === "EMERGENCY" ? "YES" : "NO"
  const familyUpdate: "YES" | "NO" | "RECOMMENDED" =
    riskLevel === "EMERGENCY" ? "YES" : riskLevel === "HIGH" ? "RECOMMENDED" : "NO"
  const recheckTime =
    riskLevel === "EMERGENCY"
      ? "Immediately"
      : riskLevel === "HIGH"
        ? "30 minutes"
        : riskLevel === "MEDIUM"
          ? "1 hour"
          : "Routine (next shift)"

  const nursingActions: string[] = []
  for (const f of findings) pushUnique(nursingActions, f.nursingActions)
  if (riskLevel === "EMERGENCY") {
    pushUnique(nursingActions, ["Call doctor immediately", "Inform nurse in charge", "Continuous monitoring until stable"])
  } else if (riskLevel === "HIGH") {
    pushUnique(nursingActions, ["Inform nurse in charge", "Doctor review recommended"])
  } else if (riskLevel === "MEDIUM") {
    pushUnique(nursingActions, ["Inform nurse in charge"])
  } else {
    pushUnique(nursingActions, ["Routine monitoring"])
  }

  const alertActions: string[] = []
  for (const f of findings) pushUnique(alertActions, f.alertActions)
  if (riskLevel === "HIGH") pushUnique(alertActions, ["Doctor review recommended"])

  const alertMessage = buildAlertMessage(
    riskLevel,
    reasons,
    alertActions,
    String(input.patientName ?? "").trim(),
    String(input.room ?? "").trim(),
  )

  return {
    riskLevel,
    riskScore,
    categories,
    reasons,
    nursingActions,
    doctorReview,
    familyUpdate,
    recheckTime,
    alertMessage,
  }
}
