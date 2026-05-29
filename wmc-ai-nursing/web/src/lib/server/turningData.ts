import { promises as fs } from "fs"
import path from "path"

export type TurningApiRow = {
  id: string
  recordId: string
  patientName: string
  room: string
  turningTime: string
  position: string
  nurseName: string
  nextTurningDueAt: string
  status: "done" | "due_soon" | "overdue"
  remark: string
  savedAt: string
  source: "google_sheet" | "telegram_store"
}

export function parseEnvFile(raw: string) {
  const env: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

async function loadSheetCredentials() {
  let sheetId = String(process.env.GOOGLE_SHEET_ID || "").trim()
  let serviceEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim()
  let privateKey = String(process.env.GOOGLE_PRIVATE_KEY || "").trim()

  if (sheetId && serviceEmail && privateKey) {
    return { sheetId, serviceEmail, privateKey: privateKey.replace(/\\n/g, "\n") }
  }

  const coordinatorEnvPath = path.join(
    process.cwd(),
    "..",
    "wmc-ai-nursing-coordinator",
    "wmc-ai-nursing-coordinator",
    ".env",
  )
  const raw = await fs.readFile(coordinatorEnvPath, "utf8")
  const parsed = parseEnvFile(raw)
  sheetId = sheetId || String(parsed.GOOGLE_SHEET_ID || "").trim()
  serviceEmail = serviceEmail || String(parsed.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim()
  privateKey = privateKey || String(parsed.GOOGLE_PRIVATE_KEY || "").trim()

  return { sheetId, serviceEmail, privateKey: privateKey.replace(/\\n/g, "\n") }
}

function normalizePosition(value: string) {
  const key = String(value || "").trim().toLowerCase()
  if (key.includes("left")) return "left side"
  if (key.includes("right")) return "right side"
  if (key.includes("supine") || key === "back") return "supine"
  if (key.includes("prone") || key === "front") return "prone"
  if (key === "done") return "done"
  return key || "-"
}

function toIso(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return parsed.toISOString()
}

function addHours(iso: string, hours: number) {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ""
  parsed.setHours(parsed.getHours() + hours)
  return parsed.toISOString()
}

export function computeStatus(nextTurningDueAt: string): "done" | "due_soon" | "overdue" {
  const dueAt = new Date(nextTurningDueAt).getTime()
  if (Number.isNaN(dueAt)) return "done"
  const now = Date.now()
  if (now > dueAt) return "overdue"
  if (now >= dueAt - 30 * 60 * 1000) return "due_soon"
  return "done"
}

function buildTurningIso(savedAtRaw: string, turningTimeRaw: string) {
  const savedAtIso = toIso(savedAtRaw)
  const direct = toIso(turningTimeRaw)
  if (direct) return direct
  const hhmm = String(turningTimeRaw || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm && savedAtIso) {
    const base = new Date(savedAtIso)
    base.setHours(Number(hhmm[1]), Number(hhmm[2]), 0, 0)
    return base.toISOString()
  }
  return savedAtIso || new Date().toISOString()
}

async function loadGoogleSheetRows() {
  const creds = await loadSheetCredentials()
  if (!creds.sheetId || !creds.serviceEmail || !creds.privateKey) return [] as TurningApiRow[]

  // @ts-ignore runtime dependency from monorepo root
  const { google } = await import("googleapis")
  const auth = new google.auth.JWT({
    email: creds.serviceEmail,
    key: creds.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  const sheets = google.sheets({ version: "v4", auth })

  const [sideTurning, turning] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: creds.sheetId,
      range: "side_turning!A2:H2000",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: creds.sheetId,
      range: "Turning!A2:J2000",
    }),
  ])

  const sideRows = (sideTurning.data.values || []).map((row: string[], index: number) => {
    const savedAt = toIso(String(row[0] || "")) || new Date().toISOString()
    const turningTime = savedAt
    const nextTurningDueAt = toIso(String(row[5] || "")) || addHours(turningTime, 2)
    const sheetStatus = String(row[6] || "").toLowerCase()
    const status =
      sheetStatus.includes("overdue") ? "overdue" : sheetStatus.includes("due") ? "due_soon" : computeStatus(nextTurningDueAt)
    return {
      id: `side-${index + 2}`,
      recordId: `side-${index + 2}`,
      patientName: String(row[2] || "").trim(),
      room: String(row[1] || "").trim(),
      turningTime,
      position: normalizePosition(String(row[3] || "")),
      nurseName: String(row[4] || "").trim(),
      nextTurningDueAt,
      status,
      remark: "",
      savedAt,
      source: "google_sheet" as const,
    }
  })

  const turningRows = (turning.data.values || []).map((row: string[], index: number) => {
    const savedAt = toIso(String(row[0] || "")) || new Date().toISOString()
    const turningTime = buildTurningIso(String(row[0] || ""), String(row[6] || ""))
    const nextTurningDueAt = addHours(turningTime, 2)
    return {
      id: `turn-${index + 2}`,
      recordId: `turn-${index + 2}`,
      patientName: String(row[4] || "").trim(),
      room: String(row[5] || "").trim(),
      turningTime,
      position: normalizePosition(String(row[7] || "")),
      nurseName: String(row[3] || "").trim(),
      nextTurningDueAt,
      status: computeStatus(nextTurningDueAt),
      remark: [String(row[8] || "").trim(), String(row[9] || "").trim()].filter(Boolean).join(" | "),
      savedAt,
      source: "google_sheet" as const,
    }
  })

  return [...sideRows, ...turningRows]
    .filter((row) => row.patientName || row.room)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

async function loadTelegramStoreRows() {
  const recordsPath = path.join(
    process.cwd(),
    "..",
    "wmc-ai-nursing-coordinator",
    "wmc-ai-nursing-coordinator",
    "telegram-bot-records.json",
  )
  const raw = await fs.readFile(recordsPath, "utf8")
  const parsed = JSON.parse(raw) as { records?: Array<Record<string, unknown>> }
  const rows = Array.isArray(parsed.records) ? parsed.records : []
  return rows
    .filter((row) => String(row.workflow || "").toLowerCase() === "turning")
    .map((row) => {
      const data = (row.data || {}) as Record<string, unknown>
      const turningTime = buildTurningIso(String(row.timestamp || ""), String(data.time || ""))
      const nextTurningDueAt = addHours(turningTime, 2)
      const turningPosition = String(data.turning_position || data.position || "")
      return {
        id: String(row.id || ""),
        recordId: String(row.id || "").slice(0, 8),
        patientName: String(data.patientName || "").trim(),
        room: String(data.room || "").trim(),
        turningTime,
        position: normalizePosition(turningPosition),
        nurseName: String(data.nurseName || ""),
        nextTurningDueAt,
        status: computeStatus(nextTurningDueAt),
        remark: String(data.remark || "").trim(),
        savedAt: toIso(String(row.timestamp || "")) || new Date().toISOString(),
        source: "telegram_store" as const,
      }
    })
}

export async function readTurningRows(): Promise<TurningApiRow[]> {
  try {
    const sheetRows = await loadGoogleSheetRows()
    if (sheetRows.length > 0) return sheetRows
  } catch {
    // fallback below
  }
  return loadTelegramStoreRows()
}
