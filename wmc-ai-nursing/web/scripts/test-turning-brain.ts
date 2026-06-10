/**
 * Turning Brain rule tests + Telegram example.
 * Run: npx tsx scripts/test-turning-brain.ts
 */
import { analyzeTurningRisk } from "../src/ai/turningBrain"
import { buildTurningBrainInput } from "../src/lib/server/turningBrainInput"

const now = new Date("2026-06-10T10:00:00.000Z")
const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000 - 1).toISOString()
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`✓ ${name}`)
}

const exampleText = "Room 201 Fung Poh Chai bedridden last turned 3 hours ago redness sacrum"
const exampleInput = buildTurningBrainInput({ text: exampleText }, now)
const example = analyzeTurningRisk(exampleInput, now)

assert("example → HIGH risk", example.pressureSoreRisk === "HIGH")
assert("example → overdue", example.turningOverdue === true)
assert("example → reposition now", example.nursingActions.includes("Reposition now"))
assert("example → check sacrum redness", example.nursingActions.includes("Check sacrum redness"))
assert("example → pressure relief", example.nursingActions.includes("Apply pressure relief"))
assert("example → recheck 2h", example.nursingActions.includes("Recheck within 2 hours"))
assert("telegram reply has Pressure Sore Risk: HIGH", example.telegramReply.includes("Pressure Sore Risk: HIGH"))
assert("telegram reply has Turning Overdue: YES", example.telegramReply.includes("Turning Overdue: YES"))

const bedriddenOverdue = analyzeTurningRisk(
  {
    room: "201",
    patientName: "Fung Poh Chai",
    mobility: "Bedbound",
    bedridden: true,
    lastTurnedAt: twoHoursAgo,
  },
  now,
)
assert("bedridden overdue → HIGH risk", bedriddenOverdue.pressureSoreRisk === "HIGH")

const weakMobility = analyzeTurningRisk(
  { room: "105", patientName: "Tan Ah Kow", mobility: "Weak", lastTurnedAt: oneHourAgo },
  now,
)
assert("weak mobility → MEDIUM", weakMobility.pressureSoreRisk === "MEDIUM")

console.log("\n=== Telegram example ===")
console.log(example.telegramReply)
console.log("\n✓ Turning Brain tests passed.")
