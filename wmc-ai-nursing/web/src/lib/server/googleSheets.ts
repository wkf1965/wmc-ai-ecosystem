import { google } from "googleapis"

/**
 * Server-side Google Sheets helper for the web app.
 *
 * Mirrors the bot's googleSheetService so mobile-submitted records land in the
 * same spreadsheet tabs. All write functions degrade gracefully: if credentials
 * are missing or the API call fails, they return { ok:false, error } instead of
 * throwing, so the local save (source of truth) still succeeds.
 *
 * Required env vars (web/.env.local):
 *   GOOGLE_SHEET_ID
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_PRIVATE_KEY   (PEM, newlines escaped as \n)
 */

const TAB = {
  vitals: "Vitals",
  med: "Medicine",
  turning: "side_turning",
  inventory: "Inventory_Logs",
  handover: "Handover",
  note: "PatientNotes",
  clinicalAlerts: "Clinical Alerts",
  nursingServices: "Nursing Services",
} as const

const PATIENT_ROOM_TAB = "Patientsroom"
const CACHE_TTL_MS = 5 * 60 * 1000

type SheetResult = { ok: true; updatedRange?: string } | { ok: false; error: string }

function getCredentials() {
  const sheetId = process.env.GOOGLE_SHEET_ID ?? ""
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n")
  return { sheetId, clientEmail, privateKey }
}

function createAuth() {
  const { clientEmail, privateKey } = getCredentials()
  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
}

export function sheetsConfigured() {
  const { sheetId, clientEmail, privateKey } = getCredentials()
  return Boolean(sheetId && clientEmail && privateKey)
}

function nowLocal() {
  return new Date().toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

type SheetsClient = ReturnType<typeof google.sheets>

async function ensureTab(sheets: SheetsClient, sheetId: string, tabName: string) {
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    })
    // eslint-disable-next-line no-console
    console.log(`[web-sheet] created missing tab "${tabName}"`)
  } catch (err) {
    // Ignore "already exists" races; surface anything else
    const msg = err instanceof Error ? err.message : String(err)
    if (!/already exists/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.error(`[web-sheet] could not create tab "${tabName}":`, msg)
    }
  }
}

async function appendRow(tabName: string, values: Array<string | number>): Promise<SheetResult> {
  const { sheetId } = getCredentials()
  if (!sheetsConfigured()) {
    const error = "Google Sheets credentials not configured."
    // eslint-disable-next-line no-console
    console.warn(`[web-sheet] skip append to "${tabName}" — ${error}`)
    return { ok: false, error }
  }
  const sheets = google.sheets({ version: "v4", auth: createAuth() })
  const doAppend = () =>
    sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${tabName}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [values] },
    })
  try {
    const res = await doAppend()
    const updatedRange = res.data?.updates?.updatedRange ?? undefined
    // eslint-disable-next-line no-console
    console.log(`[web-sheet] ✅ appended to "${tabName}" — ${updatedRange ?? "ok"}`)
    return { ok: true, updatedRange }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    // Missing tab → create it once, then retry
    if (/unable to parse range/i.test(error)) {
      await ensureTab(sheets, sheetId, tabName)
      try {
        const res = await doAppend()
        const updatedRange = res.data?.updates?.updatedRange ?? undefined
        // eslint-disable-next-line no-console
        console.log(`[web-sheet] ✅ appended to "${tabName}" (after create) — ${updatedRange ?? "ok"}`)
        return { ok: true, updatedRange }
      } catch (retryErr) {
        const retryError = retryErr instanceof Error ? retryErr.message : String(retryErr)
        // eslint-disable-next-line no-console
        console.error(`[web-sheet] ❌ append to "${tabName}" failed after create:`, retryError)
        return { ok: false, error: retryError }
      }
    }
    // eslint-disable-next-line no-console
    console.error(`[web-sheet] ❌ append to "${tabName}" failed:`, error)
    return { ok: false, error }
  }
}

// ── Patient lookup by room (cached) ───────────────────────────────────────────

let roomCache: Map<string, string> | null = null
let roomCacheAt = 0

export function normaliseRoom(raw: string | number) {
  return String(raw ?? "")
    .replace(/room/gi, "")
    .replace(/\s+/g, "")
    .trim()
}

async function fetchRoomMap(): Promise<Map<string, string>> {
  const { sheetId } = getCredentials()
  if (!sheetsConfigured()) return new Map()
  try {
    const sheets = google.sheets({ version: "v4", auth: createAuth() })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${PATIENT_ROOM_TAB}!A:E`,
    })
    const rows = res.data.values ?? []
    const map = new Map<string, string>()
    for (const row of rows) {
      const rawRoom = String(row[0] ?? "").trim()
      const patient = String(row[1] ?? "").trim()
      const status = String(row[2] ?? "Active").trim()
      if (!rawRoom || !patient) continue
      if (/^room[\s_]?number$/i.test(rawRoom)) continue // header
      if (/discharged/i.test(status)) continue
      const key = normaliseRoom(rawRoom)
      if (key) map.set(key, patient)
    }
    return map
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[web-sheet] room map read error:", err instanceof Error ? err.message : err)
    return new Map()
  }
}

export async function getPatientByRoom(room: string | number): Promise<string | null> {
  if (!roomCache || Date.now() - roomCacheAt >= CACHE_TTL_MS) {
    roomCache = await fetchRoomMap()
    roomCacheAt = Date.now()
  }
  return roomCache.get(normaliseRoom(room)) ?? null
}

// ── Record writers ────────────────────────────────────────────────────────────

export function saveVitalsToSheet(d: {
  patientName?: string
  room?: string
  bloodPressure?: string
  pulse?: string
  temperature?: string
  spo2?: string
  glucose?: string
  remark?: string
  nurseName?: string
}) {
  return appendRow(TAB.vitals, [
    nowLocal(),
    "VITALS",
    "",
    d.nurseName ?? "",
    d.patientName ?? "",
    d.room ?? "",
    d.bloodPressure ?? "",
    d.pulse ?? "",
    d.temperature ?? "",
    d.spo2 ?? "",
    d.glucose ?? "",
    d.remark ?? "",
  ])
}

export function saveMedicationToSheet(d: {
  patientName?: string
  room?: string
  medicationName?: string
  dose?: string
  timeGiven?: string
  givenBy?: string
  remark?: string
}) {
  return appendRow(TAB.med, [
    nowLocal(),
    "MED",
    "",
    d.givenBy ?? "",
    d.patientName ?? "",
    d.room ?? "",
    d.timeGiven ?? "",
    d.medicationName ?? "",
    d.dose ?? "",
    "", // indication
    "", // response
    d.remark ?? "",
  ])
}

export function saveInventoryToSheet(d: {
  nurseName?: string
  patientName?: string
  room?: string
  itemName?: string
  quantityUsed?: number
  purpose?: string
}) {
  return appendRow(TAB.inventory, [
    new Date().toISOString(),
    d.nurseName ?? "",
    d.nurseName ?? "",
    d.patientName ?? "",
    d.room ?? "",
    d.itemName ?? "",
    "", // size
    d.quantityUsed ?? 0,
    d.purpose ?? "",
  ])
}

export function saveTurningToSheet(d: {
  room?: string
  patientName?: string
  position?: string
  nurseName?: string
  nextTurningDueAt?: string
  status?: string
  photoPath?: string
}) {
  return appendRow(TAB.turning, [
    new Date().toISOString(),
    d.room ?? "",
    d.patientName ?? "",
    d.position ?? "",
    d.nurseName ?? "",
    d.nextTurningDueAt ?? "",
    d.status ?? "OK",
    "frontend",
    d.photoPath ?? "",
  ])
}

export function saveHandoverToSheet(d: {
  shift?: string
  nurseName?: string
  summary?: string
  concerns?: string
  urgentFollowUp?: string
}) {
  return appendRow(TAB.handover, [
    nowLocal(),
    "HANDOVER",
    "",
    d.nurseName ?? "",
    d.shift ?? "",
    d.nurseName ?? "",
    d.summary ?? "",
    d.concerns ?? "",
    d.urgentFollowUp ?? "",
  ])
}

export function saveNoteToSheet(d: {
  patientName?: string
  room?: string
  note?: string
  nurseName?: string
}) {
  return appendRow(TAB.note, [
    nowLocal(),
    "NOTE",
    "",
    d.nurseName ?? "",
    d.patientName ?? "",
    d.room ?? "",
    d.note ?? "",
    d.nurseName ?? "",
  ])
}

export function saveNursingServiceToSheet(d: {
  patientName?: string
  room?: string
  serviceName?: string
  nurseName?: string
  quantity?: number
  unitRate?: number
  totalAmount?: number
  remarks?: string
  status?: string
  recordedAt?: string
}) {
  return appendRow(TAB.nursingServices, [
    d.recordedAt ? new Date(d.recordedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) : nowLocal(),
    d.patientName ?? "",
    d.room ?? "",
    d.serviceName ?? "",
    d.nurseName ?? "",
    d.quantity ?? 1,
    d.unitRate ?? 0,
    d.totalAmount ?? 0,
    d.remarks ?? "",
    d.status ?? "completed",
  ])
}

export function saveClinicalAlertToSheet(d: {
  patientName?: string
  room?: string
  alertType?: string
  severity?: string
  detail?: string
  detectedAt?: string
  resolved?: boolean
  nurseName?: string
}) {
  return appendRow(TAB.clinicalAlerts, [
    d.detectedAt ? new Date(d.detectedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) : nowLocal(),
    d.patientName ?? "",
    d.room ?? "",
    d.alertType ?? "",
    d.severity ?? "",
    d.detail ?? "",
    d.resolved ? "Yes" : "No",
    d.nurseName ?? "",
  ])
}
