import { NextResponse } from "next/server"
import { addMedicationRecord, readMobileStore } from "../../../lib/server/mobileRecordsStore"
import { saveMedicationToSheet } from "../../../lib/server/googleSheets"

export async function GET() {
  const store = await readMobileStore()
  return NextResponse.json({ ok: true, data: store.medications })
}

type Payload = {
  room?: string
  patientName?: string
  medicationName?: string
  dose?: string
  timeGiven?: string
  givenBy?: string
  remark?: string
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null
  const room = String(payload?.room || "").trim()
  const medicationName = String(payload?.medicationName || "").trim()
  const givenBy = String(payload?.givenBy || "").trim()
  if (!room) return NextResponse.json({ ok: false, error: "room is required." }, { status: 400 })
  if (!medicationName) return NextResponse.json({ ok: false, error: "medicationName is required." }, { status: 400 })

  const record = await addMedicationRecord({
    room,
    patientName: String(payload?.patientName || "").trim(),
    medicationName,
    dose: String(payload?.dose || "").trim(),
    timeGiven: String(payload?.timeGiven || "").trim(),
    givenBy,
    remark: String(payload?.remark || "").trim(),
  })

  const sheet = await saveMedicationToSheet(record)
  return NextResponse.json({ ok: true, data: record, sheetSynced: sheet.ok })
}
