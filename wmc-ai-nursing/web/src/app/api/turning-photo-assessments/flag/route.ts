import { NextResponse } from "next/server"
import { flagSuspiciousTurningPhoto } from "../../../../lib/server/turningPhotoStore"

type FlagPayload = {
  id?: string
  reasons?: string[]
  flaggedBy?: string
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as FlagPayload | null
  const id = String(payload?.id || "").trim()
  const reasons = Array.isArray(payload?.reasons) ? payload!.reasons : []
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 })
  }

  try {
    const data = await flagSuspiciousTurningPhoto({
      id,
      reasons,
      flaggedBy: payload?.flaggedBy,
    })
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to flag suspicious record." },
      { status: 400 },
    )
  }
}
