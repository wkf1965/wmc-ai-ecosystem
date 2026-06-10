import { NextResponse } from "next/server"
import { assessNursingRisk, type NursingRiskPayload } from "../../../../lib/server/riskBrainV2Input"

/**
 * AI Risk Brain V2
 *
 * POST /api/ai/risk
 * Body: structured vitals and/or free-text note
 * Returns: { ok, riskLevel, riskScore, categories, reasons, nursingActions,
 *            doctorReview, familyUpdate, recheckTime, alertMessage }
 */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as NursingRiskPayload | null
  const hasStructured =
    payload?.bloodPressure ||
    payload?.bp ||
    payload?.vitals?.bp ||
    payload?.vitals?.bloodPressure ||
    payload?.spo2 != null ||
    payload?.vitals?.spo2 != null ||
    payload?.temperature != null ||
    payload?.vitals?.temperature != null ||
    payload?.nutrition ||
    payload?.appetite ||
    payload?.mobility ||
    (Array.isArray(payload?.conditions) && payload.conditions.length > 0)

  const note = [payload?.note, payload?.remark, payload?.remarks].filter(Boolean).join(" ").trim()
  if (!payload || (!note && !hasStructured)) {
    return NextResponse.json(
      { ok: false, error: "Provide a note and/or vitals to analyze." },
      { status: 400 },
    )
  }

  const brain = assessNursingRisk(payload)

  // eslint-disable-next-line no-console
  console.log(
    `[RiskBrainV2] ${payload.patientName || payload.name || "Unknown"} (room ${payload.room || "?"}) → ${brain.riskLevel} (${brain.riskScore})`,
  )

  return NextResponse.json({
    ok: true,
    room: payload.room ?? "",
    patientName: payload.patientName ?? payload.name ?? "",
    ...brain,
  })
}
