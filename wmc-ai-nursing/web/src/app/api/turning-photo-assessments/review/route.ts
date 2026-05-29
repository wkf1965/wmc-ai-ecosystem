import { NextResponse } from "next/server"
import { updateTurningPhotoReview } from "../../../../lib/server/turningPhotoStore"

type ReviewPayload = {
  id?: string
  supervisorStatus?: "approved" | "rejected" | "overridden"
  overrideScore?: number | null
  supervisorComment?: string
  reviewedBy?: string
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as ReviewPayload | null
  const id = String(payload?.id || "").trim()
  const supervisorStatus = payload?.supervisorStatus
  if (!id || !supervisorStatus) {
    return NextResponse.json({ ok: false, error: "id and supervisorStatus are required." }, { status: 400 })
  }
  if (!["approved", "rejected", "overridden"].includes(supervisorStatus)) {
    return NextResponse.json({ ok: false, error: "Invalid supervisorStatus." }, { status: 400 })
  }

  try {
    const data = await updateTurningPhotoReview({
      id,
      supervisorStatus,
      overrideScore: payload?.overrideScore,
      supervisorComment: payload?.supervisorComment,
      reviewedBy: payload?.reviewedBy,
    })
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update review." },
      { status: 400 },
    )
  }
}
