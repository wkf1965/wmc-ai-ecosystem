import { NextResponse } from "next/server"
import { readNursingModuleStore, updateInventoryItem } from "../../../../lib/server/nursingModuleStore"

export async function GET() {
  const store = await readNursingModuleStore()
  return NextResponse.json({ ok: true, data: store.inventory })
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | { itemId?: string; quantity?: number; personInCharge?: string }
    | null
  const itemId = String(payload?.itemId || "").trim()
  if (!itemId) {
    return NextResponse.json({ ok: false, error: "itemId is required." }, { status: 400 })
  }
  const data = await updateInventoryItem(itemId, {
    quantity: payload?.quantity,
    personInCharge: payload?.personInCharge,
  })
  return NextResponse.json({ ok: true, data })
}
