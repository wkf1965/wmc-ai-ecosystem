import { NextResponse } from "next/server"
import { getPatientByRoom, normaliseRoom } from "../../../lib/server/googleSheets"
import { readNursingModuleStore } from "../../../lib/server/nursingModuleStore"

/**
 * GET /api/patient-by-room?room=201
 * Resolves the patient name for a room. Tries the Google Sheet "Patientsroom"
 * tab first, then falls back to the most recent turning record for that room.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const room = String(searchParams.get("room") || "").trim()
  if (!room) {
    return NextResponse.json({ ok: false, error: "room is required." }, { status: 400 })
  }

  try {
    const fromSheet = await getPatientByRoom(room)
    if (fromSheet) {
      return NextResponse.json({ ok: true, patientName: fromSheet, source: "sheet" })
    }
  } catch {
    // fall through to local fallback
  }

  try {
    const store = await readNursingModuleStore()
    const key = normaliseRoom(room)
    const isPlaceholder = (name: string) => /^room\s.*patient$/i.test(name.trim())
    const match = store.turningRecords.find(
      (r) => normaliseRoom(r.room) === key && r.patientName && !isPlaceholder(r.patientName),
    )
    if (match?.patientName) {
      return NextResponse.json({ ok: true, patientName: match.patientName, source: "turning_records" })
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, patientName: "", source: "none" })
}
