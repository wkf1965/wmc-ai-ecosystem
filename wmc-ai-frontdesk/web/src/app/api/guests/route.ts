import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    route: "guests",
    data: [
      { id: "g1", unit: "A-101", guest: "Guest Alpha" },
      { id: "g2", unit: "B-202", guest: "Guest Beta" },
    ],
  })
}