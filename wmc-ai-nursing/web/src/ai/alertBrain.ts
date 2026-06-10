/**
 * Alert Brain — escalation decisions and alert messages for HIGH / EMERGENCY risk.
 */

import type { RiskBrainResult } from "../lib/server/riskBrainV2"

export type AlertPriority = "HIGH" | "URGENT"

export type AlertBrainInput = {
  risk: Pick<RiskBrainResult, "riskLevel" | "reasons" | "nursingActions" | "alertMessage">
  patientName?: string | null
  room?: string | null
}

export type AlertBrainResult = {
  severity: RiskBrainResult["riskLevel"]
  alertMessage: string
  reasons: string[]
  actions: string[]
  sendTelegramAlert: boolean
  notifyDoctor: boolean
  notifyFamily: "yes" | "recommended" | "no"
  priority: AlertPriority | null
}

function buildAlertMessage(
  riskLevel: RiskBrainResult["riskLevel"],
  reasons: string[],
  actions: string[],
  patientName: string,
  room: string,
): string {
  const header =
    riskLevel === "EMERGENCY"
      ? "🚨 EMERGENCY ALERT"
      : riskLevel === "HIGH"
        ? "🔴 HIGH RISK ALERT"
        : "🟡 MEDIUM RISK ALERT"

  const lines = [
    header,
    `Patient: ${patientName || "Unknown"}`,
    `Room: ${room || "—"}`,
    "Reasons:",
    ...reasons.map((r, i) => `${i + 1}. ${r}`),
    "",
    "Actions:",
    ...actions.map((a, i) => `${i + 1}. ${a}`),
  ]
  return lines.join("\n")
}

/** Decide alert escalation and build the clinical alert payload. */
export function runAlertBrain(input: AlertBrainInput): AlertBrainResult {
  const { risk, patientName, room } = input
  const reasons = risk.reasons ?? []
  const actions = risk.nursingActions ?? []
  const patient = String(patientName ?? "").trim()
  const roomNo = String(room ?? "").trim()

  const isHigh = risk.riskLevel === "HIGH"
  const isEmergency = risk.riskLevel === "EMERGENCY"
  const escalate = isHigh || isEmergency

  const alertMessage =
    risk.alertMessage ||
    (escalate || risk.riskLevel === "MEDIUM"
      ? buildAlertMessage(risk.riskLevel, reasons, actions, patient, roomNo)
      : "")

  return {
    severity: risk.riskLevel,
    alertMessage,
    reasons,
    actions,
    sendTelegramAlert: escalate,
    notifyDoctor: escalate,
    notifyFamily: escalate ? "recommended" : "no",
    priority: isEmergency ? "URGENT" : isHigh ? "HIGH" : null,
  }
}
