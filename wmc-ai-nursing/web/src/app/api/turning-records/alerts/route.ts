import { NextResponse } from "next/server"
import { sendTurningOverdueAlertsNow, getTurningAlertStats } from "../../../../lib/server/turningOverdueAlerts"

// GET → dashboard card stats (Overdue Today / Alerts Sent Today / Critical / Supervisor)
export async function GET() {
  try {
    const stats = await getTurningAlertStats()
    return NextResponse.json({ ok: true, data: stats })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load turning alert stats." },
      { status: 500 },
    )
  }
}

// POST → run the alert engine now (used by the 5-min scheduler and the manual button)
export async function POST() {
  try {
    const result = await sendTurningOverdueAlertsNow()
    return NextResponse.json({ ok: true, data: result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send overdue turning alerts." },
      { status: 500 },
    )
  }
}
