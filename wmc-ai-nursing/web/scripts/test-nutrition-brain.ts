/**
 * Nutrition Brain rule tests + Telegram example.
 * Run: npx tsx scripts/test-nutrition-brain.ts
 */
import { analyzeNutrition } from "../src/ai/nutritionBrain"
import { buildNutritionBrainInput } from "../src/lib/server/nutritionBrainInput"

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`✓ ${name}`)
}

const poorAppetite = analyzeNutrition({
  room: "201",
  patientName: "Fung Poh Chai",
  appetite: "poor appetite",
})
assert("poor appetite → HIGH nutrition", poorAppetite.nutritionRisk === "HIGH")
assert("poor appetite → doctor review", poorAppetite.doctorReview === "YES")
assert("poor appetite → family recommended", poorAppetite.familyUpdate === "RECOMMENDED")

const mealMedium = analyzeNutrition({
  room: "105",
  patientName: "Tan Ah Kow",
  mealPercentage: 40,
})
assert("meal <50% → MEDIUM nutrition", mealMedium.nutritionRisk === "MEDIUM")
assert("meal <50% → no doctor review", mealMedium.doctorReview === "NO")

const mealHigh = analyzeNutrition({
  room: "302",
  patientName: "Lim Bee Hwa",
  mealPercentage: "20%",
})
assert("meal <25% → HIGH nutrition", mealHigh.nutritionRisk === "HIGH")

const weightLoss = analyzeNutrition({
  room: "208",
  patientName: "Wong Siew Lan",
  weightLoss: true,
})
assert("weight loss → HIGH nutrition", weightLoss.nutritionRisk === "HIGH")

const lowFluid = analyzeNutrition({
  room: "201",
  patientName: "Fung Poh Chai",
  fluidIntake: "low",
})
assert("low fluid → MEDIUM dehydration", lowFluid.dehydrationRisk === "MEDIUM")
assert("low fluid → encourage fluids", lowFluid.nursingActions.includes("Encourage oral fluid if allowed"))

const noUrine = analyzeNutrition({
  room: "203",
  patientName: "Ng Mei Fong",
  urineOutput: "no urine 8 hours",
})
assert("no urine 8h → HIGH dehydration", noUrine.dehydrationRisk === "HIGH")

const vomiting = analyzeNutrition({
  room: "201",
  patientName: "Fung Poh Chai",
  vomiting: true,
})
assert("vomiting → MEDIUM dehydration", vomiting.dehydrationRisk === "MEDIUM")

const bothGi = analyzeNutrition({
  room: "201",
  patientName: "Fung Poh Chai",
  vomiting: true,
  diarrhea: true,
})
assert("vomiting + diarrhea → HIGH dehydration", bothGi.dehydrationRisk === "HIGH")

const dryWeak = analyzeNutrition({
  room: "201",
  patientName: "Fung Poh Chai",
  dryMouth: true,
  weakness: true,
})
assert("dry mouth + weakness → HIGH dehydration", dryWeak.dehydrationRisk === "HIGH")

const low = analyzeNutrition({
  room: "203",
  patientName: "Ng Mei Fong",
  appetite: "good",
  mealPercentage: 80,
  fluidIntake: "1200ml",
})
assert("normal intake → LOW nutrition", low.nutritionRisk === "LOW")
assert("normal intake → LOW dehydration", low.dehydrationRisk === "LOW")
assert("normal intake → no family update", low.familyUpdate === "NO")

const combined = analyzeNutrition({
  room: "201",
  patientName: "Fung Poh Chai",
  appetite: "poor",
  fluidIntake: "low",
  mealPercentage: 30,
})
assert("combined → encourage meals", combined.nursingActions.includes("Encourage small frequent meals"))
assert("combined → monitor I/O", combined.nursingActions.includes("Monitor intake/output chart"))
assert("combined → inform nurse", combined.nursingActions.includes("Inform nurse in charge"))

const exampleText = "Room 201 Fung Poh Chai poor appetite ate 20% low fluid weak"
const exampleInput = buildNutritionBrainInput({ text: exampleText })
const example = analyzeNutrition({
  ...exampleInput,
  room: exampleInput.room ?? "201",
  patientName: exampleInput.patientName ?? "Fung Poh Chai",
})

assert("example → HIGH nutrition", example.nutritionRisk === "HIGH")
assert("example → MEDIUM dehydration", example.dehydrationRisk === "MEDIUM")
assert("example telegram → Nutrition Risk: HIGH", example.telegramReply.includes("Nutrition Risk: HIGH"))
assert("example telegram → Dehydration Risk: MEDIUM", example.telegramReply.includes("Dehydration Risk: MEDIUM"))
assert("example telegram → Encourage small frequent meals", example.telegramReply.includes("Encourage small frequent meals"))
assert("example telegram → Monitor intake/output", example.telegramReply.includes("Monitor intake/output"))
assert("example telegram → Doctor review recommended", example.telegramReply.includes("Doctor review recommended"))

console.log("\n=== Telegram example ===")
console.log(example.telegramReply)
console.log("\nSample poor appetite alert:")
console.log(poorAppetite.alertMessage)
console.log("\n✓ Nutrition Brain tests passed.")
