/**
 * Executive Dashboard Brain tests.
 * Run: npx tsx scripts/test-executive-dashboard-brain.ts
 */
import { generateExecutiveDashboard } from "../src/ai/executiveDashboardBrain"
import { wardResidentFromCoordinator } from "../src/ai/wardDashboardBrain"
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
  extras: Record<string, unknown> = {},
) {
  const coordinator = runMasterCoordinatorBrain({
    patient: { name, room },
    riskBrain: runRiskBrain({
      room,
      patientName: name,
      bloodPressure: level === "EMERGENCY" ? "78/48" : level === "HIGH" ? "90/56" : "120/80",
      mobility: level === "LOW" ? "Independent" : "Weak",
    }),
    fallPreventionBrain: level !== "LOW" ? { fallRisk: "HIGH" as const, reasons: ["Weak mobility"], nursingActions: [], doctorReview: "YES" as const, alertMessage: "" } : undefined,
  })

  return {
    ...wardResidentFromCoordinator({
      room,
      patientName: name,
      coordinator: { ...coordinator, overallRiskLevel: level, overallRiskScore: score },
      turningOverdue: Boolean(extras.turningOverdue),
      medicationIssues: (extras.medicationIssues as string[]) ?? [],
      familyUpdatePending: Boolean(extras.familyUpdatePending),
    }),
    woundCases: (extras.woundCases as string[]) ?? [],
    fallRisk: extras.fallRisk as boolean | undefined,
  }
}

const records = [
  makeResident("201", "Fung Poh Chai", "HIGH", 85, {
    turningOverdue: true,
    medicationIssues: ["Missed BP tablet"],
    woundCases: ["Sacrum wound"],
    familyUpdatePending: true,
    fallRisk: true,
  }),
  makeResident("203", "Lim Ah Seng", "EMERGENCY", 92, {
    turningOverdue: true,
    medicationIssues: ["Refused dose"],
    familyUpdatePending: true,
    fallRisk: true,
  }),
  makeResident("205", "Wong Siew Lan", "HIGH", 78, { fallRisk: true }),
  makeResident("208", "Tan Ah Kow", "HIGH", 74),
  makeResident("210", "Ng Mei Fong", "HIGH", 70),
  ...Array.from({ length: 12 }, (_, i) => makeResident(String(300 + i), `Medium ${i + 1}`, "MEDIUM", 40 + i)),
  ...Array.from({ length: 28 }, (_, i) => makeResident(String(400 + i), `Low ${i + 1}`, "LOW", 10)),
]

const dashboard = generateExecutiveDashboard({
  records,
  doctorReviewQueue: [{ room: "201", patientName: "Fung Poh Chai", status: "PENDING" }],
  familyUpdateQueue: [{ room: "203", patientName: "Lim Ah Seng", status: "DRAFT" }],
})

assert("totalResidents 45", dashboard.totalResidents === 45)
assert("highRiskCount 4", dashboard.highRiskCount === 4)
assert("emergencyCount 1", dashboard.emergencyCount === 1)
assert("mediumRiskCount 12", dashboard.mediumRiskCount === 12)
assert("lowRiskCount 28", dashboard.lowRiskCount === 28)
assert("turningOverdue 2", dashboard.turningOverdue === 2)
assert("medicationIssues 2", dashboard.medicationIssues === 2)
assert("woundCases 1", dashboard.woundCases === 1)
assert("fallRiskPatients > 0", dashboard.fallRiskPatients > 0)
assert("top5 length 5", dashboard.top5HighestRiskResidents.length === 5)
assert("top5 includes Room 203", dashboard.top5HighestRiskResidents[0]?.includes("Room 203"))
assert("summaryMessage populated", dashboard.summaryMessage.length > 40)

console.log("\n=== Executive Dashboard ===")
console.log(JSON.stringify(dashboard, null, 2))
console.log("\n✓ Executive Dashboard Brain tests passed.")
