/**
 * Medication Brain — medication administration risk assessment.
 *
 * Rules:
 *   status = missed                         → HIGH, missedMedication true
 *   refused                                 → MEDIUM
 *   vomited after medication                → HIGH
 *   allergic reaction / rash / breathing    → EMERGENCY alert (medicationRisk HIGH)
 *   delayed > 1 hour                        → MEDIUM
 *   delayed > 2 hours                       → HIGH
 */

export type MedicationRisk = "LOW" | "MEDIUM" | "HIGH"

export type MedicationBrainInput = {
  room?: string | null
  patientName?: string | null
  medicationName?: string | null
  scheduledTime?: string | null
  givenTime?: string | null
  status?: string | null
  reaction?: string | null
  refused?: boolean | string | null
  vomited?: boolean | string | null
}

export type MedicationBrainResult = {
  medicationRisk: MedicationRisk
  missedMedication: boolean
  reasons: string[]
  nursingActions: string[]
  doctorReview: "YES" | "NO"
  alertMessage: string
  telegramReply: string
}

const ONE_HOUR_MS = 60 * 60 * 1000
const TWO_HOURS_MS = 2 * ONE_HOUR_MS

const SEVERITY_RANK: Record<MedicationRisk, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 }

function isTruthy(value: boolean | string | null | undefined): boolean {
  if (value === true) return true
  if (typeof value === "string") return /^(true|yes|1|y)$/i.test(value.trim())
  return false
}

function normalizeStatus(status?: string | null): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
}

function parseTime(value?: string | null): Date | null {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null

  const direct = new Date(trimmed)
  if (Number.isFinite(direct.getTime())) return direct

  const today = new Date()
  const hm = /^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i.exec(trimmed)
  if (hm) {
    let hours = Number(hm[1])
    const minutes = Number(hm[2])
    const meridiem = hm[3]?.toLowerCase()
    if (meridiem === "pm" && hours < 12) hours += 12
    if (meridiem === "am" && hours === 12) hours = 0
    const d = new Date(today)
    d.setHours(hours, minutes, 0, 0)
    return d
  }

  return null
}

function delayMs(scheduledTime?: string | null, givenTime?: string | null): number | null {
  const scheduled = parseTime(scheduledTime)
  const given = parseTime(givenTime)
  if (!scheduled || !given) return null
  return given.getTime() - scheduled.getTime()
}

function isEmergencyReaction(reaction?: string | null): boolean {
  const r = String(reaction ?? "").toLowerCase()
  if (!r) return false
  return (
    /\ballergic\b|\banaphylaxis\b|\brash\b|\bhives\b|\burticaria\b|\bbreathing\s+difficult/.test(r) ||
    /\bshortness\s+of\s+breath\b|\bsob\b|\bwheez/.test(r) ||
    /过敏|皮疹|呼吸困难|呼吸困難/.test(String(reaction ?? ""))
  )
}

function isRefused(input: MedicationBrainInput): boolean {
  if (isTruthy(input.refused)) return true
  const status = normalizeStatus(input.status)
  return status === "refused" || status === "declined" || status === "rejected"
}

function maxRisk(current: MedicationRisk, next: MedicationRisk): MedicationRisk {
  return SEVERITY_RANK[next] > SEVERITY_RANK[current] ? next : current
}

function isMissed(input: MedicationBrainInput): boolean {
  const status = normalizeStatus(input.status)
  return status === "missed" || status === "not given" || status === "skipped"
}

function isVomited(input: MedicationBrainInput): boolean {
  if (isTruthy(input.vomited)) return true
  const status = normalizeStatus(input.status)
  const reaction = String(input.reaction ?? "").toLowerCase()
  return status === "vomited" || /\bvomit/.test(reaction)
}

function medicationShortLabel(name: string): string | null {
  const n = name.trim().toLowerCase()
  if (!n) return null
  if (/\bblood\s+pressure\b|\bbp\b/.test(n) && /\btablet\b|\bpill\b|\bmed(?:ication)?\b/.test(n)) return "BP tablet"
  if (/\bbp\b/.test(n)) return "BP medication"
  if (/\btablet\b/.test(n)) return name.replace(/\btablet\b/i, "tablet").trim()
  return name.trim()
}

function buildMissedReasons(missed: boolean, medicationName: string): string[] {
  if (!missed) return []
  const reasons = ["Medication missed"]
  const label = medicationShortLabel(medicationName)
  if (label) reasons.push(`${label} not given`)
  return reasons
}

function buildNursingActions(risk: MedicationRisk, input: {
  missed: boolean
  refused: boolean
  emergencyReaction: boolean
  delayed: boolean
}): string[] {
  if (risk === "LOW") return ["Continue routine medication monitoring"]

  const actions: string[] = ["Inform nurse in charge"]

  if (input.missed || input.refused || input.delayed) {
    actions.push("Document reason")
  }

  actions.push("Recheck patient condition")

  if (input.emergencyReaction) {
    actions.push("Call doctor immediately")
    actions.push("Monitor airway and breathing")
  } else if (risk === "HIGH") {
    actions.push("Doctor review recommended")
  }

  return [...new Set(actions)]
}

function buildAlertMessage(
  risk: MedicationRisk,
  emergencyReaction: boolean,
  reasons: string[],
  patientName: string,
  room: string,
  medicationName: string,
): string {
  if (risk === "LOW") return ""

  const header = emergencyReaction
    ? "🚨 MEDICATION EMERGENCY"
    : risk === "HIGH"
      ? "🔴 HIGH MEDICATION RISK"
      : "🟡 MEDIUM MEDICATION RISK"

  const lines = [
    header,
    `Patient: ${patientName || "Unknown"}`,
    `Room: ${room || "—"}`,
  ]
  if (medicationName) lines.push(`Medication: ${medicationName}`)
  if (reasons.length > 0) {
    lines.push("Reasons:")
    reasons.forEach((reason, index) => lines.push(`${index + 1}. ${reason}`))
  }
  return lines.join("\n")
}

/** Telegram-friendly action list for medication alerts. */
export function formatTelegramMedicationActions(result: Omit<MedicationBrainResult, "telegramReply">): string[] {
  if (result.medicationRisk === "LOW") return result.nursingActions

  if (result.medicationRisk === "HIGH" && result.missedMedication && result.doctorReview === "YES") {
    return ["Inform nurse in charge", "Document reason", "Doctor review recommended"]
  }

  const actions = ["Inform nurse in charge"]
  if (result.nursingActions.includes("Document reason")) actions.push("Document reason")
  if (result.doctorReview === "YES") actions.push("Doctor review recommended")
  else if (result.nursingActions.includes("Recheck patient condition")) actions.push("Recheck patient condition")
  if (result.nursingActions.includes("Call doctor immediately")) actions.push("Call doctor immediately")
  return [...new Set(actions)]
}

/** Format Telegram reply for medication assessment. */
export function formatTelegramMedicationReply(
  result: Omit<MedicationBrainResult, "telegramReply">,
  patientName: string,
  room: string,
): string {
  const actions = formatTelegramMedicationActions(result)
  const lines = [
    "✅ Medication assessment saved",
    "",
    `Patient: ${patientName || "Unknown"}`,
    `Room: ${room || "—"}`,
    `Medication Risk: ${result.medicationRisk}`,
    `Missed Medication: ${result.missedMedication ? "YES" : "NO"}`,
  ]

  if (result.reasons.length > 0) {
    lines.push("Reason:")
    result.reasons.forEach((reason, index) => lines.push(`${index + 1}. ${reason}`))
  }

  if (actions.length > 0) {
    lines.push("Actions:")
    actions.forEach((action, index) => lines.push(`${index + 1}. ${action}`))
  }

  if (result.alertMessage) lines.push("", result.alertMessage)
  return lines.join("\n")
}

/** Assess medication administration risk for one record. */
export function analyzeMedication(record: MedicationBrainInput, now = new Date()): MedicationBrainResult {
  const room = String(record.room ?? "").trim()
  const patientName = String(record.patientName ?? "").trim()
  const medicationName = String(record.medicationName ?? "").trim()

  const missed = isMissed(record)
  const refused = isRefused(record)
  const vomited = isVomited(record)
  const emergencyReaction = isEmergencyReaction(record.reaction)

  let medicationRisk: MedicationRisk = "LOW"
  const reasons: string[] = []

  if (missed) {
    medicationRisk = "HIGH"
    reasons.push(...buildMissedReasons(true, medicationName))
  }

  if (refused) {
    medicationRisk = maxRisk(medicationRisk, "MEDIUM")
    reasons.push("Medication refused")
  }

  if (vomited) {
    medicationRisk = maxRisk(medicationRisk, "HIGH")
    reasons.push("Vomiting after medication")
  }

  if (emergencyReaction) {
    medicationRisk = "HIGH"
    const reactionText = String(record.reaction ?? "").trim()
    reasons.push(reactionText ? `Adverse reaction: ${reactionText}` : "Allergic reaction / adverse reaction")
  }

  const delay = delayMs(record.scheduledTime, record.givenTime ?? now.toISOString())
  let delayed = false
  if (delay != null && delay > ONE_HOUR_MS && !missed) {
    delayed = true
    const hours = Math.round((delay / ONE_HOUR_MS) * 10) / 10
    if (delay > TWO_HOURS_MS) {
      medicationRisk = maxRisk(medicationRisk, "HIGH")
      reasons.push(`Medication delayed ${hours} hours (>2 hours)`)
    } else {
      medicationRisk = maxRisk(medicationRisk, "MEDIUM")
      reasons.push(`Medication delayed ${hours} hours (>1 hour)`)
    }
  }

  const doctorReview: "YES" | "NO" =
    medicationRisk === "HIGH" || emergencyReaction ? "YES" : "NO"

  const nursingActions = buildNursingActions(medicationRisk, {
    missed,
    refused,
    emergencyReaction,
    delayed,
  })

  const alertMessage = buildAlertMessage(
    medicationRisk,
    emergencyReaction,
    reasons,
    patientName,
    room,
    medicationName,
  )

  const core = {
    medicationRisk,
    missedMedication: missed,
    reasons,
    nursingActions,
    doctorReview,
    alertMessage,
  }

  return {
    ...core,
    telegramReply: formatTelegramMedicationReply(core, patientName, room),
  }
}
