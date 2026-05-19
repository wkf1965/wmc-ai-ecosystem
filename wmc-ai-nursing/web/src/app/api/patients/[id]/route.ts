import { NextResponse } from "next/server"

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return NextResponse.json({ route: "patients", id: params.id, found: true })
}
