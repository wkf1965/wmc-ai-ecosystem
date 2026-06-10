/**
 * Daily Nursing Report Brain tests.
 * Run: npx tsx scripts/test-daily-report-brain.ts
 */
import { generateDailyNursingReport } from "../src/ai/dailyReportBrain"
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
      bloodPressure: level === "HIGH" ? "90/56" : "120/80",
      mobility: level === "LOW" ? "Independent" : "Weak",
      nutrition: extras.poorAppetite ? "Poor appetite" : undefined,
    }),
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
    turningReasons: (extras.turningReasons as string[]) ?? [],
    woundCases: (extras.woundCases as string[]) ?? [],
    fallRisk: extras.fallRisk as boolean | undefined,
    poorAppetite: extras.poorAppetite as boolean | undefined,
    nutritionReasons: (extras.nutritionReasons as string[]) ?? [],
    doctorReviewRequired: extras.doctorReviewRequired as "YES" | undefined,
  }
}

const records = [
  makeResident("201", "Fung Poh Chai", "HIGH", 85, {
    turningOverdue: true,
    turningReasons: ["Last turned 3 hours ago"],
    medicationIssues: ["Missed 8pm BP tablet"],
    woundCases: ["Sacrum wound dressing due"],
    familyUpdatePending: true,
    fallRisk: true,
    poorAppetite: true,
    nutritionReasons: ["Poor appetite", "Low fluid intake"],
  }),
  makeResident("203", "Lim Ah Seng", "EMERGENCY", 92, {
    doctorReviewRequired: "YES",
    fallRisk: true,
    familyUpdatePending: true,
  }),
  makeResident("205", "Wong Siew Lan", "HIGH", 78, { fallRisk: true }),
  ...Array.from({ length: 3 }, (_, i) => makeResident(String(300 + i), `Medium ${i + 1}`, "MEDIUM", 40)),
  ...Array.from({ length: 5 }, (_, i) => makeResident(String(400 + i), `Low ${i + 1}`, "LOW", 10)),
]

const report = generateDailyNursingReport({
  records,
  date: "2026-06-10",
  shift: "Morning",
  doctorReviewQueue: [
    { room: "203", patientName: "Lim Ah Seng", status: "PENDING", reasons: ["BP 88/50", "Chest pain"], riskLevel: "EMERGENCY" },
  ],
  familyUpdateQueue: [
    { room: "201", patientName: "Fung Poh Chai", status: "DRAFT", familyMessage: "Dear family, poor appetite and low BP today." },
  ],
})

assert("has overall summary", report.sections.overallSummary.length > 20)
assert("high risk residents", report.sections.highRiskResidents.length >= 3)
assert("doctor review section", report.sections.doctorReviewRequired.length >= 1)
assert("turning overdue section", report.sections.turningOverdue.length >= 1)
assert("medication issues section", report.sections.medicationIssues.length >= 1)
assert("wound cases section", report.sections.woundCases.length >= 1)
assert("nutrition section", report.sections.poorAppetiteNutritionRisk.length >= 1)
assert("fall risk section", report.sections.fallRisk.length >= 1)
assert("family updates section", report.sections.familyUpdatesPending.length >= 1)
assert("action plan section", report.sections.actionPlanNextShift.length >= 3)
assert("report text has 10 sections", report.reportText.includes("10. Action Plan for Next Shift"))
assert("report text simple english", report.reportText.includes("Daily Nursing Report"))

console.log("\n=== Daily Nursing Report ===")
console.log(report.reportText)
console.log("\n✓ Daily Nursing Report Brain tests passed.")
