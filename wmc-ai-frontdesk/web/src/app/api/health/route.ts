import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    app: "Frontdesk Operations",
    scope: "Frontdesk",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
}