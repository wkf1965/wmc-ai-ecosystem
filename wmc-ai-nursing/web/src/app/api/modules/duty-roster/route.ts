import { NextResponse } from "next/server"
import { readNursingModuleStore, updateDutyRoster } from "../../../../lib/server/nursingModuleStore"

export async function GET() {
  const store = await readNursingModuleStore()
  return NextResponse.json({ ok: true, data: store.dutyRoster })
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | {
        rowId?: string
        timeWindow?: string
        ward?: string
        leadNurse?: string
        onDuty?: number
        nurseNames?: string
        handoverAt?: string
        nurseLeaveList?: string
        day?: string
        morning?: string
        evening?: string
        night?: string
      }
    | null
  const data = await updateDutyRoster({
    rowId: payload?.rowId,
    timeWindow: payload?.timeWindow,
    ward: payload?.ward,
    leadNurse: payload?.leadNurse,
    onDuty: payload?.onDuty,
    nurseNames: payload?.nurseNames,
    handoverAt: payload?.handoverAt,
    nurseLeaveList: payload?.nurseLeaveList,
    day: payload?.day,
    morning: payload?.morning,
    evening: payload?.evening,
    night: payload?.night,
  })
  return NextResponse.json({ ok: true, data })
}
