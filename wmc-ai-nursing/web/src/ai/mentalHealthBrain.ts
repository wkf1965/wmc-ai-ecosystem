/**
 * Mental Health Brain — mental state and behavioural risk assessment.
 *
 * Detects:
 *   agitation, aggression, wandering, anxiety, depression,
 *   hallucination, insomnia, suicidal statement
 */

export type MentalHealthRiskLevel = "LOW" | "MEDIUM" | "HIGH"

export type MentalHealthBrainInput = {
  room?: string | null
  patientName?: string | null
  agitation?: boolean | string | null
  aggression?: boolean | string | null
  wandering?: boolean | string | null
  anxiety?: boolean | string | null
  depression?: boolean | string | null
  hallucination?: boolean | string | null
  insomnia?: boolean | string | null
  suicidalStatement?: boolean | string | null
  /** Optional free-text observation for keyword detection */
  text?: string | null
}

export type MentalHealthBrainResult = {
  mentalRisk: MentalHealthRiskLevel
  behaviourRisk: MentalHealthRiskLevel
  mentalHealthRisk: MentalHealthRiskLevel
  reasons: string[]
  detected: string[]
  doctorReview: "YES" | "NO"
  nursingActions: string[]
  alertMessage: string
  telegramReply: string
}

const REASON_ORDER = [
  "Suicidal statement",
  "Hallucination",
  "Aggression",
  "Wandering",
  "Agitation",
  "Anxiety",
  "Depression",
  "Insomnia",
] as const

const SEVERITY_RANK: Record<MentalHealthRiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 }

function maxRisk(current: MentalHealthRiskLevel, next: MentalHealthRiskLevel): MentalHealthRiskLevel {
  return SEVERITY_RANK[next] > SEVERITY_RANK[current] ? next : current
}

function isTruthy(value: boolean | string | null | undefined): boolean {
  if (value === true) return true
  if (typeof value === "string") return /^(true|yes|1|y|present|noted|positive)$/i.test(value.trim())
  return false
}

function corpus(record: MentalHealthBrainInput): string {
  const parts = [
    record.text,
    record.agitation,
    record.aggression,
    record.wandering,
    record.anxiety,
    record.depression,
    record.hallucination,
    record.insomnia,
    record.suicidalStatement,
  ]
    .filter((part) => part != null && String(part).trim() !== "")
    .map((part) => String(part))
  return parts.join(" ").toLowerCase()
}

function detectAgitation(record: MentalHealthBrainInput, text: string): boolean {
  if (isTruthy(record.agitation)) return true
  return (
    /\bagitat(?:ed|ion)\b|\brestless(?:ness)?\b|\bhyperactiv/.test(text) ||
    /躁动|激越|不安/.test(text)
  )
}

function detectAggression(record: MentalHealthBrainInput, text: string): boolean {
  if (isTruthy(record.aggression)) return true
  return (
    /\baggress(?:ive|ion)\b|\bviolent\b|\bhitting\b|\bstruck\b|\bassault/.test(text) ||
    /攻击|暴力|打人/.test(text)
  )
}

function detectWandering(record: MentalHealthBrainInput, text: string): boolean {
  if (isTruthy(record.wandering)) return true
  return (
    /\bwander(?:ing)?\b|\belopement\b|\bwalk(?:ed|ing)\s+off\b|\babscond/.test(text) ||
    /游走|乱走|走失/.test(text)
  )
}

function detectAnxiety(record: MentalHealthBrainInput, text: string): boolean {
  if (isTruthy(record.anxiety)) return true
  return /\banxious\b|\banxiety\b|\bpanic(?:king)?\b|\bworried\b|\buneasy\b/.test(text) || /焦虑|紧张/.test(text)
}

function detectDepression(record: MentalHealthBrainInput, text: string): boolean {
  if (isTruthy(record.depression)) return true
  return (
    /\bdepress(?:ed|ion)\b|\blow\s+mood\b|\bwithdrawn\b|\bhopeless\b/.test(text) ||
    /抑郁|情绪低落|闷闷不乐/.test(text)
  )
}

function detectHallucination(record: MentalHealthBrainInput, text: string): boolean {
  if (isTruthy(record.hallucination)) return true
  return (
    /\bhallucinat(?:ion|ing|ed)\b|\bseeing\s+things\b|\bhearing\s+voices\b|\bparanoid\b/.test(text) ||
    /幻觉|幻听|幻视/.test(text)
  )
}

function detectInsomnia(record: MentalHealthBrainInput, text: string): boolean {
  if (isTruthy(record.insomnia)) return true
  return (
    /\binsomnia\b|\bcannot\s+sleep\b|\bcan't\s+sleep\b|\bpoor\s+sleep\b|\bsleepless/.test(text) ||
    /失眠|睡不着|难以入睡/.test(text)
  )
}

function detectSuicidalStatement(record: MentalHealthBrainInput, text: string): boolean {
  if (isTruthy(record.suicidalStatement)) return true
  return (
    /\bsuicidal\b|\bwants?\s+to\s+die\b|\bself[\s-]?harm\b|\bkill\s+(?:myself|himself|herself|themselves)\b/.test(
      text,
    ) ||
    /\bwish(?:es|ed)?\s+(?:to\s+)?die\b|\bend\s+(?:my|his|her|their)\s+life\b/.test(text) ||
    /自杀|想死|轻生/.test(text)
  )
}

function orderReasons(reasons: string[]): string[] {
  return REASON_ORDER.filter((label) => reasons.includes(label))
}

function computeMentalHealthRisk(input: {
  mentalRisk: MentalHealthRiskLevel
  behaviourRisk: MentalHealthRiskLevel
  wandering: boolean
  agitation: boolean
  insomnia: boolean
  aggression: boolean
  reasonCount: number
}): MentalHealthRiskLevel {
  let overall = maxRisk(input.mentalRisk, input.behaviourRisk)

  if (input.wandering && input.agitation) overall = "HIGH"
  if (input.reasonCount >= 3) overall = "HIGH"
  if (input.aggression) overall = "HIGH"

  return overall
}

function buildNursingActions(findings: {
  suicidalStatement: boolean
  hallucination: boolean
  aggression: boolean
  agitation: boolean
  wandering: boolean
  mentalHealthRisk: MentalHealthRiskLevel
  doctorReview: "YES" | "NO"
}): string[] {
  if (findings.mentalHealthRisk === "LOW") {
    return ["Continue routine mental health monitoring"]
  }

  const actions: string[] = []

  if (findings.suicidalStatement) {
    actions.push("1:1 supervision")
    actions.push("Remove harmful items from room")
    actions.push("Call doctor immediately")
  }

  if (findings.wandering || findings.agitation || findings.aggression || findings.mentalHealthRisk === "HIGH") {
    actions.push("Close observation")
  }

  if (findings.agitation || findings.wandering) {
    actions.push("Redirect patient")
  }

  if (findings.aggression) {
    actions.push("De-escalate and ensure staff safety")
  }

  if (findings.hallucination) {
    actions.push("Reassure patient — do not argue with delusions")
  }

  actions.push("Document behaviour")
  actions.push("Inform nurse in charge")

  if (findings.doctorReview === "YES") {
    actions.push("Doctor review recommended")
  }

  return [...new Set(actions)]
}

/** Telegram-friendly action list for mental health alerts. */
export function formatTelegramMentalHealthActions(
  result: Omit<MentalHealthBrainResult, "telegramReply">,
): string[] {
  if (result.mentalHealthRisk === "LOW") return result.nursingActions

  const actions: string[] = []

  if (result.reasons.some((r) => /suicidal/i.test(r))) {
    actions.push("1:1 supervision", "Call doctor immediately")
  }

  if (
    result.reasons.some((r) => /wandering|agitation|aggression/i.test(r)) ||
    result.mentalHealthRisk === "HIGH"
  ) {
    actions.push("Close observation")
  }

  if (result.reasons.some((r) => /agitation|wandering/i.test(r))) {
    actions.push("Redirect patient")
  }

  actions.push("Document behaviour")

  if (result.doctorReview === "YES") {
    actions.push("Doctor review recommended")
  }

  return [...new Set(actions)]
}

function buildAlertMessage(
  mentalHealthRisk: MentalHealthRiskLevel,
  reasons: string[],
  patientName: string,
  room: string,
): string {
  if (mentalHealthRisk === "LOW") return ""

  const header =
    mentalHealthRisk === "HIGH" ? "🔴 HIGH MENTAL HEALTH RISK" : "🟡 MEDIUM MENTAL HEALTH RISK"

  const lines = [
    header,
    `Patient: ${patientName || "Unknown"}`,
    `Room: ${room || "—"}`,
    `Mental Health Risk: ${mentalHealthRisk}`,
  ]

  if (reasons.length > 0) {
    lines.push("Reasons:")
    reasons.forEach((reason, index) => lines.push(`${index + 1}. ${reason}`))
  }

  return lines.join("\n")
}

/** Format Telegram reply for mental health assessment. */
export function formatTelegramMentalHealthReply(
  result: Omit<MentalHealthBrainResult, "telegramReply">,
  patientName: string,
  room: string,
): string {
  const actions = formatTelegramMentalHealthActions(result)
  const lines = [
    "✅ Mental health assessment saved",
    "",
    `Patient: ${patientName || "Unknown"}`,
    `Room: ${room || "—"}`,
    `Mental Health Risk: ${result.mentalHealthRisk}`,
  ]

  if (result.reasons.length > 0) {
    lines.push("Reasons:")
    result.reasons.forEach((reason, index) => lines.push(`${index + 1}. ${reason}`))
  }

  if (actions.length > 0) {
    lines.push("Actions:")
    actions.forEach((action, index) => lines.push(`${index + 1}. ${action}`))
  }

  if (result.alertMessage) lines.push("", result.alertMessage)
  return lines.join("\n")
}

/** Assess mental health and behavioural risk for one patient record. */
export function analyzeMentalHealth(record: MentalHealthBrainInput): MentalHealthBrainResult {
  const room = String(record.room ?? "").trim()
  const patientName = String(record.patientName ?? "").trim()
  const text = corpus(record)

  const suicidalStatement = detectSuicidalStatement(record, text)
  const hallucination = detectHallucination(record, text)
  const aggression = detectAggression(record, text)
  const agitation = detectAgitation(record, text)
  const wandering = detectWandering(record, text)
  const anxiety = detectAnxiety(record, text)
  const depression = detectDepression(record, text)
  const insomnia = detectInsomnia(record, text)

  const rawReasons: string[] = []
  if (suicidalStatement) rawReasons.push("Suicidal statement")
  if (hallucination) rawReasons.push("Hallucination")
  if (aggression) rawReasons.push("Aggression")
  if (wandering) rawReasons.push("Wandering")
  if (agitation) rawReasons.push("Agitation")
  if (anxiety) rawReasons.push("Anxiety")
  if (depression) rawReasons.push("Depression")
  if (insomnia) rawReasons.push("Insomnia")

  const reasons = orderReasons(rawReasons)

  let mentalRisk: MentalHealthRiskLevel = "LOW"
  let behaviourRisk: MentalHealthRiskLevel = "LOW"

  if (suicidalStatement) {
    mentalRisk = "HIGH"
    behaviourRisk = "HIGH"
  }

  if (hallucination) {
    mentalRisk = "HIGH"
    behaviourRisk = maxRisk(behaviourRisk, "MEDIUM")
  }

  if (depression) mentalRisk = maxRisk(mentalRisk, "MEDIUM")
  if (anxiety) mentalRisk = maxRisk(mentalRisk, "MEDIUM")
  if (insomnia) mentalRisk = maxRisk(mentalRisk, "MEDIUM")

  if (aggression) {
    behaviourRisk = "HIGH"
    mentalRisk = maxRisk(mentalRisk, "MEDIUM")
  } else if (agitation) {
    behaviourRisk = maxRisk(behaviourRisk, "MEDIUM")
  }

  if (wandering) behaviourRisk = maxRisk(behaviourRisk, "MEDIUM")

  if (agitation && aggression) behaviourRisk = "HIGH"

  const mentalHealthRisk = computeMentalHealthRisk({
    mentalRisk,
    behaviourRisk,
    wandering,
    agitation,
    insomnia,
    aggression,
    reasonCount: reasons.length,
  })

  const doctorReview: "YES" | "NO" =
    suicidalStatement ||
    hallucination ||
    aggression ||
    mentalHealthRisk === "HIGH" ||
    mentalRisk === "HIGH" ||
    behaviourRisk === "HIGH"
      ? "YES"
      : "NO"

  const nursingActions = buildNursingActions({
    suicidalStatement,
    hallucination,
    aggression,
    agitation,
    wandering,
    mentalHealthRisk,
    doctorReview,
  })

  const alertMessage = buildAlertMessage(mentalHealthRisk, reasons, patientName, room)

  const core = {
    mentalRisk,
    behaviourRisk,
    mentalHealthRisk,
    reasons,
    detected: reasons,
    doctorReview,
    nursingActions,
    alertMessage,
  }

  return {
    ...core,
    telegramReply: formatTelegramMentalHealthReply(core, patientName, room),
  }
}
