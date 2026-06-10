import { NextResponse } from "next/server"
import { getNursingServiceRates, setNursingServiceRate } from "../../../../lib/server/nursingModuleStore"

type RatePayload = {
  serviceId?: string
  serviceName?: string
  rate?: number
  // Optional batch update: [{ serviceId, rate }]
  rates?: Array<{ serviceId?: string; serviceName?: string; rate?: number }>
}

export async function GET() {
  try {
    const rates = await getNursingServiceRates()
    return NextResponse.json({ ok: true, rates })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load rates." },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as RatePayload | null

  try {
    let rates = await getNursingServiceRates()
    const updates = Array.isArray(payload?.rates)
      ? payload!.rates
      : payload?.serviceId || payload?.serviceName
        ? [{ serviceId: payload?.serviceId, serviceName: payload?.serviceName, rate: payload?.rate }]
        : []

    if (updates.length === 0) {
      return NextResponse.json({ ok: false, error: "serviceId and rate are required." }, { status: 400 })
    }

    for (const u of updates) {
      const id = u.serviceId || u.serviceName
      if (!id) continue
      const rate = Number(u.rate)
      if (!Number.isFinite(rate) || rate < 0) continue
      rates = await setNursingServiceRate(id, rate, u.serviceName)
    }

    return NextResponse.json({ ok: true, rates })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save rates." },
      { status: 500 },
    )
  }
}
