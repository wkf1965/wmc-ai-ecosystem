import { NextResponse } from "next/server"
import { analyzeMedication, type MedicationBrainInput } from "../../../../ai/medicationBrain"
import { buildMedicationBrainInput } from "../../../../lib/server/medicationBrainInput"

type PostPayload = MedicationBrainInput & {
  text?: string | null
}

/** POST /api/ai/medication — assess medication administration risk */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PostPayload | null
  const text = String(payload?.text ?? "").trim()

  if (!text && !payload?.status && !payload?.medicationName) {
    return NextResponse.json({ ok: false, error: "Provide text and/or medication fields to analyze." }, { status: 400 })
  }

  const input = buildMedicationBrainInput(payload ?? { text })
  const result = analyzeMedication(input)

  // eslint-disable-next-line no-console
  console.log(
    `[MedicationBrain] ${input.patientName || "Unknown"} room ${input.room || "?"} → ${result.medicationRisk} missed=${result.missedMedication}`,
  )

  return NextResponse.json({
    ok: true,
    ...result,
    patientName: input.patientName,
    room: input.room,
    medicationName: input.medicationName,
  })
}
