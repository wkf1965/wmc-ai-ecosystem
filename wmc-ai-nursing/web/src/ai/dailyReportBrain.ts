/**
 * Daily Nursing Report Brain — end-of-shift daily nursing report in plain English.
 *
 * Sections:
 *   1. Overall Summary
 *   2. High Risk Residents
 *   3. Doctor Review Required
 *   4. Turning Overdue
 *   5. Medication Issues
 *   6. Wound Cases
 *   7. Poor Appetite / Nutrition Risk
 *   8. Fall Risk
 *   9. Family Updates Pending
 *  10. Action Plan for Next Shift
 */

import { generateExecutiveDashboard, type ExecutiveResidentRecord } from "./executiveDashboardBrain"
import type { HandoverQueueDoctorReview, HandoverQueueFamilyUpdate } from "./handoverBrain"

export type DailyReportResidentRecord = ExecutiveResidentRecord & {
  nutritionRisk?: "LOW" | "MEDIUM" | "HIGH" | null
  nutritionReasons?: string[]
  poorAppetite?: boolean | string | null
}

export type DailyReportBrainInput = {
  records?: DailyReportResidentRecord[]
  residents?: DailyReportResidentRecord[]
  date?: string | Date | null
  shift?: string | null
  doctorReviewQueue?: HandoverQueueDoctorReview[]
  familyUpdateQueue?: HandoverQueueFamilyUpdate[]
  generatedAt?: string | Date | null
}

export type DailyReportSections = {
  overallSummary: string
  highRiskResidents: string[]
  doctorReviewRequired: string[]
  turningOverdue: string[]
  medicationIssues: string[]
  woundCases: string[]
  poorAppetiteNutritionRisk: string[]
  fallRisk: string[]
  familyUpdatesPending: string[]
  actionPlanNextShift: string[]
}

export type DailyReportBrainResult = {
  date: string
  shift: string
  sections: DailyReportSections
  reportText: string
}

const LEVEL_RANK: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  EMERGENCY: 3,
}

function normalizeInput(
  input: DailyReportResidentRecord[] | DailyReportBrainInput,
): Required<Pick<DailyReportBrainInput, "records">> &
  Pick<DailyReportBrainInput, "date" | "shift" | "doctorReviewQueue" | "familyUpdateQueue" | "generatedAt"> {
  if (Array.isArray(input)) {
    return {
      records: input,
      date: null,
      shift: null,
      doctorReviewQueue: [],
      familyUpdateQueue: [],
      generatedAt: null,
    }
  }
  return {
    records: input.records ?? input.residents ?? [],
    date: input.date ?? null,
    shift: input.shift ?? null,
    doctorReviewQueue: input.doctorReviewQueue ?? [],
    familyUpdateQueue: input.familyUpdateQueue ?? [],
    generatedAt: input.generatedAt ?? null,
  }
}

function formatDate(value?: string | Date | null): string {
  if (!value) return new Date().toLocaleDateString()
  if (value instanceof Date) return value.toLocaleDateString()
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString() : String(value)
}

function formatRoomPatient(room: string, patientName: string): string {
  const roomLabel = String(room ?? "").trim()
  const name = String(patientName ?? "").trim() || "Unknown"
  return roomLabel ? `Room ${roomLabel} ${name}` : name
}

function riskLevel(record: DailyReportResidentRecord): string {
  return String(record.overallRiskLevel ?? record.coordinator?.overallRiskLevel ?? "LOW")
    .trim()
    .toUpperCase()
}

function isHighOrEmergency(record: DailyReportResidentRecord): boolean {
  const level = riskLevel(record)
  return level === "HIGH" || level === "EMERGENCY"
}

function hasFallRisk(record: DailyReportResidentRecord): boolean {
  if (record.fallRisk === true) return true
  const level = String(record.fallRisk ?? "").toUpperCase()
  if (level === "HIGH" || level === "MEDIUM") return true
  const problems = record.coordinator?.topProblems ?? []
  return problems.some((problem) => /fall risk|fall risk|weak mobility|dizziness|previous fall/i.test(problem))
}

function hasNutritionRisk(record: DailyReportResidentRecord): boolean {
  if (record.poorAppetite === true || String(record.poorAppetite ?? "").toLowerCase().includes("poor")) return true
  const nutritionLevel = String(record.nutritionRisk ?? "").toUpperCase()
  if (nutritionLevel === "HIGH" || nutritionLevel === "MEDIUM") return true

  const problems = [
    ...(record.nutritionReasons ?? []),
    ...(record.coordinator?.topProblems ?? []),
  ]
  return problems.some((problem) =>
    /poor appetite|nutrition|dehydration|low fluid|meal intake|weight loss/i.test(problem),
  )
}

function formatWithDetail(room: string, name: string, detail?: string): string {
  const label = formatRoomPatient(room, name)
  return detail ? `${label} — ${detail}` : label
}

function buildHighRiskResidents(records: DailyReportResidentRecord[]): string[] {
  return [...records]
    .filter(isHighOrEmergency)
    .sort((a, b) => {
      const levelDiff = (LEVEL_RANK[riskLevel(b)] ?? 0) - (LEVEL_RANK[riskLevel(a)] ?? 0)
      if (levelDiff !== 0) return levelDiff
      return (b.overallRiskScore ?? 0) - (a.overallRiskScore ?? 0)
    })
    .map((record) => {
      const topReason = (record.coordinator?.topProblems ?? record.doctorReviewReasons ?? [])[0]
      return formatWithDetail(record.room, record.patientName, topReason)
    })
}

function buildDoctorReviewRequired(
  records: DailyReportResidentRecord[],
  queue: HandoverQueueDoctorReview[],
): string[] {
  const lines: string[] = []

  for (const record of records) {
    if (record.doctorReviewRequired === true || record.doctorReviewRequired === "YES") {
      const reasons = (record.doctorReviewReasons ?? record.coordinator?.topProblems ?? []).slice(0, 2).join("; ")
      lines.push(formatWithDetail(record.room, record.patientName, reasons || "Doctor review recommended"))
    }
  }

  for (const item of queue) {
    if (String(item.status ?? "PENDING").toUpperCase() !== "PENDING") continue
    const reasons = (item.reasons ?? []).slice(0, 2).join("; ")
    const risk = item.riskLevel ? `${item.riskLevel} — ` : ""
    lines.push(formatWithDetail(item.room, item.patientName, `${risk}${reasons}`.trim()))
  }

  return [...new Set(lines)]
}

function buildTurningOverdue(records: DailyReportResidentRecord[]): string[] {
  return records
    .filter((record) => record.turningOverdue)
    .map((record) =>
      formatWithDetail(
        record.room,
        record.patientName,
        (record.turningReasons ?? []).slice(0, 2).join("; ") || "Repositioning overdue",
      ),
    )
}

function buildMedicationIssues(records: DailyReportResidentRecord[]): string[] {
  return records.flatMap((record) =>
    (record.medicationIssues ?? []).map((issue) => formatWithDetail(record.room, record.patientName, issue)),
  )
}

function buildWoundCases(records: DailyReportResidentRecord[]): string[] {
  return records.flatMap((record) =>
    (record.woundCases ?? []).map((wound) => formatWithDetail(record.room, record.patientName, wound)),
  )
}

function buildNutritionRisk(records: DailyReportResidentRecord[]): string[] {
  return records
    .filter(hasNutritionRisk)
    .map((record) => {
      const reasons = [
        ...(record.nutritionReasons ?? []),
        ...(record.coordinator?.topProblems ?? []).filter((p) =>
          /poor appetite|nutrition|dehydration|fluid|meal|weight/i.test(p),
        ),
      ]
      const detail =
        record.poorAppetite && typeof record.poorAppetite === "string"
          ? record.poorAppetite
          : reasons.slice(0, 2).join("; ") || "Poor appetite or nutrition concern"
      return formatWithDetail(record.room, record.patientName, detail)
    })
}

function buildFallRisk(records: DailyReportResidentRecord[]): string[] {
  return records
    .filter(hasFallRisk)
    .map((record) => {
      const detail =
        (record.coordinator?.topProblems ?? []).find((p) => /fall|mobility|dizziness/i.test(p)) ||
        "Fall precautions needed"
      return formatWithDetail(record.room, record.patientName, detail)
    })
}

function buildFamilyUpdatesPending(
  records: DailyReportResidentRecord[],
  queue: HandoverQueueFamilyUpdate[],
): string[] {
  const lines: string[] = []

  for (const record of records) {
    if (record.familyUpdatePending) {
      lines.push(formatWithDetail(record.room, record.patientName, record.familyUpdateMessage ?? "Family update recommended"))
    }
  }

  for (const item of queue) {
    const status = String(item.status ?? "DRAFT").toUpperCase()
    if (status !== "DRAFT" && status !== "PENDING") continue
    lines.push(formatWithDetail(item.room, item.patientName, item.familyMessage ?? "Draft family message pending"))
  }

  return [...new Set(lines)]
}

function buildActionPlan(sections: Omit<DailyReportSections, "actionPlanNextShift" | "overallSummary">): string[] {
  const actions: string[] = []

  if (sections.highRiskResidents.length > 0) {
    actions.push("Review all high-risk residents first and confirm care plans are in place.")
  }
  if (sections.doctorReviewRequired.length > 0) {
    actions.push("Follow up pending doctor reviews and document medical responses.")
  }
  if (sections.turningOverdue.length > 0) {
    actions.push("Reposition all overdue residents and recheck skin within 2 hours.")
  }
  if (sections.medicationIssues.length > 0) {
    actions.push("Resolve medication issues and document reasons for any missed or refused doses.")
  }
  if (sections.woundCases.length > 0) {
    actions.push("Complete wound care, dressing changes, and monitor for signs of infection.")
  }
  if (sections.poorAppetiteNutritionRisk.length > 0) {
    actions.push("Encourage oral intake, monitor meal and fluid charts, and recheck appetite next meal.")
  }
  if (sections.fallRisk.length > 0) {
    actions.push("Apply fall precautions, assist transfers, and keep call bells within reach.")
  }
  if (sections.familyUpdatesPending.length > 0) {
    actions.push("Send or complete pending family updates before end of shift.")
  }

  if (actions.length === 0) {
    actions.push("Continue routine monitoring and document any change in condition.")
  }

  actions.push("Inform nurse in charge of any unresolved items before handover.")

  return [...new Set(actions)]
}

function buildOverallSummary(
  dashboard: ReturnType<typeof generateExecutiveDashboard>,
  date: string,
  shift: string,
): string {
  const shiftLabel = shift ? `${shift} shift — ` : ""
  return (
    `${shiftLabel}Daily nursing report for ${date}. ` +
    `${dashboard.totalResidents} residents in total. ` +
    `${dashboard.emergencyCount + dashboard.highRiskCount} are high or emergency risk, ` +
    `${dashboard.mediumRiskCount} medium risk, and ${dashboard.lowRiskCount} low risk. ` +
    `There are ${dashboard.doctorReviewsPending} doctor reviews pending, ` +
    `${dashboard.turningOverdue} turning overdue, ` +
    `${dashboard.medicationIssues} medication issues, and ` +
    `${dashboard.familyUpdatesPending} family updates pending.`
  )
}

function formatSection(title: string, items: string[]): string[] {
  const lines = [title]
  if (!items.length) {
    lines.push("None.")
    return lines
  }
  items.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
  return lines
}

function buildReportText(date: string, shift: string, sections: DailyReportSections): string {
  const header = [`Daily Nursing Report`, `Date: ${date}`, shift ? `Shift: ${shift}` : "", ""].filter(Boolean)

  return [
    ...header,
    "1. Overall Summary",
    sections.overallSummary,
    "",
    ...formatSection("2. High Risk Residents", sections.highRiskResidents),
    "",
    ...formatSection("3. Doctor Review Required", sections.doctorReviewRequired),
    "",
    ...formatSection("4. Turning Overdue", sections.turningOverdue),
    "",
    ...formatSection("5. Medication Issues", sections.medicationIssues),
    "",
    ...formatSection("6. Wound Cases", sections.woundCases),
    "",
    ...formatSection("7. Poor Appetite / Nutrition Risk", sections.poorAppetiteNutritionRisk),
    "",
    ...formatSection("8. Fall Risk", sections.fallRisk),
    "",
    ...formatSection("9. Family Updates Pending", sections.familyUpdatesPending),
    "",
    ...formatSection("10. Action Plan for Next Shift", sections.actionPlanNextShift),
  ].join("\n")
}

/** Generate a daily nursing report in simple English. */
export function generateDailyNursingReport(
  input: DailyReportResidentRecord[] | DailyReportBrainInput,
): DailyReportBrainResult {
  const normalized = normalizeInput(input)
  const records = normalized.records
  const date = formatDate(normalized.date ?? normalized.generatedAt)
  const shift = String(normalized.shift ?? "").trim()

  const dashboard = generateExecutiveDashboard({
    records,
    doctorReviewQueue: normalized.doctorReviewQueue,
    familyUpdateQueue: normalized.familyUpdateQueue,
    generatedAt: normalized.generatedAt,
  })

  const sectionData = {
    highRiskResidents: buildHighRiskResidents(records),
    doctorReviewRequired: buildDoctorReviewRequired(records, normalized.doctorReviewQueue ?? []),
    turningOverdue: buildTurningOverdue(records),
    medicationIssues: buildMedicationIssues(records),
    woundCases: buildWoundCases(records),
    poorAppetiteNutritionRisk: buildNutritionRisk(records),
    fallRisk: buildFallRisk(records),
    familyUpdatesPending: buildFamilyUpdatesPending(records, normalized.familyUpdateQueue ?? []),
  }

  const sections: DailyReportSections = {
    overallSummary: buildOverallSummary(dashboard, date, shift),
    ...sectionData,
    actionPlanNextShift: buildActionPlan(sectionData),
  }

  return {
    date,
    shift,
    sections,
    reportText: buildReportText(date, shift, sections),
  }
}
