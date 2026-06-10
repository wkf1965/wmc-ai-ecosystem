import { NextResponse } from "next/server"
import { runAiBrainPipeline, type AiBrainPipelineInput } from "../../../../ai/pipeline"

/**
 * AI Brain Pipeline
 *
 * POST /api/ai/brain
 * Body: { text, room?, patientName?, ...structured vitals }
 * Flow: nlpBrain → riskBrain → alertBrain → doctorReviewBrain → familyUpdateBrain
 */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as AiBrainPipelineInput | null
  const text = String(payload?.text ?? payload?.note ?? payload?.remark ?? "").trim()

  if (!text && !payload?.bloodPressure && !payload?.bp && !payload?.vitals) {
    return NextResponse.json({ ok: false, error: "Provide text and/or vitals to analyze." }, { status: 400 })
  }

  const pipeline = runAiBrainPipeline(payload ?? { text })

  // eslint-disable-next-line no-console
  console.log(
    `[AiBrain] ${pipeline.patientName || "Unknown"} room ${pipeline.room || "?"} → ${pipeline.riskLevel} (${pipeline.riskScore})`,
  )

  return NextResponse.json({
    ok: true,
    ...pipeline,
    riskLevel: pipeline.riskLevel,
    riskScore: pipeline.riskScore,
    reasons: pipeline.reasons,
    nursingActions: pipeline.actions,
    doctorReview: pipeline.doctorReviewFlag,
    familyUpdate: pipeline.familyUpdateFlag,
    recheckTime: pipeline.recheckTime,
    alertMessage: pipeline.alert.alertMessage,
  })
}
