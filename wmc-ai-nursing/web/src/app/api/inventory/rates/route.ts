import { NextResponse } from "next/server"
import { readNursingModuleStore, setInventoryRate } from "../../../../lib/server/nursingModuleStore"

type RatePayload = {
  itemId?: string
  itemName?: string
  rate?: number
  rates?: Array<{ itemId?: string; itemName?: string; rate?: number }>
}

export async function GET() {
  try {
    const store = await readNursingModuleStore()
    return NextResponse.json({ ok: true, items: store.inventory })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load item rates." },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as RatePayload | null

  try {
    const updates = Array.isArray(payload?.rates)
      ? payload!.rates
      : payload?.itemId || payload?.itemName
        ? [{ itemId: payload?.itemId, itemName: payload?.itemName, rate: payload?.rate }]
        : []

    if (updates.length === 0) {
      return NextResponse.json({ ok: false, error: "itemId and rate are required." }, { status: 400 })
    }

    let items = (await readNursingModuleStore()).inventory
    for (const u of updates) {
      const id = u.itemId || u.itemName
      if (!id) continue
      const rate = Number(u.rate)
      if (!Number.isFinite(rate) || rate < 0) continue
      items = await setInventoryRate(id, rate, u.itemName)
    }

    return NextResponse.json({ ok: true, items })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save item rates." },
      { status: 500 },
    )
  }
}
