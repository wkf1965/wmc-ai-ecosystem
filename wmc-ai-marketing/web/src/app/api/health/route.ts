import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    app: "Marketing Command",
    scope: "Marketing",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
}