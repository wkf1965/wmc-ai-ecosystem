import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    app: "Nursing Command Center",
    scope: "Nursing",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
}