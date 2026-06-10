/**
 * AI Brain pipeline test — Telegram nursing input flow.
 * Run: npx tsx scripts/test-ai-brain-pipeline.ts
 */
import { runAiBrainPipeline } from "../src/ai/pipeline"

const text = "Room 201 Fung Poh Chai poor appetite BP 90/56 weak mobility"

const result = runAiBrainPipeline({
  text,
  patientName: "Fung Poh Chai",
  room: "201",
  bloodPressure: "90/56",
  nutrition: "Poor appetite",
  mobility: "Weak",
})

console.log("=== Pipeline stages ===")
console.log("NLP:", result.nlp)
console.log("Risk level:", result.riskLevel, "score:", result.riskScore)
console.log("Alert:", {
  sendTelegramAlert: result.alert.sendTelegramAlert,
  notifyDoctor: result.alert.notifyDoctor,
  notifyFamily: result.alert.notifyFamily,
  priority: result.alert.priority,
})
console.log("Doctor review:", result.doctorReview)
console.log("Doctor queue status:", result.doctorQueueStatus)
console.log("\n=== Telegram reply ===")
console.log(result.telegramReply)

const required = [
  "Patient: Fung Poh Chai",
  "Room: 201",
  "Risk Level: 🔴 HIGH",
  "Risk Score: 85",
  "Reasons:",
  "BP 90/56",
  "Actions:",
  "Doctor Review: YES",
  "Doctor Queue: PENDING",
  "Family Update: RECOMMENDED",
  "Family Message:",
  "Dear family, today Fung Poh Chai in Room 201 has low blood pressure, poor appetite and weak mobility",
  "Doctor review is recommended",
  "Recheck Time: 30 minutes",
]

for (const line of required) {
  if (!result.telegramReply.includes(line)) {
    throw new Error(`Missing in telegram reply: ${line}`)
  }
}

console.log("\n✓ AI Brain pipeline test passed.")
