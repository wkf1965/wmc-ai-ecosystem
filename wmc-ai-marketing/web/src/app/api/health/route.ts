import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    app: "WMC AI Nursing Coordinator",
    scope: "Nursing",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
}