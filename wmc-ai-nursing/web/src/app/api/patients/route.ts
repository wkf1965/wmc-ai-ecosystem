import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    route: "patients",
    data: [
      { id: "p1", fullName: "Resident Example A", riskScore: 31 },
      { id: "p2", fullName: "Resident Example B", riskScore: 19 },
    ],
  })
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  return NextResponse.json({ ok: true, created: payload }, { status: 201 })
}