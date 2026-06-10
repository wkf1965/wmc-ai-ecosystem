/**
 * Turning Brain — pressure sore / repositioning risk assessment.
 *
 * Rules:
 *   Bedridden              → HIGH pressure sore risk
 *   Weak mobility          → MEDIUM (HIGH if overdue or with redness/wound)
 *   Redness                → HIGH
 *   Wound                  → HIGH
 *   > 2 h since last turn  → turningOverdue
 *   Overdue + bedridden    → HIGH alert
 */

export type PressureSoreRisk = "LOW" | "MEDIUM" | "HIGH"

export type TurningBrainInput = {
  room?: string | null
  patientName?: string | null
  mobility?: string | null
  lastTurnedAt?: string | null
  skinCondition?: string | null
  redness?: boolean | string | null
  /** Body site for redness, e.g. "sacrum" */
  rednessSite?: string | null
  wound?: boolean | string | null
  bedridden?: boolean | string | null
}

export type TurningBrainResult = {
  pressureSoreRisk: PressureSoreRisk
  turningOverdue: boolean
  reasons: string[]
  nursingActions: string[]
  nextTurnTime: string
  alertMessage: string
  telegramReply: string
}

const TURNING_INTERVAL_MS = 2 * 60 * 60 * 1000

function isTruthy(value: boolean | string | null | undefined): boolean {
  if (value === true) return true
  if (typeof value === "string") return /^(true|yes|1|present|noted|positive|overdue|red|wound)/i.test(value.trim())
  return false
}

function isBedridden(input: TurningBrainInput): boolean {
  if (isTruthy(input.bedridden)) return true
  const m = String(input.mobility ?? "").trim().toLowerCase()
  return /\bbed\s?bound\b|\bbedridden\b|\bterlantar\b|卧床|臥床/.test(m)
}

function isWeakMobility(mobility?: string | null): boolean {
  const m = String(mobility ?? "").trim().toLowerCase()
  if (!m) return false
  return (
    m === "weak" ||
    /\bweak(?:ness)?\b|\bunsteady\b|\bneeds?\s+assist/.test(m) ||
    /虚弱|虛弱|乏力|无力|無力/.test(m)
  )
}

function hasRedness(input: TurningBrainInput): boolean {
  if (isTruthy(input.redness)) return true
  const skin = String(input.skinCondition ?? "").toLowerCase()
  return /\bred(ness)?\b|\berythema\b|\bpressure\s+mark/.test(skin) || /发红|發紅|红印|紅印/.test(skin)
}

function hasWound(input: TurningBrainInput): boolean {
  if (isTruthy(input.wound)) return true
  const skin = String(input.skinCondition ?? "").toLowerCase()
  return /\bwound\b|\bulcer\b|\bbroken\s+skin\b|\bluka\b/.test(skin) || /伤口|傷口|褥疮|褥瘡/.test(skin)
}

function parseLastTurnedAt(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d : null
}

function isTurningOverdue(lastTurnedAt: Date | null, now: Date): boolean {
  if (!lastTurnedAt) return false
  return now.getTime() - lastTurnedAt.getTime() > TURNING_INTERVAL_MS
}

function computeNextTurnTime(lastTurnedAt: Date | null, now: Date): string {
  const base = lastTurnedAt ?? now
  return new Date(base.getTime() + TURNING_INTERVAL_MS).toISOString()
}

function buildAlertMessage(
  risk: PressureSoreRisk,
  turningOverdue: boolean,
  bedridden: boolean,
  reasons: string[],
  patientName: string,
  room: string,
): string {
  if (risk === "LOW" && !turningOverdue) return ""

  const header =
    risk === "HIGH" || (turningOverdue && bedridden)
      ? "🔴 HIGH PRESSURE SORE RISK"
      : "🟡 TURNING ATTENTION NEEDED"

  const lines = [
    header,
    `Patient: ${patientName || "Unknown"}`,
    `Room: ${room || "—"}`,
    "Reasons:",
    ...reasons.map((r, i) => `${i + 1}. ${r}`),
  ]
  return lines.join("\n")
}

function buildNursingActions(input: {
  pressureSoreRisk: PressureSoreRisk
  turningOverdue: boolean
  bedridden: boolean
  redness: boolean
  wound: boolean
  rednessSite?: string | null
}): string[] {
  const actions: string[] = []
  const elevated = input.pressureSoreRisk !== "LOW" || input.turningOverdue

  if (!elevated) {
    return ["Continue routine turning schedule"]
  }

  if (input.turningOverdue) {
    actions.push("Reposition now")
  } else if (input.bedridden || input.pressureSoreRisk !== "LOW") {
    actions.push("Reposition patient")
  }

  if (input.redness) {
    const site = String(input.rednessSite ?? "").trim().toLowerCase()
    actions.push(site ? `Check ${site} redness` : "Check skin redness")
  } else if (input.bedridden || input.pressureSoreRisk === "HIGH") {
    actions.push("Check skin redness")
  }

  if (input.bedridden || input.wound || input.pressureSoreRisk === "HIGH") {
    actions.push("Apply pressure relief")
  }

  if (!input.turningOverdue && input.pressureSoreRisk !== "LOW") {
    actions.push("Document turning side")
  }

  actions.push("Recheck within 2 hours")

  return [...new Set(actions)]
}

/** Format Telegram reply for turning / pressure sore assessment. */
export function formatTelegramTurningReply(
  result: Omit<TurningBrainResult, "telegramReply">,
  patientName: string,
  room: string,
): string {
  const lines = [
    "✅ Turning assessment saved",
    "",
    `Patient: ${patientName || "Unknown"}`,
    `Room: ${room || "—"}`,
    `Pressure Sore Risk: ${result.pressureSoreRisk}`,
    `Turning Overdue: ${result.turningOverdue ? "YES" : "NO"}`,
  ]

  if (result.nursingActions.length > 0) {
    lines.push("Actions:")
    result.nursingActions.forEach((action, index) => lines.push(`${index + 1}. ${action}`))
  }

  if (result.alertMessage) {
    lines.push("", result.alertMessage)
  }

  return lines.join("\n")
}

/** Assess pressure sore / turning risk for one patient record. */
export function analyzeTurningRisk(record: TurningBrainInput, now = new Date()): TurningBrainResult {
  const room = String(record.room ?? "").trim()
  const patientName = String(record.patientName ?? "").trim()
  const lastTurned = parseLastTurnedAt(record.lastTurnedAt)
  const turningOverdue = isTurningOverdue(lastTurned, now)

  const bedridden = isBedridden(record)
  const weakMobility = isWeakMobility(record.mobility)
  const redness = hasRedness(record)
  const wound = hasWound(record)

  const reasons: string[] = []
  if (bedridden) reasons.push("Patient is bedridden")
  if (weakMobility) reasons.push("Weak mobility")
  if (redness) {
    const site = String(record.rednessSite ?? "").trim()
    reasons.push(site ? `Redness at ${site}` : "Skin redness noted")
  }
  if (wound) reasons.push("Wound present")
  if (turningOverdue) reasons.push("Turning overdue (>2 hours since last turn)")

  let pressureSoreRisk: PressureSoreRisk = "LOW"

  if (bedridden || redness || wound) {
    pressureSoreRisk = "HIGH"
  } else if (weakMobility) {
    pressureSoreRisk = turningOverdue ? "HIGH" : "MEDIUM"
  } else if (turningOverdue) {
    pressureSoreRisk = "MEDIUM"
  }

  // Explicit rule: overdue + bedridden = HIGH alert
  if (turningOverdue && bedridden) {
    pressureSoreRisk = "HIGH"
  }

  const nursingActions = buildNursingActions({
    pressureSoreRisk,
    turningOverdue,
    bedridden,
    redness,
    wound,
    rednessSite: record.rednessSite,
  })

  const nextTurnTime = computeNextTurnTime(lastTurned, now)
  const alertMessage = buildAlertMessage(pressureSoreRisk, turningOverdue, bedridden, reasons, patientName, room)

  const core = {
    pressureSoreRisk,
    turningOverdue,
    reasons,
    nursingActions,
    nextTurnTime,
    alertMessage,
  }

  return {
    ...core,
    telegramReply: formatTelegramTurningReply(core, patientName, room),
  }
}
