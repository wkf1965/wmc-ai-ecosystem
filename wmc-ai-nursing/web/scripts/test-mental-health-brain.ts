/**
 * Mental Health Brain rule tests + Telegram example.
 * Run: npx tsx scripts/test-mental-health-brain.ts
 */
import { analyzeMentalHealth } from "../src/ai/mentalHealthBrain"
import { buildMentalHealthBrainInput } from "../src/lib/server/mentalHealthBrainInput"

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`✓ ${name}`)
}

const suicidal = analyzeMentalHealth({
  room: "201",
  patientName: "Fung Poh Chai",
  suicidalStatement: "patient says wants to die",
})
assert("suicidal → mental HIGH", suicidal.mentalRisk === "HIGH")
assert("suicidal → behaviour HIGH", suicidal.behaviourRisk === "HIGH")
assert("suicidal → overall HIGH", suicidal.mentalHealthRisk === "HIGH")
assert("suicidal → doctor review", suicidal.doctorReview === "YES")
assert("suicidal → 1:1 supervision", suicidal.nursingActions.includes("1:1 supervision"))

const aggression = analyzeMentalHealth({
  room: "105",
  patientName: "Tan Ah Kow",
  aggression: true,
})
assert("aggression → behaviour HIGH", aggression.behaviourRisk === "HIGH")
assert("aggression detected", aggression.reasons.includes("Aggression"))

const agitation = analyzeMentalHealth({
  room: "302",
  patientName: "Lim Bee Hwa",
  agitation: "agitated and restless",
})
assert("agitation → behaviour MEDIUM", agitation.behaviourRisk === "MEDIUM")

const wandering = analyzeMentalHealth({
  room: "208",
  patientName: "Wong Siew Lan",
  wandering: true,
})
assert("wandering → behaviour MEDIUM", wandering.behaviourRisk === "MEDIUM")
assert("wandering → close observation", wandering.nursingActions.includes("Close observation"))

const anxiety = analyzeMentalHealth({
  room: "203",
  patientName: "Ng Mei Fong",
  anxiety: true,
})
assert("anxiety → mental MEDIUM", anxiety.mentalRisk === "MEDIUM")

const depression = analyzeMentalHealth({
  room: "201",
  patientName: "Fung Poh Chai",
  depression: "low mood",
})
assert("depression → mental MEDIUM", depression.mentalRisk === "MEDIUM")

const hallucination = analyzeMentalHealth({
  room: "201",
  patientName: "Fung Poh Chai",
  hallucination: "hearing voices",
})
assert("hallucination → mental HIGH", hallucination.mentalRisk === "HIGH")
assert("hallucination → doctor review", hallucination.doctorReview === "YES")

const insomnia = analyzeMentalHealth({
  room: "201",
  patientName: "Fung Poh Chai",
  insomnia: "cannot sleep",
})
assert("insomnia → mental MEDIUM", insomnia.mentalRisk === "MEDIUM")

const textDetect = analyzeMentalHealth({
  text: "Room 201 patient agitated aggressive wandering anxious",
})
assert("text → agitation detected", textDetect.reasons.includes("Agitation"))
assert("text → aggression detected", textDetect.reasons.includes("Aggression"))
assert("text → wandering detected", textDetect.reasons.includes("Wandering"))
assert("text → anxiety detected", textDetect.reasons.includes("Anxiety"))

const agitationAggression = analyzeMentalHealth({
  agitation: true,
  aggression: true,
})
assert("agitation + aggression → behaviour HIGH", agitationAggression.behaviourRisk === "HIGH")

const exampleText = "Room 201 Fung Poh Chai wandering agitation insomnia"
const exampleInput = buildMentalHealthBrainInput({ text: exampleText })
const example = analyzeMentalHealth({
  ...exampleInput,
  room: exampleInput.room ?? "201",
  patientName: exampleInput.patientName ?? "Fung Poh Chai",
})

assert("example → HIGH mental health risk", example.mentalHealthRisk === "HIGH")
assert("example → wandering reason", example.reasons.includes("Wandering"))
assert("example → agitation reason", example.reasons.includes("Agitation"))
assert("example → insomnia reason", example.reasons.includes("Insomnia"))
assert("example → doctor review", example.doctorReview === "YES")
assert("example telegram → Mental Health Risk: HIGH", example.telegramReply.includes("Mental Health Risk: HIGH"))
assert("example telegram → Close observation", example.telegramReply.includes("Close observation"))
assert("example telegram → Redirect patient", example.telegramReply.includes("Redirect patient"))
assert("example telegram → Document behaviour", example.telegramReply.includes("Document behaviour"))
assert("example telegram → Doctor review recommended", example.telegramReply.includes("Doctor review recommended"))

const low = analyzeMentalHealth({
  room: "203",
  patientName: "Ng Mei Fong",
  text: "calm and cooperative",
})
assert("no findings → LOW", low.mentalHealthRisk === "LOW")
assert("no findings → no doctor review", low.doctorReview === "NO")

console.log("\n=== Telegram example ===")
console.log(example.telegramReply)
console.log("\n✓ Mental Health Brain tests passed.")
