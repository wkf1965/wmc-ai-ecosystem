/**
 * Shift Handover Brain tests.
 * Run: npx tsx scripts/test-handover-brain.ts
 */
import { generateShiftHandover } from "../src/ai/handoverBrain"
import { runMasterCoordinatorBrain } from "../src/ai/masterCoordinatorBrain"
import { runRiskBrain } from "../src/ai/riskBrain"
import { analyzeTurningRisk } from "../src/ai/turningBrain"
import { analyzeMedication } from "../src/ai/medicationBrain"

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`✓ ${name}`)
}

const fungCoordinator = runMasterCoordinatorBrain({
  patient: { name: "Fung Poh Chai", room: "201" },
  riskBrain: runRiskBrain({
    room: "201",
    patientName: "Fung Poh Chai",
    bloodPressure: "90/56",
    mobility: "Weak",
    nutrition: "Poor appetite",
  }),
  turningBrain: analyzeTurningRisk({
    room: "201",
    patientName: "Fung Poh Chai",
    bedridden: true,
    lastTurnedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  }),
  medicationBrain: analyzeMedication({
    room: "201",
    patientName: "Fung Poh Chai",
    medicationName: "Amlodipine",
    status: "missed",
  }),
  woundCareBrain: {
    woundRisk: "HIGH",
    reasons: ["Sacrum wound dressing due"],
  },
})

const limCoordinator = runMasterCoordinatorBrain({
  patient: { name: "Lim Ah Seng", room: "203" },
  riskBrain: runRiskBrain({
    room: "203",
    patientName: "Lim Ah Seng",
    bloodPressure: "88/50",
    conditions: ["Chest pain"],
  }),
})

const handover = generateShiftHandover({
  shift: "morning",
  generatedAt: "2026-06-10T07:00:00.000Z",
  patients: [
    {
      room: "201",
      patientName: "Fung Poh Chai",
      coordinator: fungCoordinator,
      turningOverdue: true,
      turningReasons: ["Last turned 3 hours ago", "Bedridden"],
      medicationIssues: ["Missed 8pm BP tablet"],
      woundCases: ["Sacrum wound dressing due"],
      familyUpdatePending: true,
      familyUpdateMessage: "Poor appetite and low BP update recommended",
    },
    {
      room: "203",
      patientName: "Lim Ah Seng",
      coordinator: limCoordinator,
      doctorReviewRequired: "YES",
      doctorReviewReasons: ["BP 88/50", "Chest pain"],
    },
  ],
  doctorReviewQueue: [
    {
      room: "203",
      patientName: "Lim Ah Seng",
      riskLevel: "EMERGENCY",
      reasons: ["BP 88/50", "Chest pain"],
      status: "PENDING",
    },
  ],
  familyUpdateQueue: [
    {
      room: "201",
      patientName: "Fung Poh Chai",
      familyMessage: "Dear family, today Fung Poh Chai in Room 201 has low blood pressure...",
      status: "DRAFT",
    },
  ],
})

assert("morning shift title", handover.shiftTitle === "Morning Shift Summary")
assert("high risk includes Room 201", handover.sections.highRiskPatients.some((line) => line.includes("Room 201 Fung Poh Chai")))
assert("high risk includes Room 203", handover.sections.highRiskPatients.some((line) => line.includes("Room 203 Lim Ah Seng")))
assert("doctor review populated", handover.sections.doctorReviewRequired.length >= 2)
assert("overdue turning populated", handover.sections.overdueTurning.length >= 1)
assert("medication issues populated", handover.sections.medicationIssues.length >= 1)
assert("wound cases populated", handover.sections.woundCases.length >= 1)
assert("family updates populated", handover.sections.familyUpdatesPending.length >= 1)
assert("handover text has High Risk Patients", handover.handoverText.includes("High Risk Patients:"))
assert("handover text has Doctor Review Required", handover.handoverText.includes("Doctor Review Required:"))
assert("handover text has Overdue Turning", handover.handoverText.includes("Overdue Turning:"))
assert("handover text has Medication Issues", handover.handoverText.includes("Medication Issues:"))
assert("handover text has Wound Cases", handover.handoverText.includes("Wound Cases:"))
assert("handover text has Family Updates Pending", handover.handoverText.includes("Family Updates Pending:"))

console.log("\n=== Shift Handover ===")
console.log(handover.handoverText)
console.log("\n✓ Shift Handover Brain tests passed.")
