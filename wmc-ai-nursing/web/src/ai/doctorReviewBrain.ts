/**
 * Doctor Review Brain — doctor review decision and queue item for HIGH / EMERGENCY risk.
 */

import type { RiskBrainResult } from "../lib/server/riskBrainV2"

export type DoctorReviewVitals = {
  bloodPressure?: string
  pulse?: string
  spo2?: string
  temperature?: string
}

export type DoctorReviewQueueItem = {
  room: string
  patientName: string
  riskLevel: "HIGH" | "EMERGENCY"
  reasons: string[]
  vitals: DoctorReviewVitals
  requestedAt: string
  status: "PENDING"
}

export type DoctorReviewBrainInput = {
  riskLevel: RiskBrainResult["riskLevel"]
  categories?: string[]
  room?: string | null
  patientName?: string | null
  reasons?: string[]
  vitals?: DoctorReviewVitals | null
  requestedAt?: string
}

export type DoctorReviewBrainResult = {
  doctorReview: "YES" | "NO"
  reason: string
  queueItem: DoctorReviewQueueItem | null
  queueStatus: "PENDING" | null
}

/** Decide doctor review and build a pending queue item when risk is HIGH or EMERGENCY. */
export function runDoctorReviewBrain(input: DoctorReviewBrainInput): DoctorReviewBrainResult {
  const { riskLevel, categories = [], reasons = [] } = input
  const room = String(input.room ?? "").trim()
  const patientName = String(input.patientName ?? "").trim()
  const requestedAt = input.requestedAt ?? new Date().toISOString()
  const vitals: DoctorReviewVitals = {
    bloodPressure: input.vitals?.bloodPressure ?? "",
    pulse: input.vitals?.pulse ?? "",
    spo2: input.vitals?.spo2 ?? "",
    temperature: input.vitals?.temperature ?? "",
  }

  if (riskLevel === "EMERGENCY") {
    return {
      doctorReview: "YES",
      reason: "Emergency risk — immediate doctor review required.",
      queueItem: {
        room,
        patientName,
        riskLevel: "EMERGENCY",
        reasons,
        vitals,
        requestedAt,
        status: "PENDING",
      },
      queueStatus: "PENDING",
    }
  }

  if (riskLevel === "HIGH") {
    const label = categories.length ? categories.join(", ") : "High risk findings"
    return {
      doctorReview: "YES",
      reason: `${label} — doctor review recommended.`,
      queueItem: {
        room,
        patientName,
        riskLevel: "HIGH",
        reasons,
        vitals,
        requestedAt,
        status: "PENDING",
      },
      queueStatus: "PENDING",
    }
  }

  return {
    doctorReview: "NO",
    reason: "No high or emergency risk — routine nursing care.",
    queueItem: null,
    queueStatus: null,
  }
}
