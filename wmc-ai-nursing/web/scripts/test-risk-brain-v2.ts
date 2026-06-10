/**
 * Risk Brain V2 — rule coverage tests.
 * Run: npx tsx scripts/test-risk-brain-v2.ts
 */
import { assessNursingRisk } from "../src/lib/server/riskBrainV2Input"
import { runRiskBrainV2 } from "../src/lib/server/riskBrainV2"

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`✓ ${name}`)
}

// ── Spec case: Room 201 Fung Poh Chai poor appetite BP 90/56 weak mobility ──
const spec = assessNursingRisk({
  note: "Room 201 Fung Poh Chai poor appetite BP 90/56 weak mobility",
  patientName: "Fung Poh Chai",
  room: "201",
})
assert("spec riskLevel HIGH", spec.riskLevel === "HIGH")
assert("spec has Hypotension", spec.categories.includes("Hypotension Risk"))
assert("spec has Nutrition", spec.categories.includes("Nutrition Risk"))
assert("spec has Fall", spec.categories.includes("Fall Risk"))
assert("spec doctorReview YES", spec.doctorReview === "YES")
assert("spec familyUpdate RECOMMENDED", spec.familyUpdate === "RECOMMENDED")
assert("spec recheckTime 30 minutes", spec.recheckTime === "30 minutes")
assert("spec combined reason", spec.reasons.some((r) => r.includes("combined high risk")))

// ── Rule matrix ──
const rules: Array<{ name: string; input: Parameters<typeof runRiskBrainV2>[0]; expect: Partial<typeof spec> }> = [
  {
    name: "BP 90/60 HIGH hypotension",
    input: { bloodPressure: "90/60" },
    expect: { riskLevel: "HIGH", categories: ["Hypotension Risk"] },
  },
  {
    name: "BP 79/49 EMERGENCY hypotension",
    input: { bloodPressure: "79/49" },
    expect: { riskLevel: "EMERGENCY", categories: ["Hypotension Risk", "Emergency Risk"] },
  },
  {
    name: "Poor appetite HIGH nutrition",
    input: { nutrition: "Poor appetite" },
    expect: { riskLevel: "HIGH", categories: ["Nutrition Risk"] },
  },
  {
    name: "Weak mobility HIGH fall",
    input: { mobility: "Weak" },
    expect: { riskLevel: "HIGH", categories: ["Fall Risk"] },
  },
  {
    name: "Fever 38 MEDIUM infection",
    input: { temperature: "38.0" },
    expect: { riskLevel: "MEDIUM", categories: ["Infection / Fever Risk"] },
  },
  {
    name: "Fever 39 HIGH infection",
    input: { temperature: "39.1" },
    expect: { riskLevel: "HIGH", categories: ["Infection / Fever Risk"] },
  },
  {
    name: "SpO2 93 HIGH emergency category",
    input: { spo2: "93" },
    expect: { riskLevel: "HIGH", categories: ["Emergency Risk"] },
  },
  {
    name: "SpO2 89 EMERGENCY",
    input: { spo2: "89" },
    expect: { riskLevel: "EMERGENCY", categories: ["Emergency Risk"] },
  },
  {
    name: "Chest pain EMERGENCY",
    input: { conditions: ["Chest pain"] },
    expect: { riskLevel: "EMERGENCY", doctorReview: "YES", familyUpdate: "YES" },
  },
  {
    name: "Difficulty breathing EMERGENCY",
    input: { conditions: ["Shortness of breath"] },
    expect: { riskLevel: "EMERGENCY" },
  },
  {
    name: "Unconscious EMERGENCY",
    input: { conditions: ["Unconscious"] },
    expect: { riskLevel: "EMERGENCY" },
  },
  {
    name: "Normal vitals LOW",
    input: { bloodPressure: "120/80", spo2: "98", temperature: "36.8" },
    expect: { riskLevel: "LOW", riskScore: 0, doctorReview: "NO", familyUpdate: "NO" },
  },
]

for (const r of rules) {
  const out = runRiskBrainV2(r.input)
  if (r.expect.riskLevel) assert(`${r.name} → ${r.expect.riskLevel}`, out.riskLevel === r.expect.riskLevel)
  if (r.expect.riskScore != null) assert(`${r.name} score`, out.riskScore === r.expect.riskScore)
  if (r.expect.doctorReview) assert(`${r.name} doctorReview`, out.doctorReview === r.expect.doctorReview)
  if (r.expect.familyUpdate) assert(`${r.name} familyUpdate`, out.familyUpdate === r.expect.familyUpdate)
  if (r.expect.categories) {
    for (const c of r.expect.categories) assert(`${r.name} has ${c}`, out.categories.includes(c))
  }
}

console.log("\nSpec output:")
console.log(JSON.stringify(spec, null, 2))
console.log("\nAll Risk Brain V2 tests passed.")
