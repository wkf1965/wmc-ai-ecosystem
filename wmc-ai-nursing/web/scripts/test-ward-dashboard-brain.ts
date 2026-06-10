/**
 * Ward Dashboard Brain tests.
 * Run: npx tsx scripts/test-ward-dashboard-brain.ts
 */
import { generateWardDashboard, wardResidentFromCoordinator } from "../src/ai/wardDashboardBrain"
import { runMasterCoordinatorBrain } from "../src/ai/masterCoordinatorBrain"
import { runRiskBrain } from "../src/ai/riskBrain"

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`✓ ${name}`)
}

function makeResident(
  room: string,
  name: string,
  level: "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY",
  score: number,
  extras: Partial<Parameters<typeof wardResidentFromCoordinator>[0]> = {},
) {
  const coordinator = runMasterCoordinatorBrain({
    patient: { name, room },
    riskBrain: runRiskBrain({
      room,
      patientName: name,
      bloodPressure: level === "EMERGENCY" ? "78/48" : level === "HIGH" ? "90/56" : "120/80",
      mobility: level === "LOW" ? "Independent" : "Weak",
    }),
  })

  return wardResidentFromCoordinator({
    room,
    patientName: name,
    coordinator: {
      ...coordinator,
      overallRiskLevel: level,
      overallRiskScore: score,
      doctorReviewRequired: level === "HIGH" || level === "EMERGENCY" ? "YES" : "NO",
    },
    ...extras,
  })
}

const residents = [
  makeResident("201", "Fung Poh Chai", "HIGH", 85, {
    turningOverdue: true,
    medicationIssues: ["Missed BP tablet"],
    familyUpdatePending: true,
  }),
  makeResident("203", "Lim Ah Seng", "EMERGENCY", 92, {
    turningOverdue: true,
    medicationIssues: ["Refused evening dose"],
    familyUpdatePending: true,
  }),
  makeResident("205", "Wong Siew Lan", "HIGH", 78, { turningOverdue: true, familyUpdatePending: true }),
  makeResident("208", "Tan Ah Kow", "HIGH", 74, { familyUpdatePending: true }),
  makeResident("210", "Ng Mei Fong", "HIGH", 70, { familyUpdatePending: true }),
  ...Array.from({ length: 12 }, (_, index) =>
    makeResident(String(300 + index), `Medium Patient ${index + 1}`, "MEDIUM", 45 + index),
  ),
  ...Array.from({ length: 28 }, (_, index) =>
    makeResident(String(400 + index), `Low Patient ${index + 1}`, "LOW", 10 + index),
  ),
]

const dashboard = generateWardDashboard({
  residents,
  doctorReviewQueue: [
    { room: "201", patientName: "Fung Poh Chai", status: "PENDING", reasons: ["BP 90/56"] },
    { room: "203", patientName: "Lim Ah Seng", status: "PENDING", reasons: ["Chest pain"] },
  ],
  familyUpdateQueue: [
    { room: "201", patientName: "Fung Poh Chai", status: "DRAFT" },
    { room: "203", patientName: "Lim Ah Seng", status: "DRAFT" },
  ],
})

assert("total residents 45", dashboard.counts.totalResidents === 45)
assert("high risk 5", dashboard.counts.highRisk === 5)
assert("medium risk 12", dashboard.counts.mediumRisk === 12)
assert("low risk 28", dashboard.counts.lowRisk === 28)
assert("doctor reviews pending", dashboard.pending.doctorReviewsPending >= 4)
assert("turning overdue 3", dashboard.pending.turningOverdue === 3)
assert("medication issues 2", dashboard.pending.medicationIssues === 2)
assert("family updates pending", dashboard.pending.familyUpdatesPending >= 5)
assert("top 5 includes Room 201", dashboard.topHighestRiskResidents[0]?.includes("Room 203") || dashboard.topHighestRiskResidents[0]?.includes("Room 201"))
assert("dashboard text format", dashboard.dashboardText.includes("Residents: 45"))
assert("dashboard HIGH RISK line", dashboard.dashboardText.includes("HIGH RISK: 5"))
assert("dashboard top 5 section", dashboard.dashboardText.includes("Top 5 Highest Risk Residents"))

console.log("\n=== Ward Dashboard ===")
console.log(dashboard.dashboardText)
console.log("\n✓ Ward Dashboard Brain tests passed.")
