import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

type TelegramRecord = {
  id?: string
  workflow?: string
  timestamp?: string
  data?: Record<string, unknown>
}

const TELEGRAM_RECORDS_FILE = path.join(
  process.cwd(),
  "..",
  "wmc-ai-nursing-coordinator",
  "wmc-ai-nursing-coordinator",
  "telegram-bot-records.json",
)

function normalizeAdmissionDate(rawValue: string) {
  const value = String(rawValue || "").trim()
  if (!value) return new Date().toISOString().slice(0, 10)
  if (value.toLowerCase() === "today") return new Date().toISOString().slice(0, 10)
  const ddmmyyyy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0")
    const month = ddmmyyyy[2].padStart(2, "0")
    const year = ddmmyyyy[3]
    return `${year}-${month}-${day}`
  }
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

export async function GET() {
  try {
    const raw = await fs.readFile(TELEGRAM_RECORDS_FILE, "utf8")
    const parsed = JSON.parse(raw) as { records?: TelegramRecord[] }
    const rows = Array.isArray(parsed?.records) ? parsed.records : []
    const admissions = rows
      .filter((row) => String(row?.workflow || "").toLowerCase() === "admit")
      .map((row) => {
        const data = row?.data || {}
        return {
          telegramRecordId: String(row?.id || ""),
          timestamp: String(row?.timestamp || ""),
          fullName: String(data.patientName || "").trim(),
          age: String(data.age || "").trim(),
          gender: String(data.gender || "").trim(),
          roomNumber: String(data.room || "").trim(),
          diagnosis: String(data.diagnosis || "").trim(),
          doctor: String(data.doctor || "").trim(),
          admissionDate: normalizeAdmissionDate(String(data.admissionDate || "")),
          remark: String(data.remark || "").trim(),
        }
      })
      .filter((row) => row.fullName.length > 0)

    return NextResponse.json({
      ok: true,
      data: admissions,
    })
  } catch {
    return NextResponse.json({
      ok: true,
      data: [],
    })
  }
}
