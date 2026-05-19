import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    route: "contacts",
    data: [
      { id: "c1", name: "Family Alpha", urgency: "low" },
      { id: "c2", name: "Family Beta", urgency: "high" },
    ],
  })
}