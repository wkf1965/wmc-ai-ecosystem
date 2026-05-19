import { NextResponse } from "next/server"
import { analyzeAllPatients } from "../../../lib/aiRiskDetection"

export async function GET() {
  const results = analyzeAllPatients()
  return NextResponse.json({
    route: "ai-risk",
    generatedAt: new Date().toISOString(),
    data: results,
  })
}