import { NextResponse } from "next/server"
import { analyzeNutrition, type NutritionBrainInput } from "../../../../ai/nutritionBrain"
import { buildNutritionBrainInput } from "../../../../lib/server/nutritionBrainInput"

type PostPayload = NutritionBrainInput & {
  text?: string | null
}

/** POST /api/ai/nutrition — assess nutrition and dehydration risk */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PostPayload | null
  const text = String(payload?.text ?? "").trim()

  if (!text && !payload?.appetite && payload?.mealPercentage == null && !payload?.fluidIntake) {
    return NextResponse.json(
      { ok: false, error: "Provide text and/or nutrition fields to analyze." },
      { status: 400 },
    )
  }

  const input = buildNutritionBrainInput(payload ?? { text })
  const result = analyzeNutrition(input)

  // eslint-disable-next-line no-console
  console.log(
    `[NutritionBrain] ${input.patientName || "Unknown"} room ${input.room || "?"} → nutrition=${result.nutritionRisk} dehydration=${result.dehydrationRisk}`,
  )

  return NextResponse.json({
    ok: true,
    ...result,
    patientName: input.patientName,
    room: input.room,
  })
}
