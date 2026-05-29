import { NextResponse } from "next/server"
import { readMobileStore, resolveClinicalAlert } from "../../../lib/server/mobileRecordsStore"

export async function GET() {
  const store = await readMobileStore()
  return NextResponse.json({ ok: true, data: store.clinicalAlerts })
}

type Payload = {
  action?: string
  id?: string
  resolvedBy?: string
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null
  const action = String(payload?.action || "").trim()

  if (action === "resolve") {
    const id = String(payload?.id || "").trim()
    if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 })
    try {
      const updated = await resolveClinicalAlert(id, String(payload?.resolvedBy || "").trim() || undefined)
      return NextResponse.json({ ok: true, data: updated })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ ok: false, error }, { status: 404 })
    }
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 })
}
