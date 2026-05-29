import { NextResponse } from "next/server"
import { readTurningPhotoAssessments } from "../../../lib/server/turningPhotoStore"

const ALLOWANCE_PER_MARK = 0.80
const ALLOWANCE_CAP = 150

export type MonthlyTurningSummaryRow = {
  nurseName: string
  month: string
  totalRecords: number
  validMarks: number
  invalidMarks: number
  averageScore: number
  allowanceBeforeCap: number
  finalAllowance: number
}

function toMonthKey(dateStr: string): string | null {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

/**
 * GET /api/turning-monthly?month=YYYY-MM&nurse=Name
 *
 * Returns monthly turning allowance summary per nurse.
 * Only SUCCESS-scored records are counted.
 * Rules: score >= 70 → 1 valid mark (RM 0.80); cap at RM 150 per nurse per month.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const monthFilter = String(searchParams.get("month") || "").trim()   // YYYY-MM or empty
  const nurseFilter = String(searchParams.get("nurse") || "").trim().toLowerCase()

  const store = await readTurningPhotoAssessments()

  // Only count successfully scored records
  const scored = store.assessments.filter((r) => r.scoringStatus === "SUCCESS")

  type Bucket = {
    nurseName: string
    month: string
    scores: number[]
  }

  const map = new Map<string, Bucket>()

  for (const row of scored) {
    const month = toMonthKey(row.uploadedAt || row.turningTime)
    if (!month) continue
    if (monthFilter && month !== monthFilter) continue
    if (nurseFilter && row.nurseName.toLowerCase() !== nurseFilter) continue

    const key = `${row.nurseName}|${month}`
    if (!map.has(key)) {
      map.set(key, { nurseName: row.nurseName, month, scores: [] })
    }
    map.get(key)!.scores.push(Number(row.overallScore || 0))
  }

  const summary: MonthlyTurningSummaryRow[] = []

  for (const { nurseName, month, scores } of map.values()) {
    const totalRecords = scores.length
    const validMarks = scores.filter((s) => s >= 70).length
    const invalidMarks = totalRecords - validMarks
    const averageScore =
      totalRecords > 0 ? Number((scores.reduce((a, b) => a + b, 0) / totalRecords).toFixed(1)) : 0
    const allowanceBeforeCap = Number((validMarks * ALLOWANCE_PER_MARK).toFixed(2))
    const finalAllowance = Number(Math.min(allowanceBeforeCap, ALLOWANCE_CAP).toFixed(2))
    summary.push({ nurseName, month, totalRecords, validMarks, invalidMarks, averageScore, allowanceBeforeCap, finalAllowance })
  }

  // Sort: newest month first, then nurse name ascending
  summary.sort((a, b) => {
    if (b.month !== a.month) return b.month.localeCompare(a.month)
    return a.nurseName.localeCompare(b.nurseName)
  })

  const grandTotal = Number(summary.reduce((s, r) => s + r.finalAllowance, 0).toFixed(2))
  const uniqueNurses = [...new Set(summary.map((r) => r.nurseName))].sort()

  return NextResponse.json({
    ok: true,
    month: monthFilter || "all",
    nurse: nurseFilter || "all",
    summary,
    grandTotal,
    uniqueNurses,
    rules: {
      allowancePerMark: ALLOWANCE_PER_MARK,
      cap: ALLOWANCE_CAP,
      validThreshold: 70,
    },
  })
}
