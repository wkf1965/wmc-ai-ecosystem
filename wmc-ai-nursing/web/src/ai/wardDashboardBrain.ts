/**
 * Ward Dashboard Brain — facility-wide nursing dashboard summary.
 *
 * Aggregates all resident coordinator outputs into ward-level counts,
 * pending tasks, and top highest-risk residents.
 */

import type { MasterCoordinatorBrainResult } from "./masterCoordinatorBrain"
import type {
  HandoverPatientRecord,
  HandoverQueueDoctorReview,
  HandoverQueueFamilyUpdate,
} from "./handoverBrain"

export type WardResidentRecord = HandoverPatientRecord

export type WardDashboardBrainInput = {
  generatedAt?: string | Date | null
  residents?: WardResidentRecord[]
  doctorReviewQueue?: HandoverQueueDoctorReview[]
  familyUpdateQueue?: HandoverQueueFamilyUpdate[]
  /** Max residents in top-risk list (default 5) */
  topRiskLimit?: number | null
}

export type WardRiskCounts = {
  totalResidents: number
  highRisk: number
  mediumRisk: number
  lowRisk: number
  emergencyRisk: number
}

export type WardPendingCounts = {
  doctorReviewsPending: number
  turningOverdue: number
  medicationIssues: number
  familyUpdatesPending: number
}

export type WardDashboardBrainResult = {
  counts: WardRiskCounts
  pending: WardPendingCounts
  topHighestRiskResidents: string[]
  dashboardText: string
  generatedAt: string
}

const LEVEL_RANK: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  EMERGENCY: 3,
}

function formatGeneratedAt(value?: string | Date | null): string {
  if (!value) return new Date().toLocaleString()
  if (value instanceof Date) return value.toLocaleString()
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : String(value)
}

function formatRoomPatient(room: string, patientName: string): string {
  const roomLabel = String(room ?? "").trim()
  const name = String(patientName ?? "").trim() || "Unknown"
  return roomLabel ? `Room ${roomLabel} ${name}` : name
}

function residentKey(room: string, patientName: string): string {
  return `${String(room ?? "").trim().toLowerCase()}|${String(patientName ?? "").trim().toLowerCase()}`
}

function normalizeResident(record: WardResidentRecord): WardResidentRecord {
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
    familyUpdatePending:
      record.familyUpdatePending ??
      (coordinator?.familyUpdateRequired === "YES" || coordinator?.familyUpdateRequired === "RECOMMENDED"),
  }
}

function riskBucket(level?: string | null): "high" | "medium" | "low" | "emergency" {
  const normalized = String(level ?? "LOW").trim().toUpperCase()
  if (normalized === "EMERGENCY") return "emergency"
  if (normalized === "HIGH") return "high"
  if (normalized === "MEDIUM") return "medium"
  return "low"
}

function countRiskLevels(residents: WardResidentRecord[]): WardRiskCounts {
  let highRisk = 0
  let mediumRisk = 0
  let lowRisk = 0
  let emergencyRisk = 0

  for (const resident of residents) {
    const bucket = riskBucket(resident.overallRiskLevel)
    if (bucket === "emergency") {
      emergencyRisk += 1
      highRisk += 1
    } else if (bucket === "high") highRisk += 1
    else if (bucket === "medium") mediumRisk += 1
    else lowRisk += 1
  }

  return {
    totalResidents: residents.length,
    highRisk,
    mediumRisk,
    lowRisk,
    emergencyRisk,
  }
}

function countDoctorReviewsPending(
  residents: WardResidentRecord[],
  queue: HandoverQueueDoctorReview[],
): number {
  const keys = new Set<string>()

  for (const resident of residents) {
    if (resident.doctorReviewRequired === true || resident.doctorReviewRequired === "YES") {
      keys.add(residentKey(resident.room, resident.patientName))
    }
  }

  for (const item of queue) {
    if (String(item.status ?? "PENDING").toUpperCase() === "PENDING") {
      keys.add(residentKey(item.room, item.patientName))
    }
  }

  return keys.size
}

function countTurningOverdue(residents: WardResidentRecord[]): number {
  return residents.filter((resident) => resident.turningOverdue).length
}

function countMedicationIssues(residents: WardResidentRecord[]): number {
  return residents.filter((resident) => (resident.medicationIssues ?? []).length > 0).length
}

function countFamilyUpdatesPending(
  residents: WardResidentRecord[],
  queue: HandoverQueueFamilyUpdate[],
): number {
  const keys = new Set<string>()

  for (const resident of residents) {
    if (resident.familyUpdatePending) {
      keys.add(residentKey(resident.room, resident.patientName))
    }
  }

  for (const item of queue) {
    const status = String(item.status ?? "DRAFT").toUpperCase()
    if (status === "DRAFT" || status === "PENDING") {
      keys.add(residentKey(item.room, item.patientName))
    }
  }

  return keys.size
}

function buildTopHighestRiskResidents(residents: WardResidentRecord[], limit: number): string[] {
  return [...residents]
    .sort((a, b) => {
      const levelDiff =
        (LEVEL_RANK[String(b.overallRiskLevel ?? "LOW").toUpperCase()] ?? 0) -
        (LEVEL_RANK[String(a.overallRiskLevel ?? "LOW").toUpperCase()] ?? 0)
      if (levelDiff !== 0) return levelDiff
      return (b.overallRiskScore ?? 0) - (a.overallRiskScore ?? 0)
    })
    .slice(0, limit)
    .map((resident) => formatRoomPatient(resident.room, resident.patientName))
}

function buildDashboardText(input: {
  generatedAt: string
  counts: WardRiskCounts
  pending: WardPendingCounts
  topHighestRiskResidents: string[]
}): string {
  const lines = [
    `Residents: ${input.counts.totalResidents}`,
    "",
    `HIGH RISK: ${input.counts.highRisk}`,
    `MEDIUM RISK: ${input.counts.mediumRisk}`,
    `LOW RISK: ${input.counts.lowRisk}`,
    "",
    `Doctor Reviews Pending: ${input.pending.doctorReviewsPending}`,
    `Turning Overdue: ${input.pending.turningOverdue}`,
    `Medication Issues: ${input.pending.medicationIssues}`,
    `Family Updates Pending: ${input.pending.familyUpdatesPending}`,
    "",
    `Top ${input.topHighestRiskResidents.length} Highest Risk Residents`,
    ...(input.topHighestRiskResidents.length
      ? input.topHighestRiskResidents.map((resident, index) => `${index + 1}. ${resident}`)
      : ["None"]),
  ]

  if (input.counts.emergencyRisk > 0) {
    lines.splice(6, 0, `EMERGENCY: ${input.counts.emergencyRisk}`)
  }

  return lines.join("\n")
}

/** Generate ward-wide dashboard summary for all residents. */
export function generateWardDashboard(input: WardDashboardBrainInput): WardDashboardBrainResult {
  const generatedAt = formatGeneratedAt(input.generatedAt)
  const residents = (input.residents ?? []).map(normalizeResident)
  const doctorReviewQueue = input.doctorReviewQueue ?? []
  const familyUpdateQueue = input.familyUpdateQueue ?? []
  const topLimit = Math.max(1, input.topRiskLimit ?? 5)

  const counts = countRiskLevels(residents)
  const pending: WardPendingCounts = {
    doctorReviewsPending: countDoctorReviewsPending(residents, doctorReviewQueue),
    turningOverdue: countTurningOverdue(residents),
    medicationIssues: countMedicationIssues(residents),
    familyUpdatesPending: countFamilyUpdatesPending(residents, familyUpdateQueue),
  }

  const topHighestRiskResidents = buildTopHighestRiskResidents(residents, topLimit)

  return {
    counts,
    pending,
    topHighestRiskResidents,
    dashboardText: buildDashboardText({ generatedAt, counts, pending, topHighestRiskResidents }),
    generatedAt,
  }
}

/** Helper to build a resident record from a Master Coordinator result. */
export function wardResidentFromCoordinator(input: {
  room: string
  patientName: string
  coordinator: MasterCoordinatorBrainResult
  turningOverdue?: boolean
  medicationIssues?: string[]
  familyUpdatePending?: boolean
}): WardResidentRecord {
  return normalizeResident({
    room: input.room,
    patientName: input.patientName,
    coordinator: input.coordinator,
    turningOverdue: input.turningOverdue ?? false,
    medicationIssues: input.medicationIssues ?? [],
    familyUpdatePending: input.familyUpdatePending,
  })
}
