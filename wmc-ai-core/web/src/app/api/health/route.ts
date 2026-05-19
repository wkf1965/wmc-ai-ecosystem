import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    app: "Core Command Center",
    scope: "Core",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
}