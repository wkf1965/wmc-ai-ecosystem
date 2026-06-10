import { NextResponse } from "next/server"
import { analyzeTurningRisk, type TurningBrainInput } from "../../../../ai/turningBrain"
import { buildTurningBrainInput } from "../../../../lib/server/turningBrainInput"

type PostPayload = TurningBrainInput & {
  text?: string | null
}

/** POST /api/ai/turning — assess turning / pressure sore risk */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PostPayload | null
  const text = String(payload?.text ?? "").trim()

  if (!text && !payload?.room && !payload?.bedridden) {
    return NextResponse.json({ ok: false, error: "Provide text and/or turning fields to analyze." }, { status: 400 })
  }

  const input = buildTurningBrainInput(payload ?? { text })
  const result = analyzeTurningRisk(input)

  // eslint-disable-next-line no-console
  console.log(
    `[TurningBrain] ${input.patientName || "Unknown"} room ${input.room || "?"} → ${result.pressureSoreRisk} overdue=${result.turningOverdue}`,
  )

  return NextResponse.json({
    ok: true,
    ...result,
    patientName: input.patientName,
    room: input.room,
  })
}
