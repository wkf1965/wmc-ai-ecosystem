import { NextResponse } from "next/server"
import { appendInventoryEvent, readNursingModuleStore, type InventoryActionType } from "../../../lib/server/nursingModuleStore"
import { saveInventoryToSheet } from "../../../lib/server/googleSheets"

type PostPayload = {
  itemId?: string
  itemName?: string
  quantityChange?: number
  unit?: string
  room?: string
  patientName?: string
  personInCharge?: string
  actionType?: InventoryActionType
  sourceStatus?: "live" | "simulation"
  recordedAt?: string
  purpose?: string
}

export async function GET() {
  const store = await readNursingModuleStore()
  return NextResponse.json({
    ok: true,
    mode: "live",
    data: {
      inventory: store.inventory,
      records: store.inventoryEvents || [],
    },
  })
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PostPayload | null
  const quantityChange = Number(payload?.quantityChange || 0)
  if (!payload?.itemId && !payload?.itemName) {
    return NextResponse.json({ ok: false, error: "itemId or itemName is required." }, { status: 400 })
  }
  if (!Number.isFinite(quantityChange) || quantityChange === 0) {
    return NextResponse.json({ ok: false, error: "quantityChange must be a non-zero number." }, { status: 400 })
  }

  const data = await appendInventoryEvent({
    itemId: payload?.itemId,
    itemName: payload?.itemName,
    quantityChange,
    unit: payload?.unit,
    room: payload?.room,
    patientName: payload?.patientName,
    personInCharge: payload?.personInCharge,
    actionType: payload?.actionType,
    source: "api",
    sourceStatus: payload?.sourceStatus || "live",
    recordedAt: payload?.recordedAt,
  })

  const sheet = await saveInventoryToSheet({
    nurseName: payload?.personInCharge,
    patientName: payload?.patientName,
    room: payload?.room,
    itemName: data.event.itemName,
    quantityUsed: Math.abs(Number(data.event.quantityChange) || 0),
    purpose: payload?.purpose,
  })

  return NextResponse.json({
    ok: true,
    mode: "live",
    data,
    sheetSynced: sheet.ok,
  })
}
