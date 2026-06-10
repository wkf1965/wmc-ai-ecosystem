/**
 * Master Coordinator Brain — aggregates all clinical brains into one nursing summary.
 *
 * Weighted scoring:
 *   Risk Brain        30%
 *   Fall Risk         15%
 *   Wound Risk        15%
 *   Medication Risk   10%
 *   Nutrition Risk    10%
 *   Turning Risk      10%
 *   Mental Health     10%
 *
 * Priority: 1 = EMERGENCY, 2 = HIGH, 3 = MEDIUM, 4 = LOW
 */

import type { RiskBrainResult } from "../lib/server/riskBrainV2"
import type { MedicationBrainResult } from "./medicationBrain"
import type { NutritionBrainResult } from "./nutritionBrain"
import type { TurningBrainResult } from "./turningBrain"
import type { FallPreventionBrainResult } from "./fallPreventionBrain"
import type { MentalHealthBrainResult } from "./mentalHealthBrain"

export type CoordinatorPriority = 1 | 2 | 3 | 4

export type OverallRiskLevel = "EMERGENCY" | "HIGH" | "MEDIUM" | "LOW"

export type WoundCareBrainResult = {
  woundRisk: "LOW" | "MEDIUM" | "HIGH"
  reasons?: string[]
  nursingActions?: string[]
  doctorReview?: "YES" | "NO"
}

export type MasterCoordinatorPatient = {
  name?: string | null
  patientName?: string | null
  room?: string | null
}

export type MasterCoordinatorBrainInput = {
  patient?: MasterCoordinatorPatient | null
  riskBrain?: RiskBrainResult | null
  nutritionBrain?: NutritionBrainResult | null
  medicationBrain?: MedicationBrainResult | null
  turningBrain?: TurningBrainResult | null
  woundCareBrain?: WoundCareBrainResult | null
  fallPreventionBrain?: FallPreventionBrainResult | null
  mentalHealthBrain?: MentalHealthBrainResult | null
}

export type MasterCoordinatorBrainResult = {
  overallRiskLevel: OverallRiskLevel
  overallRiskScore: number
  priority: CoordinatorPriority
  topProblems: string[]
  nursingPriorityActions: string[]
  doctorReviewRequired: "YES" | "NO"
  familyUpdateRequired: "YES" | "NO" | "RECOMMENDED"
  nextReviewTime: string
  nursingSummary: string
}

type RiskLevel = OverallRiskLevel | "LOW" | "MEDIUM" | "HIGH"

const WEIGHTS = {
  riskBrain: 0.3,
  fallPrevention: 0.15,
  woundCare: 0.15,
  medication: 0.1,
  nutrition: 0.1,
  turning: 0.1,
  mentalHealth: 0.1,
} as const

const LEVEL_RANK: Record<OverallRiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  EMERGENCY: 3,
}

const LEVEL_SCORE: Record<OverallRiskLevel, number> = {
  LOW: 0,
  MEDIUM: 45,
  HIGH: 80,
  EMERGENCY: 100,
}

const PRIORITY_MAP: Record<OverallRiskLevel, CoordinatorPriority> = {
  EMERGENCY: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
}

const REVIEW_MINUTES: Record<string, number> = {
  immediately: 0,
  "30 minutes": 30,
  "1 hour": 60,
  "2 hours": 120,
  routine: 480,
}

function normalizeLevel(value?: string | null): OverallRiskLevel {
  const v = String(value ?? "")
    .trim()
    .toUpperCase()
  if (v === "EMERGENCY") return "EMERGENCY"
  if (v === "HIGH") return "HIGH"
  if (v === "MEDIUM") return "MEDIUM"
  return "LOW"
}

function maxLevel(current: OverallRiskLevel, next: RiskLevel | string | null | undefined): OverallRiskLevel {
  const normalized = normalizeLevel(next)
  return LEVEL_RANK[normalized] > LEVEL_RANK[current] ? normalized : current
}

function levelToScore(level: RiskLevel | string | null | undefined): number {
  return LEVEL_SCORE[normalizeLevel(level)]
}

function patientLabel(patient?: MasterCoordinatorPatient | null): { name: string; room: string } {
  const name = String(patient?.name ?? patient?.patientName ?? "").trim() || "Unknown"
  const room = String(patient?.room ?? "").trim()
  return { name, room }
}

function nutritionLevel(result?: NutritionBrainResult | null): OverallRiskLevel {
  if (!result) return "LOW"
  return maxLevel("LOW", maxLevel(result.nutritionRisk, result.dehydrationRisk))
}

function mentalHealthLevel(result?: MentalHealthBrainResult | null): OverallRiskLevel {
  if (!result) return "LOW"
  return normalizeLevel(result.mentalHealthRisk)
}

function collectProblems(input: MasterCoordinatorBrainInput): string[] {
  const problems: string[] = []

  for (const reason of input.riskBrain?.reasons ?? []) {
    problems.push(`Clinical risk: ${reason}`)
  }
  for (const reason of input.fallPreventionBrain?.reasons ?? []) {
    problems.push(`Fall risk: ${reason}`)
  }
  for (const reason of input.woundCareBrain?.reasons ?? []) {
    problems.push(`Wound care: ${reason}`)
  }
  for (const reason of input.medicationBrain?.reasons ?? []) {
    problems.push(`Medication: ${reason}`)
  }
  for (const reason of input.nutritionBrain?.reasons ?? []) {
    problems.push(`Nutrition: ${reason}`)
  }
  for (const reason of input.turningBrain?.reasons ?? []) {
    problems.push(`Turning: ${reason}`)
  }
  if (input.turningBrain?.turningOverdue) {
    problems.push("Turning: Repositioning overdue")
  }
  for (const reason of input.mentalHealthBrain?.reasons ?? []) {
    problems.push(`Mental health: ${reason}`)
  }

  return [...new Set(problems)]
}

function scoreComponent(score: number, weight: number): number {
  return score * weight
}

function computeOverallScore(input: MasterCoordinatorBrainInput): number {
  const riskScore = input.riskBrain?.riskScore ?? levelToScore(input.riskBrain?.riskLevel)
  const fallScore = levelToScore(input.fallPreventionBrain?.fallRisk)
  const woundScore = levelToScore(input.woundCareBrain?.woundRisk)
  const medicationScore = levelToScore(input.medicationBrain?.medicationRisk)
  const nutritionScore = levelToScore(nutritionLevel(input.nutritionBrain))
  const turningScore = levelToScore(input.turningBrain?.pressureSoreRisk)
  const mentalScore = levelToScore(mentalHealthLevel(input.mentalHealthBrain))

  const weighted =
    scoreComponent(riskScore, WEIGHTS.riskBrain) +
    scoreComponent(fallScore, WEIGHTS.fallPrevention) +
    scoreComponent(woundScore, WEIGHTS.woundCare) +
    scoreComponent(medicationScore, WEIGHTS.medication) +
    scoreComponent(nutritionScore, WEIGHTS.nutrition) +
    scoreComponent(turningScore, WEIGHTS.turning) +
    scoreComponent(mentalScore, WEIGHTS.mentalHealth)

  return Math.round(Math.min(100, Math.max(0, weighted)))
}

function computeOverallLevel(input: MasterCoordinatorBrainInput, score: number): OverallRiskLevel {
  let level: OverallRiskLevel = "LOW"

  level = maxLevel(level, input.riskBrain?.riskLevel)
  level = maxLevel(level, input.fallPreventionBrain?.fallRisk)
  level = maxLevel(level, input.woundCareBrain?.woundRisk)
  level = maxLevel(level, input.medicationBrain?.medicationRisk)
  level = maxLevel(level, nutritionLevel(input.nutritionBrain))
  level = maxLevel(level, input.turningBrain?.pressureSoreRisk)
  level = maxLevel(level, mentalHealthLevel(input.mentalHealthBrain))

  if (score >= 85) level = maxLevel(level, "EMERGENCY")
  else if (score >= 60) level = maxLevel(level, "HIGH")
  else if (score >= 30) level = maxLevel(level, "MEDIUM")

  return level
}

function mergeFamilyUpdate(input: MasterCoordinatorBrainInput): "YES" | "NO" | "RECOMMENDED" {
  const values = [input.riskBrain?.familyUpdate, input.nutritionBrain?.familyUpdate].filter(Boolean) as Array<
    "YES" | "NO" | "RECOMMENDED"
  >

  if (values.includes("YES")) return "YES"
  if (values.includes("RECOMMENDED")) return "RECOMMENDED"
  return "NO"
}

function mergeDoctorReview(input: MasterCoordinatorBrainInput, overallLevel: OverallRiskLevel): "YES" | "NO" {
  if (overallLevel === "EMERGENCY" || overallLevel === "HIGH") return "YES"

  const flags = [
    input.riskBrain?.doctorReview,
    input.nutritionBrain?.doctorReview,
    input.medicationBrain?.doctorReview,
    input.fallPreventionBrain?.doctorReview,
    input.woundCareBrain?.doctorReview,
    input.mentalHealthBrain?.doctorReview,
  ]

  return flags.some((flag) => flag === "YES") ? "YES" : "NO"
}

function parseReviewMinutes(value?: string | null): number | null {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
  if (!text) return null
  if (text.includes("immediately") || text.includes("now")) return 0

  for (const [label, minutes] of Object.entries(REVIEW_MINUTES)) {
    if (text.includes(label)) return minutes
  }

  const hm = /(\d+)\s*(?:min(?:ute)?s?|mins?|m)\b/.exec(text)
  if (hm) return Number(hm[1])

  const hr = /(\d+)\s*h(?:ours?|rs?)?\b/.exec(text)
  if (hr) return Number(hr[1]) * 60

  return null
}

function computeNextReviewTime(input: MasterCoordinatorBrainInput, overallLevel: OverallRiskLevel): string {
  const candidates: Array<{ label: string; minutes: number | null }> = [
    { label: input.riskBrain?.recheckTime ?? "", minutes: parseReviewMinutes(input.riskBrain?.recheckTime) },
    {
      label: input.turningBrain?.turningOverdue ? "2 hours" : "",
      minutes: input.turningBrain?.turningOverdue ? 120 : null,
    },
  ]

  if (overallLevel === "EMERGENCY") return "Immediately"
  if (overallLevel === "HIGH") candidates.push({ label: "30 minutes", minutes: 30 })
  if (overallLevel === "MEDIUM") candidates.push({ label: "1 hour", minutes: 60 })

  const valid = candidates.filter((item) => item.minutes != null) as Array<{ label: string; minutes: number }>
  if (!valid.length) return overallLevel === "LOW" ? "Routine (next shift)" : "1 hour"

  valid.sort((a, b) => a.minutes - b.minutes)
  return valid[0].label || "1 hour"
}

const URGENT_ACTION_PATTERNS = [
  /call doctor immediately/i,
  /recheck bp immediately/i,
  /1:1 supervision/i,
  /remove harmful items/i,
  /continuous monitoring/i,
]

function prioritizeActions(actions: string[]): string[] {
  const unique = [...new Set(actions.map((action) => action.trim()).filter(Boolean))]
  const urgent: string[] = []
  const standard: string[] = []

  for (const action of unique) {
    if (URGENT_ACTION_PATTERNS.some((pattern) => pattern.test(action))) urgent.push(action)
    else standard.push(action)
  }

  const prioritized = [...urgent, ...standard]
  if (!prioritized.includes("Inform nurse in charge") && prioritized.length > 0) {
    prioritized.push("Inform nurse in charge")
  }

  return [...new Set(prioritized)].slice(0, 10)
}

function collectActions(input: MasterCoordinatorBrainInput, overallLevel: OverallRiskLevel): string[] {
  const actions: string[] = []

  for (const list of [
    input.riskBrain?.nursingActions,
    input.fallPreventionBrain?.nursingActions,
    input.woundCareBrain?.nursingActions,
    input.medicationBrain?.nursingActions,
    input.nutritionBrain?.nursingActions,
    input.turningBrain?.nursingActions,
    input.mentalHealthBrain?.nursingActions,
  ]) {
    if (list) actions.push(...list)
  }

  if (overallLevel === "EMERGENCY") {
    actions.unshift("Call doctor immediately", "Inform nurse in charge", "Continuous monitoring until stable")
  } else if (overallLevel === "HIGH") {
    actions.push("Doctor review recommended", "Inform nurse in charge")
  }

  return prioritizeActions(actions)
}

function buildNursingSummary(input: {
  name: string
  room: string
  overallRiskLevel: OverallRiskLevel
  overallRiskScore: number
  priority: CoordinatorPriority
  topProblems: string[]
  nursingPriorityActions: string[]
  doctorReviewRequired: "YES" | "NO"
  familyUpdateRequired: "YES" | "NO" | "RECOMMENDED"
  nextReviewTime: string
}): string {
  const roomPhrase = input.room ? ` in Room ${input.room}` : ""
  const problemText =
    input.topProblems.length > 0
      ? input.topProblems
          .slice(0, 4)
          .map((problem) => problem.replace(/^(Clinical risk|Fall risk|Wound care|Medication|Nutrition|Turning|Mental health):\s*/i, ""))
          .join("; ")
      : "no acute concerns identified"

  const actionText =
    input.nursingPriorityActions.length > 0
      ? input.nursingPriorityActions.slice(0, 4).join("; ")
      : "continue routine monitoring"

  const doctorText = input.doctorReviewRequired === "YES" ? "Doctor review required." : "No immediate doctor review required."
  const familyText =
    input.familyUpdateRequired === "YES"
      ? "Family update required."
      : input.familyUpdateRequired === "RECOMMENDED"
        ? "Family update recommended."
        : ""

  return [
    `${input.name}${roomPhrase} — ${input.overallRiskLevel} overall risk (score ${input.overallRiskScore}, priority ${input.priority}).`,
    `Top concerns: ${problemText}.`,
    `Priority actions: ${actionText}.`,
    doctorText,
    familyText,
    `Next review: ${input.nextReviewTime}.`,
  ]
    .filter(Boolean)
    .join(" ")
}

/** Coordinate all brain outputs into one master nursing assessment. */
export function runMasterCoordinatorBrain(
  input: MasterCoordinatorBrainInput,
): MasterCoordinatorBrainResult {
  const { name, room } = patientLabel(input.patient)
  const overallRiskScore = computeOverallScore(input)
  const overallRiskLevel = computeOverallLevel(input, overallRiskScore)
  const priority = PRIORITY_MAP[overallRiskLevel]
  const topProblems = collectProblems(input).slice(0, 8)
  const doctorReviewRequired = mergeDoctorReview(input, overallRiskLevel)
  const familyUpdateRequired = mergeFamilyUpdate(input)
  const nextReviewTime = computeNextReviewTime(input, overallRiskLevel)
  const nursingPriorityActions = collectActions(input, overallRiskLevel)

  const nursingSummary = buildNursingSummary({
    name,
    room,
    overallRiskLevel,
    overallRiskScore,
    priority,
    topProblems,
    nursingPriorityActions,
    doctorReviewRequired,
    familyUpdateRequired,
    nextReviewTime,
  })

  return {
    overallRiskLevel,
    overallRiskScore,
    priority,
    topProblems,
    nursingPriorityActions,
    doctorReviewRequired,
    familyUpdateRequired,
    nextReviewTime,
    nursingSummary,
  }
}
