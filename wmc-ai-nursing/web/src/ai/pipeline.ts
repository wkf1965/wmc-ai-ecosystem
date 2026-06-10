/**
 * AI Brain Pipeline — chains all brain modules for one nursing input.
 *
 * Telegram message → nlpBrain → riskBrain → alertBrain
 *                    → doctorReviewBrain → familyUpdateBrain
 */

import { runNlpBrain, type NlpBrainResult } from "./nlpBrain"
import { runRiskBrain, type RiskBrainInput, type RiskBrainResult } from "./riskBrain"
import { runAlertBrain, type AlertBrainResult } from "./alertBrain"
import { runDoctorReviewBrain, type DoctorReviewBrainResult } from "./doctorReviewBrain"
import { runFamilyUpdateBrain, type FamilyUpdateBrainResult } from "./familyUpdateBrain"

export type AiBrainPipelineInput = RiskBrainInput & {
  /** Raw Telegram / nursing message text */
  text?: string | null
  /** ISO timestamp for doctor queue item */
  requestedAt?: string | null
}

export type AiBrainPipelineResult = {
  nlp: NlpBrainResult
  risk: RiskBrainResult
  alert: AlertBrainResult
  doctorReview: DoctorReviewBrainResult
  familyUpdate: FamilyUpdateBrainResult
  patientName: string
  room: string
  riskLevel: RiskBrainResult["riskLevel"]
  riskScore: number
  reasons: string[]
  actions: string[]
  doctorReviewFlag: "YES" | "NO"
  doctorQueueStatus: "PENDING" | null
  familyUpdateFlag: "YES" | "NO" | "RECOMMENDED"
  familyMessage: string
  recheckTime: string
  telegramReply: string
}

function riskLevelLabel(level: RiskBrainResult["riskLevel"]): string {
  switch (level) {
    case "EMERGENCY":
      return "🚨 EMERGENCY"
    case "HIGH":
      return "🔴 HIGH"
    case "MEDIUM":
      return "🟡 MEDIUM"
    default:
      return "🟢 LOW"
  }
}

/** Format one Telegram reply from pipeline output. */
export function formatTelegramBrainReply(result: Omit<AiBrainPipelineResult, "telegramReply">): string {
  const lines = [
    "✅ Nursing record saved",
    "",
    `Patient: ${result.patientName || "Unknown"}`,
    `Room: ${result.room || "—"}`,
    `Risk Level: ${riskLevelLabel(result.riskLevel)}`,
    `Risk Score: ${result.riskScore}`,
  ]

  if (result.reasons.length > 0) {
    lines.push("Reasons:")
    result.reasons.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
  }

  if (result.actions.length > 0) {
    lines.push("Actions:")
    result.actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
  }

  lines.push(`Doctor Review: ${result.doctorReviewFlag}`)
  if (result.doctorQueueStatus) {
    lines.push(`Doctor Queue: ${result.doctorQueueStatus}`)
  }
  lines.push(`Family Update: ${result.familyUpdateFlag}`)
  if (result.familyMessage) {
    lines.push("Family Message:", result.familyMessage)
  }
  lines.push(`Recheck Time: ${result.recheckTime}`)

  return lines.join("\n")
}

/** Run the full AI Brain pipeline on one nursing / vital input. */
export function runAiBrainPipeline(input: AiBrainPipelineInput): AiBrainPipelineResult {
  const text = String(input.text ?? input.note ?? input.remark ?? input.remarks ?? "").trim()
  const requestedAt = input.requestedAt ?? new Date().toISOString()

  const nlp = runNlpBrain({ text })

  const bloodPressure = String(input.bloodPressure ?? input.bp ?? nlp.bloodPressure ?? "").trim()
  const pulse = input.pulse ?? nlp.pulse
  const spo2 = input.spo2 ?? nlp.spo2
  const temperature = input.temperature ?? nlp.temperature

  const risk = runRiskBrain({
    ...input,
    note: text || input.note,
    room: input.room ?? nlp.room,
    patientName: input.patientName ?? input.name ?? nlp.patientName,
    bloodPressure: bloodPressure || null,
    pulse,
    spo2,
    temperature,
    nutrition: input.nutrition ?? input.appetite ?? nlp.nutrition,
    mobility: input.mobility ?? nlp.mobility,
    conditions:
      Array.isArray(input.conditions) && input.conditions.length > 0 ? input.conditions : nlp.conditions,
  })

  const patientName = String(input.patientName ?? input.name ?? nlp.patientName ?? "").trim()
  const room = String(input.room ?? nlp.room ?? "").trim()

  const alert = runAlertBrain({ risk, patientName, room })
  const doctorReview = runDoctorReviewBrain({
    riskLevel: risk.riskLevel,
    categories: risk.categories,
    room,
    patientName,
    reasons: risk.reasons,
    vitals: {
      bloodPressure,
      pulse: pulse != null && pulse !== "" ? String(pulse) : "",
      spo2: spo2 != null && spo2 !== "" ? String(spo2) : "",
      temperature: temperature != null && temperature !== "" ? String(temperature) : "",
    },
    requestedAt,
  })
  const familyUpdate = runFamilyUpdateBrain({
    riskLevel: risk.riskLevel,
    categories: risk.categories,
    patientName,
    room,
    reasons: risk.reasons,
    nursingActions: alert.actions,
    doctorReview: doctorReview.doctorReview,
  })

  const core = {
    nlp,
    risk,
    alert,
    doctorReview,
    familyUpdate,
    patientName,
    room,
    riskLevel: risk.riskLevel,
    riskScore: risk.riskScore,
    reasons: risk.reasons,
    actions: alert.actions,
    doctorReviewFlag: doctorReview.doctorReview,
    doctorQueueStatus: doctorReview.queueStatus,
    familyUpdateFlag: familyUpdate.familyUpdate,
    familyMessage: familyUpdate.familyMessage,
    recheckTime: risk.recheckTime,
  }

  return {
    ...core,
    telegramReply: formatTelegramBrainReply(core),
  }
}
