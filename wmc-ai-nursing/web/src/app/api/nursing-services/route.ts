import { NextResponse } from "next/server"
import {
  appendNursingService,
  readNursingModuleStore,
  setNursingServiceStatus,
  type NursingServiceStatus,
} from "../../../lib/server/nursingModuleStore"
import { getPatientByRoom, saveNursingServiceToSheet } from "../../../lib/server/googleSheets"

type PostPayload = {
  serviceId?: string
  serviceName?: string
  patientName?: string
  room?: string
  nurseName?: string
  quantity?: number
  unitRate?: number
  remarks?: string
  status?: NursingServiceStatus
  source?: "telegram" | "frontend" | "api"
  recordedAt?: string
}

type PatchPayload = {
  id?: string
  status?: NursingServiceStatus
}

export async function GET() {
  const store = await readNursingModuleStore()
  return NextResponse.json({
    ok: true,
    mode: "live",
    data: {
      records: store.nursingServices,
      rates: store.nursingServiceRates,
    },
  })
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PostPayload | null
  if (!payload?.serviceId && !payload?.serviceName) {
    return NextResponse.json({ ok: false, error: "serviceId or serviceName is required." }, { status: 400 })
  }

  // Resolve patient name from room when not supplied (keeps billing linked to a patient).
  let patientName = String(payload.patientName || "").trim()
  const room = String(payload.room || "").trim()
  if (!patientName && room) {
    try {
      const resolved = await getPatientByRoom(room)
      if (resolved) patientName = resolved
    } catch {
      // non-fatal — save with whatever we have
    }
  }

  const { record, records, rates } = await appendNursingService({
    serviceId: payload.serviceId,
    serviceName: payload.serviceName,
    patientName,
    room,
    nurseName: payload.nurseName,
    quantity: payload.quantity,
    unitRate: payload.unitRate,
    remarks: payload.remarks,
    status: payload.status,
    source: payload.source || "api",
    recordedAt: payload.recordedAt,
  })

  const sheet = await saveNursingServiceToSheet({
    patientName: record.patientName,
    room: record.room,
    serviceName: record.serviceName,
    nurseName: record.nurseName,
    quantity: record.quantity,
    unitRate: record.unitRate,
    totalAmount: record.totalAmount,
    remarks: record.remarks,
    status: record.status,
    recordedAt: record.recordedAt,
  })

  return NextResponse.json({ ok: true, mode: "live", data: { record, records, rates }, sheetSynced: sheet.ok })
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as PatchPayload | null
  if (!payload?.id || !payload?.status) {
    return NextResponse.json({ ok: false, error: "id and status are required." }, { status: 400 })
  }
  const result = await setNursingServiceStatus(payload.id, payload.status)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 })
  }
  return NextResponse.json({ ok: true, data: { record: result.record } })
}
