import { NextResponse } from "next/server"
import { readNursingModuleStore } from "../../../lib/server/nursingModuleStore"

export async function GET() {
  const store = await readNursingModuleStore()
  const data = store.duty_roster_settings || store.dutyRoster
  // eslint-disable-next-line no-console
  console.log("Loaded duty roster:", data)
  return NextResponse.json({ ok: true, data })
}
