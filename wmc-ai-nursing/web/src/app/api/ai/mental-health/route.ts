import { NextResponse } from "next/server"
import { analyzeMentalHealth, type MentalHealthBrainInput } from "../../../../ai/mentalHealthBrain"
import { buildMentalHealthBrainInput } from "../../../../lib/server/mentalHealthBrainInput"

type PostPayload = MentalHealthBrainInput & {
  text?: string | null
}

/** POST /api/ai/mental-health — assess mental health and behavioural risk */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PostPayload | null
  const text = String(payload?.text ?? "").trim()

  if (!text && !payload?.agitation && !payload?.wandering && !payload?.suicidalStatement) {
    return NextResponse.json(
      { ok: false, error: "Provide text and/or mental health fields to analyze." },
      { status: 400 },
    )
  }

  const input = buildMentalHealthBrainInput(payload ?? { text })
  const result = analyzeMentalHealth(input)

  // eslint-disable-next-line no-console
  console.log(
    `[MentalHealthBrain] ${input.patientName || "Unknown"} room ${input.room || "?"} → ${result.mentalHealthRisk} reasons=${result.reasons.length}`,
  )

  return NextResponse.json({
    ok: true,
    ...result,
    patientName: input.patientName,
    room: input.room,
  })
}
