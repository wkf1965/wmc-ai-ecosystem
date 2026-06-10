/**
 * Shift Handover Brain — generate structured nursing shift handover summaries.
 *
 * Aggregates per-patient coordinator / brain outputs into a ward handover brief.
 */

import type { MasterCoordinatorBrainResult } from "./masterCoordinatorBrain"

export type HandoverShift = "morning" | "evening" | "night" | string

export type HandoverPatientRecord = {
  room: string
  patientName: string
  overallRiskLevel?: "EMERGENCY" | "HIGH" | "MEDIUM" | "LOW" | null
  overallRiskScore?: number | null
  doctorReviewRequired?: boolean | "YES" | "NO" | null
  doctorReviewReasons?: string[]
  turningOverdue?: boolean | null
  turningReasons?: string[]
  medicationIssues?: string[]
  woundCases?: string[]
  familyUpdatePending?: boolean | null
  familyUpdateMessage?: string | null
  coordinator?: MasterCoordinatorBrainResult | null
}

export type HandoverQueueDoctorReview = {
  room: string
  patientName: string
  reasons?: string[]
  riskLevel?: string
  status?: string
}

export type HandoverQueueFamilyUpdate = {
  room: string
  patientName: string
  familyMessage?: string
  status?: string
}

export type HandoverBrainInput = {
  shift?: HandoverShift | null
  generatedAt?: string | Date | null
  patients?: HandoverPatientRecord[]
  doctorReviewQueue?: HandoverQueueDoctorReview[]
  familyUpdateQueue?: HandoverQueueFamilyUpdate[]
}

export type HandoverBrainSections = {
  highRiskPatients: string[]
  doctorReviewRequired: string[]
  overdueTurning: string[]
  medicationIssues: string[]
  woundCases: string[]
  familyUpdatesPending: string[]
}

export type HandoverBrainResult = {
  shift: HandoverShift
  shiftTitle: string
  generatedAt: string
  sections: HandoverBrainSections
  handoverText: string
}

function shiftTitle(shift: HandoverShift): string {
  const normalized = String(shift ?? "morning").trim().toLowerCase()
  if (normalized === "evening" || normalized === "afternoon") return "Evening Shift Summary"
  if (normalized === "night" || normalized === "night shift") return "Night Shift Summary"
  return "Morning Shift Summary"
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

function isDoctorReviewRequired(value?: boolean | "YES" | "NO" | null): boolean {
  if (value === true || value === "YES") return true
  return false
}

function isHighRisk(level?: string | null): boolean {
  const normalized = String(level ?? "").trim().toUpperCase()
  return normalized === "HIGH" || normalized === "EMERGENCY"
}

function normalizePatient(record: HandoverPatientRecord): HandoverPatientRecord {
  const coordinator = record.coordinator
  return {
    ...record,
    room: String(record.room ?? "").trim(),
    patientName: String(record.patientName ?? "").trim(),
    overallRiskLevel: record.overallRiskLevel ?? coordinator?.overallRiskLevel ?? "LOW",
    overallRiskScore: record.overallRiskScore ?? coordinator?.overallRiskScore ?? 0,
    doctorReviewRequired:
      record.doctorReviewRequired ??
      coordinator?.doctorReviewRequired ??
      (coordinator?.overallRiskLevel === "HIGH" || coordinator?.overallRiskLevel === "EMERGENCY"
        ? "YES"
        : "NO"),
    doctorReviewReasons:
      record.doctorReviewReasons ??
      coordinator?.topProblems.filter((problem) => !/turning|medication|wound|mental health/i.test(problem)) ??
      [],
    turningOverdue: record.turningOverdue ?? false,
    turningReasons: record.turningReasons ?? [],
    medicationIssues: record.medicationIssues ?? [],
    woundCases: record.woundCases ?? [],
    familyUpdatePending:
      record.familyUpdatePending ??
      (coordinator?.familyUpdateRequired === "YES" || coordinator?.familyUpdateRequired === "RECOMMENDED"),
    familyUpdateMessage: record.familyUpdateMessage ?? null,
  }
}

function formatNumberedList(items: string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`)
}

function formatSectionLines(title: string, items: string[]): string[] {
  if (!items.length) return [title, "None"]
  return [title, ...formatNumberedList(items)]
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
}

function buildHighRiskPatients(patients: HandoverPatientRecord[]): string[] {
  return patients
    .filter((patient) => isHighRisk(patient.overallRiskLevel))
    .sort((a, b) => (b.overallRiskScore ?? 0) - (a.overallRiskScore ?? 0))
    .map((patient) => formatRoomPatient(patient.room, patient.patientName))
}

function buildDoctorReviewRequired(
  patients: HandoverPatientRecord[],
  queue: HandoverQueueDoctorReview[],
): string[] {
  const fromPatients = patients
    .filter((patient) => isDoctorReviewRequired(patient.doctorReviewRequired))
    .map((patient) => {
      const label = formatRoomPatient(patient.room, patient.patientName)
      const reasons = (patient.doctorReviewReasons ?? []).slice(0, 2).join("; ")
      return reasons ? `${label} — ${reasons}` : label
    })

  const fromQueue = queue
    .filter((item) => String(item.status ?? "PENDING").toUpperCase() === "PENDING")
    .map((item) => {
      const label = formatRoomPatient(item.room, item.patientName)
      const reasons = (item.reasons ?? []).slice(0, 2).join("; ")
      const risk = item.riskLevel ? ` (${item.riskLevel})` : ""
      return reasons ? `${label}${risk} — ${reasons}` : `${label}${risk}`
    })

  return uniqueStrings([...fromPatients, ...fromQueue])
}

function buildOverdueTurning(patients: HandoverPatientRecord[]): string[] {
  return patients
    .filter((patient) => patient.turningOverdue)
    .map((patient) => {
      const label = formatRoomPatient(patient.room, patient.patientName)
      const detail = (patient.turningReasons ?? []).slice(0, 2).join("; ")
      return detail ? `${label} — ${detail}` : `${label} — repositioning overdue`
    })
}

function buildMedicationIssues(patients: HandoverPatientRecord[]): string[] {
  return uniqueStrings(
    patients.flatMap((patient) =>
      (patient.medicationIssues ?? []).map((issue) => {
        const label = formatRoomPatient(patient.room, patient.patientName)
        return `${label} — ${issue}`
      }),
    ),
  )
}

function buildWoundCases(patients: HandoverPatientRecord[]): string[] {
  return uniqueStrings(
    patients.flatMap((patient) =>
      (patient.woundCases ?? []).map((wound) => {
        const label = formatRoomPatient(patient.room, patient.patientName)
        return `${label} — ${wound}`
      }),
    ),
  )
}

function buildFamilyUpdatesPending(
  patients: HandoverPatientRecord[],
  queue: HandoverQueueFamilyUpdate[],
): string[] {
  const fromPatients = patients
    .filter((patient) => patient.familyUpdatePending)
    .map((patient) => {
      const label = formatRoomPatient(patient.room, patient.patientName)
      return patient.familyUpdateMessage ? `${label} — ${patient.familyUpdateMessage}` : label
    })

  const fromQueue = queue
    .filter((item) => {
      const status = String(item.status ?? "DRAFT").toUpperCase()
      return status === "DRAFT" || status === "PENDING"
    })
    .map((item) => {
      const label = formatRoomPatient(item.room, item.patientName)
      return item.familyMessage ? `${label} — ${item.familyMessage}` : label
    })

  return uniqueStrings([...fromPatients, ...fromQueue])
}

function buildHandoverText(input: {
  shiftTitle: string
  generatedAt: string
  sections: HandoverBrainSections
}): string {
  const { sections } = input
  return [
    input.shiftTitle,
    `Generated: ${input.generatedAt}`,
    "",
    ...formatSectionLines("High Risk Patients:", sections.highRiskPatients),
    "",
    ...formatSectionLines("Doctor Review Required:", sections.doctorReviewRequired),
    "",
    ...formatSectionLines("Overdue Turning:", sections.overdueTurning),
    "",
    ...formatSectionLines("Medication Issues:", sections.medicationIssues),
    "",
    ...formatSectionLines("Wound Cases:", sections.woundCases),
    "",
    ...formatSectionLines("Family Updates Pending:", sections.familyUpdatesPending),
  ].join("\n")
}

/** Generate an automatic nursing shift handover summary. */
export function generateShiftHandover(input: HandoverBrainInput): HandoverBrainResult {
  const shift = String(input.shift ?? "morning").trim().toLowerCase() || "morning"
  const generatedAt = formatGeneratedAt(input.generatedAt)
  const patients = (input.patients ?? []).map(normalizePatient)
  const doctorReviewQueue = input.doctorReviewQueue ?? []
  const familyUpdateQueue = input.familyUpdateQueue ?? []

  const sections: HandoverBrainSections = {
    highRiskPatients: buildHighRiskPatients(patients),
    doctorReviewRequired: buildDoctorReviewRequired(patients, doctorReviewQueue),
    overdueTurning: buildOverdueTurning(patients),
    medicationIssues: buildMedicationIssues(patients),
    woundCases: buildWoundCases(patients),
    familyUpdatesPending: buildFamilyUpdatesPending(patients, familyUpdateQueue),
  }

  const title = shiftTitle(shift)

  return {
    shift,
    shiftTitle: title,
    generatedAt,
    sections,
    handoverText: buildHandoverText({ shiftTitle: title, generatedAt, sections }),
  }
}
