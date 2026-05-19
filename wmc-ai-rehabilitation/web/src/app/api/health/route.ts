import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    app: "Rehabilitation Dashboard",
    scope: "Rehabilitation",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
}