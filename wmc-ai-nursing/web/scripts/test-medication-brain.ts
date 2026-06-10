/**
 * Medication Brain rule tests + Telegram example.
 * Run: npx tsx scripts/test-medication-brain.ts
 */
import { analyzeMedication } from "../src/ai/medicationBrain"
import { buildMedicationBrainInput } from "../src/lib/server/medicationBrainInput"

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`✓ ${name}`)
}

const missed = analyzeMedication({
  room: "201",
  patientName: "Fung Poh Chai",
  medicationName: "Amlodipine 5mg",
  status: "missed",
  scheduledTime: "2026-06-10T08:00:00.000Z",
})
assert("missed → HIGH", missed.medicationRisk === "HIGH")
assert("missed flag", missed.missedMedication === true)
assert("missed doctor review", missed.doctorReview === "YES")

const refused = analyzeMedication({
  room: "105",
  patientName: "Tan Ah Kow",
  medicationName: "Metformin",
  refused: true,
})
assert("refused → MEDIUM", refused.medicationRisk === "MEDIUM")

const vomited = analyzeMedication({
  room: "302",
  patientName: "Lim Bee Hwa",
  medicationName: "Iron tablet",
  vomited: true,
})
assert("vomited → HIGH", vomited.medicationRisk === "HIGH")

const allergy = analyzeMedication({
  room: "208",
  patientName: "Wong Siew Lan",
  medicationName: "Penicillin",
  reaction: "allergic reaction with rash and breathing difficulty",
})
assert("allergy → HIGH", allergy.medicationRisk === "HIGH")
assert("allergy emergency alert", allergy.alertMessage.includes("MEDICATION EMERGENCY"))
assert("allergy doctor review", allergy.doctorReview === "YES")

const delayedHigh = analyzeMedication({
  room: "201",
  patientName: "Fung Poh Chai",
  medicationName: "Amlodipine 5mg",
  scheduledTime: "2026-06-10T08:00:00.000Z",
  givenTime: "2026-06-10T10:30:00.000Z",
  status: "given",
})
assert("delayed >2h → HIGH", delayedHigh.medicationRisk === "HIGH")

const delayedMedium = analyzeMedication({
  room: "201",
  patientName: "Fung Poh Chai",
  medicationName: "Amlodipine 5mg",
  scheduledTime: "2026-06-10T08:00:00.000Z",
  givenTime: "2026-06-10T09:15:00.000Z",
  status: "given",
})
assert("delayed >1h → MEDIUM", delayedMedium.medicationRisk === "MEDIUM")

const low = analyzeMedication({
  room: "203",
  patientName: "Ng Mei Fong",
  medicationName: "Vitamin D",
  scheduledTime: "2026-06-10T08:00:00.000Z",
  givenTime: "2026-06-10T08:10:00.000Z",
  status: "given",
})
assert("on-time given → LOW", low.medicationRisk === "LOW")
assert("on-time not missed", low.missedMedication === false)

const exampleText = "Room 201 Fung Poh Chai medication missed 8pm blood pressure tablet"
const exampleInput = buildMedicationBrainInput({ text: exampleText })
const example = analyzeMedication({
  ...exampleInput,
  room: exampleInput.room ?? "201",
  patientName: exampleInput.patientName ?? "Fung Poh Chai",
})

assert("example → HIGH", example.medicationRisk === "HIGH")
assert("example → missed", example.missedMedication === true)
assert("example → medication missed reason", example.reasons.includes("Medication missed"))
assert("example → BP tablet not given", example.reasons.includes("BP tablet not given"))
assert("example telegram → Medication Risk: HIGH", example.telegramReply.includes("Medication Risk: HIGH"))
assert("example telegram → Missed Medication: YES", example.telegramReply.includes("Missed Medication: YES"))
assert("example telegram → Inform nurse in charge", example.telegramReply.includes("Inform nurse in charge"))
assert("example telegram → Doctor review recommended", example.telegramReply.includes("Doctor review recommended"))

console.log("\n=== Telegram example ===")
console.log(example.telegramReply)
console.log("\nSample missed alert:")
console.log(missed.alertMessage)
console.log("\n✓ Medication Brain tests passed.")
