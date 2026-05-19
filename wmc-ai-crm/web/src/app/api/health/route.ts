import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    app: "Care CRM",
    scope: "CRM",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
}