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

export async function GET() {
  try {
    const raw = await fs.readFile(TELEGRAM_RECORDS_FILE, "utf8")
    const parsed = JSON.parse(raw) as { records?: TelegramRecord[] }
    const rows = Array.isArray(parsed?.records) ? parsed.records : []
    const vitals = rows
      .filter((row) => String(row?.workflow || "").toLowerCase() === "vitals")
      .map((row) => {
        const data = row?.data || {}
        return {
          telegramRecordId: String(row?.id || ""),
          timestamp: String(row?.timestamp || ""),
          patientName: String(data.patientName || "").trim(),
          roomNumber: String(data.room || "").trim(),
          bloodPressure: String(data.bp || "").trim(),
          pulseHeartRate: String(data.pulse || "").trim(),
          temperature: String(data.temperature || "").trim(),
          spo2: String(data.spo2 || "").trim(),
          bloodSugar: String(data.bloodSugar || "").trim(),
          remark: String(data.remark || "").trim(),
        }
      })
      .filter((row) => row.patientName.length > 0)

    return NextResponse.json({ ok: true, data: vitals })
  } catch {
    return NextResponse.json({ ok: true, data: [] })
  }
}
