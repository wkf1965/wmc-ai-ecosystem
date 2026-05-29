import { NextResponse } from "next/server"
import { getOtRateSetting, setOtRateSetting } from "../../../../lib/server/nursingModuleStore"

type RatePayload = {
  rate?: number
}

export async function GET() {
  try {
    const rate = await getOtRateSetting()
    // eslint-disable-next-line no-console
    console.log("Loaded OT rate from backend:", rate)
    return NextResponse.json({ ok: true, rate })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load OT rate." },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as RatePayload | null
  const rate = Number(payload?.rate)
  if (!Number.isFinite(rate) || rate < 0) {
    return NextResponse.json({ ok: false, error: "rate must be a non-negative number." }, { status: 400 })
  }

  try {
    // eslint-disable-next-line no-console
    console.log("Saving OT rate:", rate)
    const savedRate = await setOtRateSetting(rate)
    return NextResponse.json({ ok: true, rate: savedRate })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save OT rate." },
      { status: 500 },
    )
  }
}
