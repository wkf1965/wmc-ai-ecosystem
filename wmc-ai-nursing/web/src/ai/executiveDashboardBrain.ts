/**
 * Executive Dashboard Brain — daily nursing risk overview for leadership.
 *
 * Aggregates ward resident records into executive-level KPIs and a brief summary.
 */

import type {
  HandoverPatientRecord,
  HandoverQueueDoctorReview,
  HandoverQueueFamilyUpdate,
} from "./handoverBrain"

export type ExecutiveResidentRecord = HandoverPatientRecord & {
  /** Explicit fall-risk flag or level from Fall Prevention Brain */
  fallRisk?: boolean | "LOW" | "MEDIUM" | "HIGH" | null
}

export type ExecutiveDashboardBrainInput = {
  records?: ExecutiveResidentRecord[]
  /** Alias for records */
  residents?: ExecutiveResidentRecord[]
  doctorReviewQueue?: HandoverQueueDoctorReview[]
  familyUpdateQueue?: HandoverQueueFamilyUpdate[]
  generatedAt?: string | Date | null
}

export type ExecutiveDashboardBrainResult = {
  totalResidents: number
  highRiskCount: number
  mediumRiskCount: number
  lowRiskCount: number
  emergencyCount: number
  doctorReviewsPending: number
  turningOverdue: number
  medicationIssues: number
  woundCases: number
  fallRiskPatients: number
  familyUpdatesPending: number
  top5HighestRiskResidents: string[]
  summaryMessage: string
}

const LEVEL_RANK: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  EMERGENCY: 3,
}

function normalizeInput(
  input: ExecutiveResidentRecord[] | ExecutiveDashboardBrainInput,
): Required<Pick<ExecutiveDashboardBrainInput, "records">> &
  Pick<ExecutiveDashboardBrainInput, "doctorReviewQueue" | "familyUpdateQueue" | "generatedAt"> {
  if (Array.isArray(input)) {
    return { records: input, doctorReviewQueue: [], familyUpdateQueue: [], generatedAt: null }
  }
  return {
    records: input.records ?? input.residents ?? [],
    doctorReviewQueue: input.doctorReviewQueue ?? [],
    familyUpdateQueue: input.familyUpdateQueue ?? [],
    generatedAt: input.generatedAt ?? null,
  }
}

function formatRoomPatient(room: string, patientName: string): string {
  const roomLabel = String(room ?? "").trim()
  const name = String(patientName ?? "").trim() || "Unknown"
  return roomLabel ? `Room ${roomLabel} ${name}` : name
}

function residentKey(room: string, patientName: string): string {
  return `${String(room ?? "").trim().toLowerCase()}|${String(patientName ?? "").trim().toLowerCase()}`
}

function normalizeRecord(record: ExecutiveResidentRecord): ExecutiveResidentRecord {
  const coordinator = record.coordinator
  const level = record.overallRiskLevel ?? coordinator?.overallRiskLevel ?? "LOW"
  return {
    ...record,
    room: String(record.room ?? "").trim(),
    patientName: String(record.patientName ?? "").trim(),
    overallRiskLevel: level,
    overallRiskScore: record.overallRiskScore ?? coordinator?.overallRiskScore ?? 0,
    doctorReviewRequired:
      record.doctorReviewRequired ??
      coordinator?.doctorReviewRequired ??
      (level === "HIGH" || level === "EMERGENCY" ? "YES" : "NO"),
    turningOverdue: record.turningOverdue ?? false,
    medicationIssues: record.medicationIssues ?? [],
    woundCases: record.woundCases ?? [],
    familyUpdatePending:
      record.familyUpdatePending ??
      (coordinator?.familyUpdateRequired === "YES" || coordinator?.familyUpdateRequired === "RECOMMENDED"),
  }
}

function riskLevel(record: ExecutiveResidentRecord): string {
  return String(record.overallRiskLevel ?? "LOW").trim().toUpperCase()
}

function hasFallRisk(record: ExecutiveResidentRecord): boolean {
  if (record.fallRisk === true) return true
  const level = String(record.fallRisk ?? "").toUpperCase()
  if (level === "HIGH" || level === "MEDIUM") return true

  const problems = record.coordinator?.topProblems ?? []
  return problems.some((problem) => /fall\s+risk|fall risk|weak mobility|dizziness|previous fall/i.test(problem))
}

function countDoctorReviewsPending(
  records: ExecutiveResidentRecord[],
  queue: HandoverQueueDoctorReview[],
): number {
  const keys = new Set<string>()
  for (const record of records) {
    if (record.doctorReviewRequired === true || record.doctorReviewRequired === "YES") {
      keys.add(residentKey(record.room, record.patientName))
    }
  }
  for (const item of queue) {
    if (String(item.status ?? "PENDING").toUpperCase() === "PENDING") {
      keys.add(residentKey(item.room, item.patientName))
    }
  }
  return keys.size
}

function countFamilyUpdatesPending(
  records: ExecutiveResidentRecord[],
  queue: HandoverQueueFamilyUpdate[],
): number {
  const keys = new Set<string>()
  for (const record of records) {
    if (record.familyUpdatePending) keys.add(residentKey(record.room, record.patientName))
  }
  for (const item of queue) {
    const status = String(item.status ?? "DRAFT").toUpperCase()
    if (status === "DRAFT" || status === "PENDING") {
      keys.add(residentKey(item.room, item.patientName))
    }
  }
  return keys.size
}

function buildTop5(records: ExecutiveResidentRecord[]): string[] {
  return [...records]
    .sort((a, b) => {
      const levelDiff = (LEVEL_RANK[riskLevel(b)] ?? 0) - (LEVEL_RANK[riskLevel(a)] ?? 0)
      if (levelDiff !== 0) return levelDiff
      return (b.overallRiskScore ?? 0) - (a.overallRiskScore ?? 0)
    })
    .slice(0, 5)
    .map((record) => formatRoomPatient(record.room, record.patientName))
}

function buildSummaryMessage(result: Omit<ExecutiveDashboardBrainResult, "summaryMessage">): string {
  const urgentParts: string[] = []
  if (result.emergencyCount > 0) urgentParts.push(`${result.emergencyCount} emergency`)
  if (result.highRiskCount > 0) urgentParts.push(`${result.highRiskCount} high-risk`)
  if (result.doctorReviewsPending > 0) urgentParts.push(`${result.doctorReviewsPending} doctor reviews pending`)
  if (result.turningOverdue > 0) urgentParts.push(`${result.turningOverdue} turning overdue`)
  if (result.medicationIssues > 0) urgentParts.push(`${result.medicationIssues} medication issues`)
  if (result.woundCases > 0) urgentParts.push(`${result.woundCases} wound cases`)
  if (result.fallRiskPatients > 0) urgentParts.push(`${result.fallRiskPatients} fall-risk patients`)
  if (result.familyUpdatesPending > 0) urgentParts.push(`${result.familyUpdatesPending} family updates pending`)

  const topLine =
    result.top5HighestRiskResidents.length > 0
      ? ` Highest attention: ${result.top5HighestRiskResidents.slice(0, 3).join(", ")}.`
      : ""

  const urgentLine =
    urgentParts.length > 0
      ? ` Priority items today: ${urgentParts.join(", ")}.`
      : " No urgent nursing escalations identified today."

  return (
    `Daily nursing overview — ${result.totalResidents} residents ` +
    `(${result.highRiskCount + result.emergencyCount} high/emergency, ${result.mediumRiskCount} medium, ${result.lowRiskCount} low).` +
    urgentLine +
    topLine
  )
}

/** Generate executive dashboard KPIs and summary for leadership review. */
export function generateExecutiveDashboard(
  input: ExecutiveResidentRecord[] | ExecutiveDashboardBrainInput,
): ExecutiveDashboardBrainResult {
  const normalized = normalizeInput(input)
  const records = normalized.records.map(normalizeRecord)

  let emergencyCount = 0
  let highRiskCount = 0
  let mediumRiskCount = 0
  let lowRiskCount = 0

  for (const record of records) {
    const level = riskLevel(record)
    if (level === "EMERGENCY") emergencyCount += 1
    else if (level === "HIGH") highRiskCount += 1
    else if (level === "MEDIUM") mediumRiskCount += 1
    else lowRiskCount += 1
  }

  const turningOverdue = records.filter((record) => record.turningOverdue).length
  const medicationIssues = records.filter((record) => (record.medicationIssues ?? []).length > 0).length
  const woundCases = records.filter((record) => (record.woundCases ?? []).length > 0).length
  const fallRiskPatients = records.filter(hasFallRisk).length
  const doctorReviewsPending = countDoctorReviewsPending(records, normalized.doctorReviewQueue ?? [])
  const familyUpdatesPending = countFamilyUpdatesPending(records, normalized.familyUpdateQueue ?? [])
  const top5HighestRiskResidents = buildTop5(records)

  const core = {
    totalResidents: records.length,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    emergencyCount,
    doctorReviewsPending,
    turningOverdue,
    medicationIssues,
    woundCases,
    fallRiskPatients,
    familyUpdatesPending,
    top5HighestRiskResidents,
  }

  return {
    ...core,
    summaryMessage: buildSummaryMessage(core),
  }
}
