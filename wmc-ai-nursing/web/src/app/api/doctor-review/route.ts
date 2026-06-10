import { NextResponse } from "next/server"
import { runDoctorReviewBrain, type DoctorReviewBrainInput } from "../../../ai/doctorReviewBrain"
import { addDoctorReviewQueueItem, listDoctorReviewQueue } from "../../../lib/server/doctorReviewQueueStore"

/** GET /api/doctor-review — list doctor review queue items */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") ?? undefined
  const items = await listDoctorReviewQueue(status ?? undefined)
  return NextResponse.json({ ok: true, data: items, count: items.length })
}

type PostPayload = DoctorReviewBrainInput & {
  nurseName?: string
  source?: string
}

/** POST /api/doctor-review — create a doctor review queue item via doctorReviewBrain */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PostPayload | null
  if (!payload?.riskLevel) {
    return NextResponse.json({ ok: false, error: "riskLevel is required." }, { status: 400 })
  }

  const decision = runDoctorReviewBrain(payload)
  if (!decision.queueItem) {
    return NextResponse.json({
      ok: true,
      doctorReview: decision.doctorReview,
      queueStatus: null,
      message: decision.reason,
      data: null,
    })
  }

  const saved = await addDoctorReviewQueueItem({
    ...decision.queueItem,
    nurseName: payload.nurseName,
    source: payload.source ?? "api",
  })

  // eslint-disable-next-line no-console
  console.log(
    `[DoctorReviewQueue] ${saved.patientName || "Unknown"} room ${saved.room} → ${saved.riskLevel} (${saved.status})`,
  )

  return NextResponse.json({
    ok: true,
    doctorReview: decision.doctorReview,
    queueStatus: saved.status,
    data: saved,
  })
}
