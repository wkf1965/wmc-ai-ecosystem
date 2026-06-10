/**
 * Nutrition Brain — nutrition and dehydration risk assessment.
 *
 * Rules:
 *   Poor appetite                    → HIGH nutrition risk
 *   Meal intake < 50%                → MEDIUM nutrition risk
 *   Meal intake < 25%                → HIGH nutrition risk
 *   Weight loss                      → HIGH nutrition risk
 *   Low fluid intake                 → MEDIUM dehydration risk
 *   No urine ≥ 8 hours               → HIGH dehydration risk
 *   Vomiting or diarrhea             → MEDIUM dehydration risk (HIGH if both)
 *   Dry mouth + weakness             → HIGH dehydration risk
 */

export type NutritionRiskLevel = "LOW" | "MEDIUM" | "HIGH"

export type FamilyUpdateLevel = "YES" | "NO" | "RECOMMENDED"

export type NutritionBrainInput = {
  room?: string | null
  patientName?: string | null
  appetite?: string | null
  fluidIntake?: string | number | null
  mealPercentage?: string | number | null
  weightLoss?: boolean | string | null
  vomiting?: boolean | string | null
  diarrhea?: boolean | string | null
  urineOutput?: string | null
  dryMouth?: boolean | string | null
  weakness?: boolean | string | null
}

export type NutritionBrainResult = {
  nutritionRisk: NutritionRiskLevel
  dehydrationRisk: NutritionRiskLevel
  reasons: string[]
  nursingActions: string[]
  doctorReview: "YES" | "NO"
  familyUpdate: FamilyUpdateLevel
  alertMessage: string
  telegramReply: string
}

const SEVERITY_RANK: Record<NutritionRiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 }

function maxRisk(current: NutritionRiskLevel, next: NutritionRiskLevel): NutritionRiskLevel {
  return SEVERITY_RANK[next] > SEVERITY_RANK[current] ? next : current
}

function isTruthy(value: boolean | string | null | undefined): boolean {
  if (value === true) return true
  if (typeof value === "string") return /^(true|yes|1|y|present|noted|positive)$/i.test(value.trim())
  return false
}

function isPoorAppetite(appetite?: string | null): boolean {
  const a = String(appetite ?? "")
    .trim()
    .toLowerCase()
  if (!a) return false
  return (
    /\bpoor\b|\breduced\b|\brefus|\bnot\s+eating\b|\bminimal\b|\bloss\s+of\s+appetite\b/.test(a) ||
    /食欲差|胃口差|不进食|拒食/.test(a)
  )
}

function parseMealPercentage(value?: string | number | null): number | null {
  if (value == null || value === "") return null
  if (typeof value === "number" && Number.isFinite(value)) return value

  const s = String(value).trim().toLowerCase()
  if (!s) return null

  const pct = /(\d+(?:\.\d+)?)\s*%/.exec(s) ?? /^(\d+(?:\.\d+)?)$/.exec(s)
  if (pct) return Number(pct[1])

  if (/\bless\s+than\s+25\b|\bunder\s+25\b|<\s*25\b|\bbelow\s+25\b/.test(s)) return 20
  if (/\bless\s+than\s+50\b|\bunder\s+50\b|<\s*50\b|\bbelow\s+50\b/.test(s)) return 40

  return null
}

function isWeightLoss(value?: boolean | string | null): boolean {
  if (isTruthy(value)) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return /\bweight\s+loss\b|\blosing\s+weight\b|\bunintentional\s+weight\b/.test(s)
}

function isLowFluidIntake(fluidIntake?: string | number | null): boolean {
  if (fluidIntake == null || fluidIntake === "") return false
  if (typeof fluidIntake === "number") return fluidIntake > 0 && fluidIntake < 500

  const s = String(fluidIntake).trim().toLowerCase()
  return (
    /\blow\b|\bpoor\b|\bminimal\b|\binsufficient\b|\bdecreased\b|\breduced\b/.test(s) ||
    /\bless\s+than\b|<\s*\d{3,4}\s*ml\b/.test(s) ||
    /饮水少|入液不足|液体不足/.test(s)
  )
}

function parseHoursWithoutUrine(urineOutput?: string | null): number | null {
  const s = String(urineOutput ?? "")
    .trim()
    .toLowerCase()
  if (!s) return null

  const direct =
    /(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:without|since|no|nil)\s*(?:urine|void|urination|output)/i.exec(s) ||
    /(?:no|nil|zero|without)\s+(?:urine|void|urination|output).{0,24}?(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?/i.exec(s) ||
    /(?:no|nil|zero)\s+(?:urine|void|urination|output)\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?/i.exec(s)

  if (direct) return Number(direct[1])

  if (/\banuria\b|\boliguria\b/.test(s)) return 8
  if (/\b(?:no|nil|zero)\s+(?:urine|void|urination|output)\b/.test(s) && /\b8\b/.test(s)) return 8
  if (/\b(?:no|nil|zero)\s+(?:urine|void|urination|output)\b/.test(s)) return 8

  return null
}

function hasVomiting(value?: boolean | string | null): boolean {
  if (isTruthy(value)) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return /\bvomit/.test(s) || /呕吐/.test(s)
}

function hasDiarrhea(value?: boolean | string | null): boolean {
  if (isTruthy(value)) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return /\bdiarrh(?:ea|oea)\b|\bloose\s+stool/.test(s) || /腹泻|拉肚子/.test(s)
}

function hasDryMouth(value?: boolean | string | null): boolean {
  if (isTruthy(value)) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return /\bdry\s+mouth\b|\bxerostomia\b/.test(s) || /口干/.test(s)
}

function hasWeakness(value?: boolean | string | null): boolean {
  if (isTruthy(value)) return true
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
  return /\bweak(?:ness)?\b|\bgeneral(?:ized)?\s+weakness\b/.test(s) || /虚弱|乏力|无力/.test(s)
}

function buildNursingActions(input: {
  nutritionRisk: NutritionRiskLevel
  dehydrationRisk: NutritionRiskLevel
  poorAppetite: boolean
  lowFluid: boolean
}): string[] {
  const actions: string[] = []
  const anyConcern = input.nutritionRisk !== "LOW" || input.dehydrationRisk !== "LOW"

  if (input.nutritionRisk !== "LOW" || input.poorAppetite) {
    actions.push("Encourage small frequent meals")
    actions.push("Recheck appetite next meal")
  }

  if (input.dehydrationRisk !== "LOW" || input.lowFluid) {
    actions.push("Encourage oral fluid if allowed")
  }

  if (anyConcern) {
    actions.push("Monitor intake/output chart")
    actions.push("Inform nurse in charge")
  }

  if (input.nutritionRisk === "HIGH" || input.dehydrationRisk === "HIGH") {
    actions.push("Doctor review recommended")
  }

  return [...new Set(actions)]
}

function buildAlertMessage(
  nutritionRisk: NutritionRiskLevel,
  dehydrationRisk: NutritionRiskLevel,
  reasons: string[],
  patientName: string,
  room: string,
): string {
  const overall = maxRisk(nutritionRisk, dehydrationRisk)
  if (overall === "LOW") return ""

  const header =
    overall === "HIGH" ? "🔴 HIGH NUTRITION / DEHYDRATION RISK" : "🟡 MEDIUM NUTRITION / DEHYDRATION RISK"

  const lines = [
    header,
    `Patient: ${patientName || "Unknown"}`,
    `Room: ${room || "—"}`,
    `Nutrition Risk: ${nutritionRisk}`,
    `Dehydration Risk: ${dehydrationRisk}`,
  ]

  if (reasons.length > 0) {
    lines.push("Reasons:")
    reasons.forEach((reason, index) => lines.push(`${index + 1}. ${reason}`))
  }

  return lines.join("\n")
}

function resolveFamilyUpdate(
  nutritionRisk: NutritionRiskLevel,
  dehydrationRisk: NutritionRiskLevel,
): FamilyUpdateLevel {
  const overall = maxRisk(nutritionRisk, dehydrationRisk)
  if (overall === "HIGH") return "RECOMMENDED"
  if (overall === "MEDIUM") return "NO"
  return "NO"
}

/** Telegram-friendly action list for nutrition alerts. */
export function formatTelegramNutritionActions(result: Omit<NutritionBrainResult, "telegramReply">): string[] {
  if (result.nutritionRisk === "LOW" && result.dehydrationRisk === "LOW") {
    return result.nursingActions
  }

  const actions: string[] = []

  if (
    result.nutritionRisk !== "LOW" ||
    result.nursingActions.includes("Encourage small frequent meals")
  ) {
    actions.push("Encourage small frequent meals")
  }

  if (
    result.dehydrationRisk !== "LOW" ||
    result.nursingActions.includes("Encourage oral fluid if allowed")
  ) {
    actions.push("Encourage oral fluid if allowed")
  }

  if (result.nursingActions.includes("Monitor intake/output chart")) {
    actions.push("Monitor intake/output")
  }

  if (result.nursingActions.includes("Inform nurse in charge")) {
    actions.push("Inform nurse in charge")
  }

  if (result.doctorReview === "YES") {
    actions.push("Doctor review recommended")
  }

  return [...new Set(actions)]
}

/** Format Telegram reply for nutrition assessment. */
export function formatTelegramNutritionReply(
  result: Omit<NutritionBrainResult, "telegramReply">,
  patientName: string,
  room: string,
): string {
  const actions = formatTelegramNutritionActions(result)
  const lines = [
    "✅ Nutrition assessment saved",
    "",
    `Patient: ${patientName || "Unknown"}`,
    `Room: ${room || "—"}`,
    `Nutrition Risk: ${result.nutritionRisk}`,
    `Dehydration Risk: ${result.dehydrationRisk}`,
  ]

  if (actions.length > 0) {
    lines.push("Actions:")
    actions.forEach((action, index) => lines.push(`${index + 1}. ${action}`))
  }

  if (result.alertMessage) lines.push("", result.alertMessage)
  return lines.join("\n")
}

/** Assess nutrition and dehydration risk for one patient record. */
export function analyzeNutrition(record: NutritionBrainInput): NutritionBrainResult {
  const room = String(record.room ?? "").trim()
  const patientName = String(record.patientName ?? "").trim()

  let nutritionRisk: NutritionRiskLevel = "LOW"
  let dehydrationRisk: NutritionRiskLevel = "LOW"
  const reasons: string[] = []

  const poorAppetite = isPoorAppetite(record.appetite)
  if (poorAppetite) {
    nutritionRisk = "HIGH"
    reasons.push("Poor appetite")
  }

  const mealPct = parseMealPercentage(record.mealPercentage)
  if (mealPct != null) {
    if (mealPct < 25) {
      nutritionRisk = maxRisk(nutritionRisk, "HIGH")
      reasons.push(`Meal intake ${mealPct}% (<25%)`)
    } else if (mealPct < 50) {
      nutritionRisk = maxRisk(nutritionRisk, "MEDIUM")
      reasons.push(`Meal intake ${mealPct}% (<50%)`)
    }
  }

  if (isWeightLoss(record.weightLoss)) {
    nutritionRisk = "HIGH"
    reasons.push("Weight loss")
  }

  const lowFluid = isLowFluidIntake(record.fluidIntake)
  if (lowFluid) {
    dehydrationRisk = maxRisk(dehydrationRisk, "MEDIUM")
    reasons.push("Low fluid intake")
  }

  const hoursWithoutUrine = parseHoursWithoutUrine(record.urineOutput)
  if (hoursWithoutUrine != null && hoursWithoutUrine >= 8) {
    dehydrationRisk = "HIGH"
    reasons.push(`No urine ${hoursWithoutUrine} hours`)
  }

  const vomiting = hasVomiting(record.vomiting)
  const diarrhea = hasDiarrhea(record.diarrhea)
  if (vomiting && diarrhea) {
    dehydrationRisk = maxRisk(dehydrationRisk, "HIGH")
    reasons.push("Vomiting and diarrhea")
  } else if (vomiting) {
    dehydrationRisk = maxRisk(dehydrationRisk, "MEDIUM")
    reasons.push("Vomiting")
  } else if (diarrhea) {
    dehydrationRisk = maxRisk(dehydrationRisk, "MEDIUM")
    reasons.push("Diarrhea")
  }

  const dryMouth = hasDryMouth(record.dryMouth)
  const weakness = hasWeakness(record.weakness)
  if (dryMouth && weakness) {
    dehydrationRisk = "HIGH"
    reasons.push("Dry mouth with weakness")
  } else {
    if (dryMouth) reasons.push("Dry mouth")
    if (weakness && dehydrationRisk === "LOW") reasons.push("Weakness noted")
  }

  const doctorReview: "YES" | "NO" =
    nutritionRisk === "HIGH" || dehydrationRisk === "HIGH" ? "YES" : "NO"

  const nursingActions = buildNursingActions({
    nutritionRisk,
    dehydrationRisk,
    poorAppetite,
    lowFluid,
  })

  const familyUpdate = resolveFamilyUpdate(nutritionRisk, dehydrationRisk)

  const alertMessage = buildAlertMessage(
    nutritionRisk,
    dehydrationRisk,
    reasons,
    patientName,
    room,
  )

  const core = {
    nutritionRisk,
    dehydrationRisk,
    reasons: [...new Set(reasons)],
    nursingActions,
    doctorReview,
    familyUpdate,
    alertMessage,
  }

  return {
    ...core,
    telegramReply: formatTelegramNutritionReply(core, patientName, room),
  }
}
