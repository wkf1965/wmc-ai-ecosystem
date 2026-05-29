import { NextResponse } from "next/server"
import { addVitalsRecord, addClinicalAlerts, readMobileStore } from "../../../lib/server/mobileRecordsStore"
import { saveVitalsToSheet, saveClinicalAlertToSheet, getPatientByRoom } from "../../../lib/server/googleSheets"
import { detectClinicalAlerts, detectNutritionConcern } from "../../../lib/server/clinicalAlerts"

export async function GET() {
  const store = await readMobileStore()
  return NextResponse.json({ ok: true, data: store.vitals })
}

type Payload = {
  room?: string
  patientName?: string
  temperature?: string
  bloodPressure?: string
  pulse?: string
  spo2?: string
  glucose?: string
  nutrition?: string
  remark?: string
  nurseName?: string
}

/** Looks like the "Room 201 patient" placeholder rather than a real name. */
function isPlaceholderName(name: string) {
  return !name || /^room\s.*patient$/i.test(name.trim())
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null
  const room = String(payload?.room || "").trim()
  const nurseName = String(payload?.nurseName || "").trim()
  if (!room) return NextResponse.json({ ok: false, error: "room is required." }, { status: 400 })
  if (!nurseName) return NextResponse.json({ ok: false, error: "nurseName is required." }, { status: 400 })

  // ── Always resolve patient by room (never store the placeholder) ──────────
  let patientName = String(payload?.patientName || "").trim()
  if (isPlaceholderName(patientName)) {
    try {
      const looked = await getPatientByRoom(room)
      if (looked) patientName = looked
    } catch {
      // keep whatever we have
    }
  }
  if (isPlaceholderName(patientName)) patientName = "" // avoid persisting placeholder

  const bloodPressure = String(payload?.bloodPressure || "").trim()
  const pulse = String(payload?.pulse || "").trim()
  const spo2 = String(payload?.spo2 || "").trim()
  const remark = String(payload?.remark || "").trim()
  const nutrition = detectNutritionConcern(payload?.nutrition) || detectNutritionConcern(remark) || ""

  const record = await addVitalsRecord({
    room,
    patientName,
    temperature: String(payload?.temperature || "").trim(),
    bloodPressure,
    pulse,
    spo2,
    glucose: String(payload?.glucose || "").trim(),
    remark,
    nurseName,
  })

  const sheet = await saveVitalsToSheet(record)

  // ── Clinical risk detection ───────────────────────────────────────────────
  const detected = detectClinicalAlerts({ bloodPressure, pulse, spo2, nutrition })
  let alerts: Awaited<ReturnType<typeof addClinicalAlerts>> = []
  if (detected.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[ClinicalAlert] ${detected.length} alert(s) for ${patientName || "(unknown)"} room ${room}:`,
      detected.map((d) => `${d.severity}:${d.alertType}`).join(", "),
    )
    alerts = await addClinicalAlerts(
      detected.map((d) => ({
        patientName: patientName || `Unknown (Room ${room})`,
        room,
        alertType: d.alertType,
        severity: d.severity,
        detail: d.detail,
        nurseName,
        detectedAt: record.recordedAt,
      })),
    )
    for (const a of alerts) {
      await saveClinicalAlertToSheet(a)
    }
  }

  return NextResponse.json({
    ok: true,
    data: { ...record, patientName, nutrition },
    sheetSynced: sheet.ok,
    alerts,
  })
}
