import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    route: "ops",
    campaigns: [
      { id: "m1", name: "Open house" },
      { id: "m2", name: "Resident story" },
    ],
  })
}