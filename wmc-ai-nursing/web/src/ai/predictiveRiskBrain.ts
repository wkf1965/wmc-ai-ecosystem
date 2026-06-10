/**
 * Predictive Risk Brain — forecast clinical risks over 24–48 hour horizons.
 *
 * Predicts:
 *   Fall risk              — next 24 hours
 *   Pressure sore risk     — next 48 hours
 *   Dehydration risk       — next 24 hours
 *   Hospital transfer risk — near term
 *   Readmission risk       — post-discharge / transfer context
 */

import type { FallPreventionBrainResult } from "./fallPreventionBrain"
import type { NutritionBrainResult } from "./nutritionBrain"
import type { TurningBrainResult } from "./turningBrain"
import type { RiskBrainResult } from "../lib/server/riskBrainV2"
import type { MasterCoordinatorBrainResult } from "./masterCoordinatorBrain"

export type PredictiveRiskLevel = "LOW" | "MEDIUM" | "HIGH"

export type PredictiveRiskBrainInput = {
  room?: string | null
  patientName?: string | null
  /** Mobility status, e.g. "Weak", "Bedbound" */
  mobility?: string | null
  bedridden?: boolean | string | null
  previousFall?: boolean | string | null
  dizziness?: boolean | string | null
  confusion?: boolean | string | null
  bp?: string | null
  bloodPressure?: string | null
  spo2?: string | number | null
  temperature?: string | number | null
  sedativeMedication?: boolean | string | null
  visionProblem?: boolean | string | null
  lastTurnedAt?: string | null
  turningOverdue?: boolean | string | null
  redness?: boolean | string | null
  wound?: boolean | string | null
  fluidIntake?: string | number | null
  poorAppetite?: boolean | string | null
  vomiting?: boolean | string | null
  diarrhea?: boolean | string | null
  urineOutput?: string | null
  dryMouth?: boolean | string | null
  chestPain?: boolean | string | null
  difficultyBreathing?: boolean | string | null
  fever?: boolean | string | number | null
  unresponsive?: boolean | string | null
  recentHospitalization?: boolean | string | null
  multipleComorbidities?: boolean | string | null
  poorAdherence?: boolean | string | null
  livingAlone?: boolean | string | null
  /** Optional outputs from other brains */
  fallPreventionBrain?: Pick<FallPreventionBrainResult, "fallRisk" | "reasons"> | null
  turningBrain?: Pick<TurningBrainResult, "pressureSoreRisk" | "turningOverdue" | "reasons"> | null
  nutritionBrain?: Pick<NutritionBrainResult, "nutritionRisk" | "dehydrationRisk" | "reasons"> | null
  riskBrain?: Pick<RiskBrainResult, "riskLevel" | "riskScore" | "reasons"> | null
  masterCoordinator?: Pick<MasterCoordinatorBrainResult, "overallRiskLevel" | "overallRiskScore" | "topProblems"> | null
}

export type PredictiveRiskForecast = {
  level: PredictiveRiskLevel
  horizon: string
  reasons: string[]
}

export type PredictiveRiskBrainResult = {
  fallRisk24h: PredictiveRiskForecast
  pressureSoreRisk48h: PredictiveRiskForecast
  dehydrationRisk24h: PredictiveRiskForecast
  hospitalTransferRisk: PredictiveRiskForecast
  readmissionRisk: PredictiveRiskForecast
}

const SEVERITY_RANK: Record<PredictiveRiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 }

function maxRisk(current: PredictiveRiskLevel, next: PredictiveRiskLevel): PredictiveRiskLevel {
  return SEVERITY_RANK[next] > SEVERITY_RANK[current] ? next : current
}

function isTruthy(value: boolean | string | null | undefined): boolean {
  if (value === true) return true
  if (typeof value === "string") return /^(true|yes|1|y|present|noted|positive)$/i.test(value.trim())
  return false
}

function parseBp(bp?: string | null): { systolic: number | null; diastolic: number | null } {
  const raw = String(bp ?? "").trim()
  if (!raw) return { systolic: null, diastolic: null }
  const m = /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(raw)
  if (!m) return { systolic: null, diastolic: null }
  return { systolic: Number(m[1]), diastolic: Number(m[2]) }
}

function isLowBp(bp?: string | null): boolean {
  const { systolic, diastolic } = parseBp(bp)
  if (systolic != null && diastolic != null) return systolic <= 90 || diastolic <= 60
  return /\blow\s+bp\b|\bhypotension\b/i.test(String(bp ?? ""))
}

function isCriticalBp(bp?: string | null): boolean {
  const { systolic, diastolic } = parseBp(bp)
  if (systolic != null && diastolic != null) return systolic < 80 || diastolic < 50
  return false
}

function toNum(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.]/g, ""))
  return Number.isFinite(n) ? n : null
}

function isWeakMobility(mobility?: string | null): boolean {
  const m = String(mobility ?? "").trim().toLowerCase()
  return /\bweak\b|\bunsteady\b|\bassist/.test(m) || /虚弱|乏力/.test(m)
}

function isBedridden(input: PredictiveRiskBrainInput): boolean {
  if (isTruthy(input.bedridden)) return true
  const m = String(input.mobility ?? "").trim().toLowerCase()
  return /\bbed\s?bound\b|\bbedridden\b/.test(m)
}

function isLowFluid(fluidIntake?: string | number | null): boolean {
  if (fluidIntake == null || fluidIntake === "") return false
  if (typeof fluidIntake === "number") return fluidIntake > 0 && fluidIntake < 500
  return /\blow\b|\bpoor\b|\bminimal\b|\binsufficient\b/i.test(String(fluidIntake))
}

function parseHoursWithoutUrine(urineOutput?: string | null): number | null {
  const s = String(urineOutput ?? "").toLowerCase()
  const match =
    /(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:without|since|no|nil)\s*(?:urine|void)/i.exec(s) ||
    /(?:no|nil|zero)\s+(?:urine|void).{0,20}?(\d+(?:\.\d+)?)\s*h/i.exec(s)
  if (match) return Number(match[1])
  if (/\b(?:no|nil|zero)\s+(?:urine|void)\b/.test(s)) return 8
  return null
}

function isTurningOverdue(input: PredictiveRiskBrainInput): boolean {
  if (isTruthy(input.turningOverdue)) return true
  if (input.turningBrain?.turningOverdue) return true
  if (!input.lastTurnedAt) return false
  const last = new Date(input.lastTurnedAt)
  if (!Number.isFinite(last.getTime())) return false
  return Date.now() - last.getTime() > 2 * 60 * 60 * 1000
}

function hasRednessOrWound(input: PredictiveRiskBrainInput): boolean {
  return isTruthy(input.redness) || isTruthy(input.wound)
}

function hasGiLoss(input: PredictiveRiskBrainInput): boolean {
  return isTruthy(input.vomiting) || isTruthy(input.diarrhea)
}

function hasHighFever(temp?: string | number | null): boolean {
  const n = toNum(temp)
  return n != null && n >= 39
}

function hasLowSpo2(spo2?: string | number | null): boolean {
  const n = toNum(spo2)
  if (n == null) return false
  return n < 94
}

function hasCriticalSpo2(spo2?: string | number | null): boolean {
  const n = toNum(spo2)
  return n != null && n < 90
}

function forecast(level: PredictiveRiskLevel, horizon: string, reasons: string[]): PredictiveRiskForecast {
  return { level, horizon, reasons: [...new Set(reasons.filter(Boolean))] }
}

function predictFallRisk24h(input: PredictiveRiskBrainInput): PredictiveRiskForecast {
  let level: PredictiveRiskLevel = "LOW"
  const reasons: string[] = []

  if (input.fallPreventionBrain?.fallRisk === "HIGH") {
    level = "HIGH"
    reasons.push(...(input.fallPreventionBrain.reasons ?? []).map((r) => `Current fall risk: ${r}`))
  }

  if (isTruthy(input.previousFall)) {
    level = "HIGH"
    reasons.push("History of previous fall")
  }

  if (isTruthy(input.dizziness) && (isTruthy(input.confusion) || isWeakMobility(input.mobility))) {
    level = "HIGH"
    reasons.push("Dizziness with confusion or weak mobility")
  } else {
    if (isTruthy(input.dizziness)) {
      level = maxRisk(level, "HIGH")
      reasons.push("Dizziness reported")
    }
    if (isTruthy(input.confusion)) {
      level = maxRisk(level, "HIGH")
      reasons.push("Confusion present")
    }
  }

  if (isWeakMobility(input.mobility) && isLowBp(input.bp ?? input.bloodPressure)) {
    level = "HIGH"
    reasons.push("Weak mobility with low BP")
  } else if (isWeakMobility(input.mobility)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Weak mobility")
  }

  if (isTruthy(input.sedativeMedication)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Sedative medication increases fall risk")
  }

  if (isTruthy(input.visionProblem)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Vision problem")
  }

  if (level === "LOW" && reasons.length === 0) {
    reasons.push("No major fall predictors identified in next 24 hours")
  }

  return forecast(level, "24 hours", reasons)
}

function predictPressureSoreRisk48h(input: PredictiveRiskBrainInput): PredictiveRiskForecast {
  let level: PredictiveRiskLevel = "LOW"
  const reasons: string[] = []

  if (input.turningBrain?.pressureSoreRisk === "HIGH") {
    level = "HIGH"
    reasons.push(...(input.turningBrain.reasons ?? []).map((r) => `Current pressure sore risk: ${r}`))
  }

  if (isBedridden(input) && isTurningOverdue(input)) {
    level = "HIGH"
    reasons.push("Bedridden with overdue repositioning")
  } else if (isBedridden(input)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Bedridden — prolonged pressure exposure likely")
  }

  if (hasRednessOrWound(input)) {
    level = "HIGH"
    reasons.push("Existing redness or wound site")
  }

  if (isTurningOverdue(input) && !reasons.some((r) => r.includes("overdue"))) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Turning interval exceeded (>2 hours)")
  }

  if (isWeakMobility(input.mobility) && isBedridden(input)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Limited mobility with bed rest")
  }

  if (level === "LOW" && reasons.length === 0) {
    reasons.push("Repositioning and skin status acceptable for next 48 hours")
  }

  return forecast(level, "48 hours", reasons)
}

function predictDehydrationRisk24h(input: PredictiveRiskBrainInput): PredictiveRiskForecast {
  let level: PredictiveRiskLevel = "LOW"
  const reasons: string[] = []

  if (input.nutritionBrain?.dehydrationRisk === "HIGH") {
    level = "HIGH"
    reasons.push(...(input.nutritionBrain.reasons ?? []).filter((r) => /fluid|urine|vomit|diarrh|dry/i.test(r)).map((r) => `Current: ${r}`))
  }

  const hoursNoUrine = parseHoursWithoutUrine(input.urineOutput)
  if (hoursNoUrine != null && hoursNoUrine >= 8) {
    level = "HIGH"
    reasons.push(`No urine output for ${hoursNoUrine} hours`)
  }

  if (isLowFluid(input.fluidIntake) && (isTruthy(input.poorAppetite) || input.nutritionBrain?.nutritionRisk === "HIGH")) {
    level = "HIGH"
    reasons.push("Low fluid intake with poor appetite")
  } else if (isLowFluid(input.fluidIntake)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Low fluid intake")
  }

  if (hasGiLoss(input)) {
    level = maxRisk(level, hasGiLoss(input) && isLowFluid(input.fluidIntake) ? "HIGH" : "MEDIUM")
    reasons.push("Vomiting or diarrhea increases fluid loss")
  }

  if (isTruthy(input.dryMouth)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Dry mouth noted")
  }

  if (isTruthy(input.poorAppetite) && !reasons.some((r) => r.includes("appetite"))) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Poor appetite reduces oral intake")
  }

  if (level === "LOW" && reasons.length === 0) {
    reasons.push("Fluid intake and output stable for next 24 hours")
  }

  return forecast(level, "24 hours", reasons)
}

function predictHospitalTransferRisk(input: PredictiveRiskBrainInput): PredictiveRiskForecast {
  let level: PredictiveRiskLevel = "LOW"
  const reasons: string[] = []
  const bp = input.bp ?? input.bloodPressure

  if (input.riskBrain?.riskLevel === "EMERGENCY" || input.masterCoordinator?.overallRiskLevel === "EMERGENCY") {
    level = "HIGH"
    reasons.push("Emergency-level clinical instability")
  }

  if (isCriticalBp(bp)) {
    level = "HIGH"
    reasons.push("Critical hypotension")
  } else if (isLowBp(bp)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Low blood pressure")
  }

  if (hasCriticalSpo2(input.spo2)) {
    level = "HIGH"
    reasons.push("Critical low SpO2 (<90%)")
  } else if (hasLowSpo2(input.spo2)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Low SpO2 (<94%)")
  }

  if (isTruthy(input.chestPain) || isTruthy(input.difficultyBreathing)) {
    level = "HIGH"
    reasons.push("Chest pain or difficulty breathing")
  }

  if (hasHighFever(input.temperature) || isTruthy(input.fever)) {
    level = maxRisk(level, hasHighFever(input.temperature) ? "HIGH" : "MEDIUM")
    reasons.push("Fever / infection concern")
  }

  if (isTruthy(input.unresponsive)) {
    level = "HIGH"
    reasons.push("Reduced responsiveness")
  }

  const coordinatorScore = input.masterCoordinator?.overallRiskScore ?? input.riskBrain?.riskScore ?? 0
  if (coordinatorScore >= 70 && level !== "HIGH") {
    level = maxRisk(level, "MEDIUM")
    reasons.push(`High overall risk score (${coordinatorScore})`)
  }

  if (level === "LOW" && reasons.length === 0) {
    reasons.push("No acute indicators for hospital transfer at this time")
  }

  return forecast(level, "near term", reasons)
}

function predictReadmissionRisk(input: PredictiveRiskBrainInput): PredictiveRiskForecast {
  let level: PredictiveRiskLevel = "LOW"
  const reasons: string[] = []

  if (isTruthy(input.recentHospitalization) && isTruthy(input.livingAlone)) {
    level = "HIGH"
    reasons.push("Recent hospitalization with limited home support")
  } else if (isTruthy(input.recentHospitalization)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Recent hospitalization within risk window")
  }

  if (isTruthy(input.multipleComorbidities) && isTruthy(input.poorAdherence)) {
    level = "HIGH"
    reasons.push("Multiple comorbidities with poor treatment adherence")
  } else if (isTruthy(input.multipleComorbidities)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Multiple comorbidities")
  }

  if (isTruthy(input.poorAdherence)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Poor medication or care plan adherence")
  }

  if (isTruthy(input.livingAlone)) {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Lives alone — reduced post-discharge support")
  }

  const overall = input.masterCoordinator?.overallRiskLevel ?? input.riskBrain?.riskLevel
  if (overall === "HIGH" || overall === "EMERGENCY") {
    level = maxRisk(level, "MEDIUM")
    reasons.push("Current high acuity increases readmission likelihood")
  }

  if (level === "LOW" && reasons.length === 0) {
    reasons.push("No major readmission predictors identified")
  }

  return forecast(level, "post-discharge window", reasons)
}

/** Predict fall, pressure sore, dehydration, transfer, and readmission risks. */
export function predictRisk(input: PredictiveRiskBrainInput): PredictiveRiskBrainResult {
  return {
    fallRisk24h: predictFallRisk24h(input),
    pressureSoreRisk48h: predictPressureSoreRisk48h(input),
    dehydrationRisk24h: predictDehydrationRisk24h(input),
    hospitalTransferRisk: predictHospitalTransferRisk(input),
    readmissionRisk: predictReadmissionRisk(input),
  }
}
