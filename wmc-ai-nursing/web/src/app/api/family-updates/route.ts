import { NextResponse } from "next/server"
import { runFamilyUpdateBrain } from "../../../ai/familyUpdateBrain"
import { addFamilyUpdateQueueItem, listFamilyUpdateQueue } from "../../../lib/server/familyUpdateQueueStore"
import type { RiskBrainResult } from "../../../lib/server/riskBrainV2"

/** GET /api/family-updates — list family update queue items */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") ?? undefined
  const items = await listFamilyUpdateQueue(status ?? undefined)
  return NextResponse.json({ ok: true, data: items, count: items.length })
}

type PostPayload = {
  room?: string
  patientName?: string
  riskLevel?: RiskBrainResult["riskLevel"]
  familyMessage?: string
  reasons?: string[]
  nursingActions?: string[]
  doctorReview?: "YES" | "NO"
  nurseName?: string
  source?: string
  createdAt?: string
}

/** POST /api/family-updates — create a DRAFT family update queue item */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PostPayload | null
  if (!payload?.room) {
    return NextResponse.json({ ok: false, error: "room is required." }, { status: 400 })
  }
  if (!payload?.riskLevel) {
    return NextResponse.json({ ok: false, error: "riskLevel is required." }, { status: 400 })
  }

  let familyMessage = String(payload.familyMessage ?? "").trim()
  if (!familyMessage) {
    const generated = runFamilyUpdateBrain({
      riskLevel: payload.riskLevel,
      patientName: payload.patientName,
      room: payload.room,
      reasons: payload.reasons,
      nursingActions: payload.nursingActions,
      doctorReview: payload.doctorReview,
    })
    familyMessage = generated.familyMessage
  }

  if (!familyMessage) {
    return NextResponse.json({
      ok: true,
      familyUpdate: "NO",
      message: "No family message generated for this risk level.",
      data: null,
    })
  }

  const saved = await addFamilyUpdateQueueItem({
    room: payload.room,
    patientName: payload.patientName ?? "",
    riskLevel: payload.riskLevel,
    familyMessage,
    createdAt: payload.createdAt,
    nurseName: payload.nurseName,
    source: payload.source ?? "api",
  })

  // eslint-disable-next-line no-console
  console.log(
    `[FamilyUpdateQueue] ${saved.patientName || "Unknown"} room ${saved.room} → ${saved.riskLevel} (${saved.status})`,
  )

  return NextResponse.json({
    ok: true,
    familyUpdate: payload.riskLevel === "EMERGENCY" ? "YES" : "RECOMMENDED",
    data: saved,
  })
}
