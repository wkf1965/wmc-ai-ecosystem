import { NextResponse } from "next/server"
import { addTurningRecord } from "../../../lib/server/nursingModuleStore"
import { readTurningRows } from "../../../lib/server/turningData"

export async function GET() {
  try {
    const data = await readTurningRows()
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load turning records." },
      { status: 500 },
    )
  }
}

type TurningPostPayload = {
  patientName?: string
  room?: string
  turningTime?: string
  position?: string
  nurseName?: string
  remark?: string
  recordedAt?: string
  nextTurningDueAt?: string
  source?: "telegram" | "frontend" | "api"
  sourceStatus?: "live" | "simulation"
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as TurningPostPayload | null
  const patientName = String(payload?.patientName || "").trim()
  const room = String(payload?.room || "").trim()
  const position = String(payload?.position || "").trim().toLowerCase()
  const nurseName = String(payload?.nurseName || "").trim()

  if (!patientName || !room || !position || !nurseName) {
    return NextResponse.json(
      { ok: false, error: "patientName, room, position, and nurseName are required." },
      { status: 400 },
    )
  }

  try {
    const data = await addTurningRecord({
      patientName,
      room,
      position,
      nurseName,
      turningTime: payload?.turningTime,
      recordedAt: payload?.recordedAt,
      nextTurningDueAt: payload?.nextTurningDueAt,
      source: payload?.source,
      sourceStatus: payload?.sourceStatus,
    })
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save turning record." },
      { status: 400 },
    )
  }
}
