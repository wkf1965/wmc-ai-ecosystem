/**
 * Master Coordinator Brain tests.
 * Run: npx tsx scripts/test-master-coordinator-brain.ts
 */
import { runMasterCoordinatorBrain } from "../src/ai/masterCoordinatorBrain"
import { analyzeFallRisk } from "../src/ai/fallPreventionBrain"
import { analyzeMedication } from "../src/ai/medicationBrain"
import { analyzeNutrition } from "../src/ai/nutritionBrain"
import { analyzeTurningRisk } from "../src/ai/turningBrain"
import { analyzeMentalHealth } from "../src/ai/mentalHealthBrain"
import { runRiskBrain } from "../src/ai/riskBrain"

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`✓ ${name}`)
}

const riskBrain = runRiskBrain({
  room: "201",
  patientName: "Fung Poh Chai",
  bloodPressure: "90/56",
  mobility: "Weak",
  nutrition: "Poor appetite",
})

const fallPreventionBrain = analyzeFallRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  mobility: "weak mobility",
  dizziness: true,
})

const medicationBrain = analyzeMedication({
  room: "201",
  patientName: "Fung Poh Chai",
  medicationName: "Amlodipine 5mg",
  status: "missed",
})

const nutritionBrain = analyzeNutrition({
  room: "201",
  patientName: "Fung Poh Chai",
  appetite: "poor appetite",
  mealPercentage: 20,
  fluidIntake: "low",
})

const turningBrain = analyzeTurningRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  bedridden: true,
  lastTurnedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
})

const mentalHealthBrain = analyzeMentalHealth({
  room: "201",
  patientName: "Fung Poh Chai",
  wandering: true,
  agitation: true,
  insomnia: true,
})

const combined = runMasterCoordinatorBrain({
  patient: { name: "Fung Poh Chai", room: "201" },
  riskBrain,
  fallPreventionBrain,
  medicationBrain,
  nutritionBrain,
  turningBrain,
  woundCareBrain: {
    woundRisk: "HIGH",
    reasons: ["Sacrum wound with exudate"],
    doctorReview: "YES",
    nursingActions: ["Dress wound", "Monitor wound site"],
  },
  mentalHealthBrain,
})

assert("combined → HIGH or EMERGENCY overall", combined.overallRiskLevel === "HIGH" || combined.overallRiskLevel === "EMERGENCY")
assert("combined → priority 1 or 2", combined.priority === 1 || combined.priority === 2)
assert("combined → score > 0", combined.overallRiskScore > 0)
assert("combined → top problems populated", combined.topProblems.length >= 4)
assert("combined → doctor review required", combined.doctorReviewRequired === "YES")
assert("combined → nursing actions populated", combined.nursingPriorityActions.length >= 3)
assert("combined → nursing summary populated", combined.nursingSummary.length > 40)
assert("combined → next review time set", combined.nextReviewTime.length > 0)

const low = runMasterCoordinatorBrain({
  patient: { name: "Ng Mei Fong", room: "203" },
  riskBrain: runRiskBrain({ room: "203", patientName: "Ng Mei Fong", bloodPressure: "120/80" }),
})

assert("low case → LOW overall", low.overallRiskLevel === "LOW")
assert("low case → priority 4", low.priority === 4)
assert("low case → no doctor review", low.doctorReviewRequired === "NO")

console.log("\n=== Master Coordinator Summary ===")
console.log(`Overall: ${combined.overallRiskLevel} (${combined.overallRiskScore}) priority ${combined.priority}`)
console.log("\nTop problems:")
combined.topProblems.forEach((problem, index) => console.log(`${index + 1}. ${problem}`))
console.log("\nPriority actions:")
combined.nursingPriorityActions.forEach((action, index) => console.log(`${index + 1}. ${action}`))
console.log("\nNursing summary:")
console.log(combined.nursingSummary)
console.log("\n✓ Master Coordinator Brain tests passed.")
