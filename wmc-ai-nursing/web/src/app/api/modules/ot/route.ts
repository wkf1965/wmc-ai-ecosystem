import { NextResponse } from "next/server"
import { punchInOt, punchInOtSession, punchOutOt, punchOutOtSession, readNursingModuleStore, updateOtRate } from "../../../../lib/server/nursingModuleStore"

export async function GET() {
  const store = await readNursingModuleStore()
  return NextResponse.json({ ok: true, data: store.otLogs })
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as { action?: string; nurseName?: string; otRate?: number } | null
  const action = String(payload?.action || "").trim().toLowerCase()
  const nurseName = String(payload?.nurseName || "").trim()
  if (!action || !nurseName) {
    return NextResponse.json({ ok: false, error: "action and nurseName are required." }, { status: 400 })
  }
  try {
    const data =
      action === "punch_in"
        ? await punchInOt(nurseName)
        : action === "punch_out"
          ? await punchOutOt(nurseName)
          : action === "ot_punch_in"
            ? await punchInOtSession(nurseName)
            : action === "ot_punch_out"
              ? await punchOutOtSession(nurseName)
              : action === "set_ot_rate"
                ? await updateOtRate(nurseName, Number(payload?.otRate))
                : null
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Unsupported action. Use punch_in, punch_out, ot_punch_in, ot_punch_out, or set_ot_rate." },
        { status: 400 },
      )
    }
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update OT logs." }, { status: 400 })
  }
}
