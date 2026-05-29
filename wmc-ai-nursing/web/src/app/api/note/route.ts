import { NextResponse } from "next/server"
import { addPatientNoteRecord, readMobileStore } from "../../../lib/server/mobileRecordsStore"
import { saveNoteToSheet } from "../../../lib/server/googleSheets"

export async function GET() {
  const store = await readMobileStore()
  return NextResponse.json({ ok: true, data: store.notes })
}

type Payload = {
  room?: string
  patientName?: string
  note?: string
  nurseName?: string
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null
  const room = String(payload?.room || "").trim()
  const note = String(payload?.note || "").trim()
  const nurseName = String(payload?.nurseName || "").trim()
  if (!note) return NextResponse.json({ ok: false, error: "note is required." }, { status: 400 })
  if (!nurseName) return NextResponse.json({ ok: false, error: "nurseName is required." }, { status: 400 })

  const record = await addPatientNoteRecord({
    room,
    patientName: String(payload?.patientName || "").trim(),
    note,
    nurseName,
  })

  const sheet = await saveNoteToSheet(record)
  return NextResponse.json({ ok: true, data: record, sheetSynced: sheet.ok })
}
