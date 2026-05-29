import { NextResponse } from "next/server"
import { readNursingModuleStore } from "../../../lib/server/nursingModuleStore"

type MonthlyNurseSummary = {
  month: string
  nurseName: string
  totalSessions: number
  totalOtHours: number
  otRate: number
  totalOtAllowance: number
  pendingAmount: number
  approvedAmount: number
  rejectedAmount: number
  finalPayable: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = String(searchParams.get("month") || "").trim()

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { ok: false, error: "month query param required (format: YYYY-MM)" },
      { status: 400 },
    )
  }

  const store = await readNursingModuleStore()
  const completed = (store.otLogs || []).filter(
    (r) => r.status === "ot_completed" && String(r.date || "").startsWith(month),
  )

  const map = new Map<string, MonthlyNurseSummary>()

  for (const row of completed) {
    const name = String(row.nurseName || "Unknown nurse").replace(/^@/, "").trim()
    const allowance = Math.max(0, Number(row.totalOtAllowance || 0))
    const otHours   = Math.max(0, Number(row.otHours || 0))
    const approval  = String((row as { approvalStatus?: string }).approvalStatus || "pending").toLowerCase()

    const entry = map.get(name) ?? {
      month,
      nurseName:         name,
      totalSessions:     0,
      totalOtHours:      0,
      otRate:            0,
      totalOtAllowance:  0,
      pendingAmount:     0,
      approvedAmount:    0,
      rejectedAmount:    0,
      finalPayable:      0,
    }

    entry.totalSessions    += 1
    entry.totalOtHours      = round2(entry.totalOtHours + otHours)
    entry.otRate            = Math.max(entry.otRate, Number(row.otRate || 0))
    entry.totalOtAllowance  = round2(entry.totalOtAllowance + allowance)

    if (approval === "approved")  entry.approvedAmount = round2(entry.approvedAmount + allowance)
    else if (approval === "rejected") entry.rejectedAmount = round2(entry.rejectedAmount + allowance)
    else                          entry.pendingAmount  = round2(entry.pendingAmount  + allowance)

    entry.finalPayable = entry.approvedAmount
    map.set(name, entry)
  }

  const rows = Array.from(map.values()).sort((a, b) => a.nurseName.localeCompare(b.nurseName))

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalSessions    += r.totalSessions
      acc.totalOtHours      = round2(acc.totalOtHours + r.totalOtHours)
      acc.totalOtAllowance  = round2(acc.totalOtAllowance + r.totalOtAllowance)
      acc.approvedAmount    = round2(acc.approvedAmount + r.approvedAmount)
      acc.pendingAmount     = round2(acc.pendingAmount  + r.pendingAmount)
      acc.rejectedAmount    = round2(acc.rejectedAmount + r.rejectedAmount)
      acc.finalPayable      = round2(acc.finalPayable   + r.finalPayable)
      return acc
    },
    {
      totalSessions: 0, totalOtHours: 0, totalOtAllowance: 0,
      approvedAmount: 0, pendingAmount: 0, rejectedAmount: 0, finalPayable: 0,
    },
  )

  return NextResponse.json({ ok: true, month, rows, totals })
}
