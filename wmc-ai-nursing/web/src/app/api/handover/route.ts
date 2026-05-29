import { NextResponse } from "next/server"
import { addHandoverRecord, readMobileStore } from "../../../lib/server/mobileRecordsStore"
import { saveHandoverToSheet } from "../../../lib/server/googleSheets"

export async function GET() {
  const store = await readMobileStore()
  return NextResponse.json({ ok: true, data: store.handovers })
}

type Payload = {
  shift?: string
  nurseName?: string
  summary?: string
  concerns?: string
  urgentFollowUp?: string
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null
  const shift = String(payload?.shift || "").trim()
  const nurseName = String(payload?.nurseName || "").trim()
  const summary = String(payload?.summary || "").trim()
  if (!nurseName) return NextResponse.json({ ok: false, error: "nurseName is required." }, { status: 400 })
  if (!summary) return NextResponse.json({ ok: false, error: "summary is required." }, { status: 400 })

  const record = await addHandoverRecord({
    shift,
    nurseName,
    summary,
    concerns: String(payload?.concerns || "").trim(),
    urgentFollowUp: String(payload?.urgentFollowUp || "").trim(),
  })

  const sheet = await saveHandoverToSheet(record)
  return NextResponse.json({ ok: true, data: record, sheetSynced: sheet.ok })
}
