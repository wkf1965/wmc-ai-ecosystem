/**
 * Fall Prevention Brain rule tests.
 * Run: npx tsx scripts/test-fall-prevention-brain.ts
 */
import { analyzeFallRisk } from "../src/ai/fallPreventionBrain"

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`✓ ${name}`)
}

const weakMobility = analyzeFallRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  mobility: "weak mobility",
})
assert("weak mobility → MEDIUM", weakMobility.fallRisk === "MEDIUM")
assert("weak mobility → fall precaution", weakMobility.nursingActions.includes("Fall precaution"))

const weakLowBp = analyzeFallRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  mobility: "weak",
  bp: "90/56",
})
assert("weak mobility + low BP → HIGH", weakLowBp.fallRisk === "HIGH")
assert("weak mobility + low BP → doctor review", weakLowBp.doctorReview === "YES")

const previousFall = analyzeFallRisk({
  room: "105",
  patientName: "Tan Ah Kow",
  previousFall: true,
})
assert("previous fall → HIGH", previousFall.fallRisk === "HIGH")

const dizziness = analyzeFallRisk({
  room: "302",
  patientName: "Lim Bee Hwa",
  dizziness: true,
})
assert("dizziness → HIGH", dizziness.fallRisk === "HIGH")
assert("dizziness → monitor dizziness", dizziness.nursingActions.includes("Monitor dizziness"))

const confusion = analyzeFallRisk({
  room: "208",
  patientName: "Wong Siew Lan",
  confusion: "confused",
})
assert("confusion → HIGH", confusion.fallRisk === "HIGH")

const sedative = analyzeFallRisk({
  room: "203",
  patientName: "Ng Mei Fong",
  sedativeMedication: true,
})
assert("sedative medication → MEDIUM", sedative.fallRisk === "MEDIUM")

const vision = analyzeFallRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  visionProblem: true,
})
assert("vision problem → MEDIUM", vision.fallRisk === "MEDIUM")

const toileting = analyzeFallRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  toiletingFrequency: "frequent toileting",
})
assert("frequent toileting → MEDIUM", toileting.fallRisk === "MEDIUM")

const fallAndDizzy = analyzeFallRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  previousFall: true,
  dizziness: true,
})
assert("previous fall + dizziness → HIGH", fallAndDizzy.fallRisk === "HIGH")
assert("combined reason", fallAndDizzy.reasons.includes("Previous fall with dizziness"))

const low = analyzeFallRisk({
  room: "203",
  patientName: "Ng Mei Fong",
  mobility: "independent",
})
assert("independent mobility → LOW", low.fallRisk === "LOW")
assert("low → no doctor review", low.doctorReview === "NO")

const highActions = analyzeFallRisk({
  room: "201",
  patientName: "Fung Poh Chai",
  mobility: "weak",
  bp: "88/54",
})
assert("HIGH → call bell", highActions.nursingActions.includes("Keep call bell within reach"))
assert("HIGH → bed lowest", highActions.nursingActions.includes("Bed in lowest position"))
assert("HIGH → inform nurse", highActions.nursingActions.includes("Inform nurse in charge"))

console.log("\nSample HIGH alert:")
console.log(weakLowBp.alertMessage)
console.log("\n✓ Fall Prevention Brain tests passed.")
