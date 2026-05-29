import { NextResponse } from "next/server"
import { updateDutyRoster } from "../../../../lib/server/nursingModuleStore"

type SaveDutyRosterPayload = {
  rowId?: string
  shift?: string
  timeWindow?: string
  ward?: string
  leadNurse?: string
  nurseNames?: string
  onDuty?: number
  handoverAt?: string
  nurseLeaveList?: string
  weeklyRoster?: Array<{ day: string; morning: string; evening: string; night: string }>
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as SaveDutyRosterPayload | null
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 })

  // eslint-disable-next-line no-console
  console.log("Saving duty roster:", payload)

  try {
    let data = null
    if (payload.rowId) {
      data = await updateDutyRoster({
        rowId: payload.rowId,
        shift: payload.shift,
        timeWindow: payload.timeWindow,
        ward: payload.ward,
        leadNurse: payload.leadNurse,
        nurseNames: payload.nurseNames,
        onDuty: payload.onDuty,
        handoverAt: payload.handoverAt,
      })
    } else {
      if (payload.nurseLeaveList !== undefined) {
        data = await updateDutyRoster({ nurseLeaveList: payload.nurseLeaveList })
      }
      if (Array.isArray(payload.weeklyRoster)) {
        for (const weekly of payload.weeklyRoster) {
          // eslint-disable-next-line no-await-in-loop
          data = await updateDutyRoster({
            day: weekly.day,
            morning: weekly.morning,
            evening: weekly.evening,
            night: weekly.night,
          })
        }
      }
    }
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save duty roster." },
      { status: 400 },
    )
  }
}
