import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    route: "rehab-progress",
    data: [
      { patientId: "p1", goal: "Increase ambulation", progress: 72 },
      { patientId: "p2", goal: "Pain management", progress: 55 },
    ],
  })
}