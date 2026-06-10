/**
 * Predictive Risk Brain tests.
 * Run: npx tsx scripts/test-predictive-risk-brain.ts
 */
import { predictRisk } from "../src/ai/predictiveRiskBrain"
import { analyzeFallRisk } from "../src/ai/fallPreventionBrain"
import { analyzeNutrition } from "../src/ai/nutritionBrain"
import { analyzeTurningRisk } from "../src/ai/turningBrain"
import { runRiskBrain } from "../src/ai/riskBrain"
import { runMasterCoordinatorBrain } from "../src/ai/masterCoordinatorBrain"

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`✓ ${name}`)
}

const fallCase = predictRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  mobility: "weak mobility",
  previousFall: true,
  dizziness: true,
  fallPreventionBrain: analyzeFallRisk({
    room: "201",
    patientName: "Fung Poh Chai",
    mobility: "weak",
    previousFall: true,
    dizziness: true,
  }),
})
assert("fall 24h → HIGH", fallCase.fallRisk24h.level === "HIGH")
assert("fall 24h has reasons", fallCase.fallRisk24h.reasons.length > 0)

const pressureCase = predictRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  bedridden: true,
  turningOverdue: true,
  redness: true,
  turningBrain: analyzeTurningRisk({
    room: "201",
    patientName: "Fung Poh Chai",
    bedridden: true,
    lastTurnedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    redness: true,
  }),
})
assert("pressure sore 48h → HIGH", pressureCase.pressureSoreRisk48h.level === "HIGH")

const dehydrationCase = predictRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  fluidIntake: "low",
  poorAppetite: true,
  urineOutput: "no urine 8 hours",
  nutritionBrain: analyzeNutrition({
    room: "201",
    patientName: "Fung Poh Chai",
    appetite: "poor appetite",
    fluidIntake: "low",
    mealPercentage: 20,
  }),
})
assert("dehydration 24h → HIGH", dehydrationCase.dehydrationRisk24h.level === "HIGH")

const transferCase = predictRisk({
  room: "203",
  patientName: "Lim Ah Seng",
  bloodPressure: "78/48",
  spo2: 88,
  chestPain: true,
  riskBrain: runRiskBrain({
    room: "203",
    patientName: "Lim Ah Seng",
    bloodPressure: "78/48",
    spo2: 88,
    conditions: ["Chest pain"],
  }),
})
assert("hospital transfer → HIGH", transferCase.hospitalTransferRisk.level === "HIGH")

const readmissionCase = predictRisk({
  room: "105",
  patientName: "Tan Ah Kow",
  recentHospitalization: true,
  multipleComorbidities: true,
  poorAdherence: true,
  livingAlone: true,
})
assert("readmission → HIGH", readmissionCase.readmissionRisk.level === "HIGH")

const lowCase = predictRisk({
  room: "203",
  patientName: "Ng Mei Fong",
  mobility: "independent",
  fluidIntake: "1200ml",
})
assert("stable patient → fall LOW", lowCase.fallRisk24h.level === "LOW")
assert("stable patient → pressure LOW", lowCase.pressureSoreRisk48h.level === "LOW")
assert("stable patient → dehydration LOW", lowCase.dehydrationRisk24h.level === "LOW")

const combined = predictRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  mobility: "Weak",
  bloodPressure: "90/56",
  bedridden: true,
  turningOverdue: true,
  fluidIntake: "low",
  poorAppetite: true,
  masterCoordinator: runMasterCoordinatorBrain({
    patient: { name: "Fung Poh Chai", room: "201" },
    riskBrain: runRiskBrain({ bloodPressure: "90/56", mobility: "Weak", nutrition: "Poor appetite" }),
    turningBrain: analyzeTurningRisk({ bedridden: true, lastTurnedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() }),
    nutritionBrain: analyzeNutrition({ appetite: "poor", fluidIntake: "low" }),
  }),
})

assert("combined → multiple HIGH forecasts", [
  combined.fallRisk24h.level,
  combined.pressureSoreRisk48h.level,
  combined.dehydrationRisk24h.level,
].filter((level) => level === "HIGH").length >= 2)

console.log("\n=== Predictive Risk Forecast ===")
console.log(`Fall (24h): ${combined.fallRisk24h.level} — ${combined.fallRisk24h.reasons.join("; ")}`)
console.log(`Pressure sore (48h): ${combined.pressureSoreRisk48h.level} — ${combined.pressureSoreRisk48h.reasons.join("; ")}`)
console.log(`Dehydration (24h): ${combined.dehydrationRisk24h.level} — ${combined.dehydrationRisk24h.reasons.join("; ")}`)
console.log(`Hospital transfer: ${combined.hospitalTransferRisk.level} — ${combined.hospitalTransferRisk.reasons.join("; ")}`)
console.log(`Readmission: ${combined.readmissionRisk.level} — ${combined.readmissionRisk.reasons.join("; ")}`)
console.log("\n✓ Predictive Risk Brain tests passed.")
