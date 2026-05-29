import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import {
  punchInOt,
  punchInOtSession,
  punchOutOt,
  punchOutOtSession,
  recalculateCurrentOtRecords,
  readNursingModuleStore,
  getOtRateSetting,
  updateOtSyncStatus,
  updateOtSyncStatusById,
  setOtApprovalStatus,
} from "../../../lib/server/nursingModuleStore"

type PostPayload = {
  action?: string
  nurseName?: string
  nurse_name?: string
  source?: "telegram" | "manual"
  date?: string
  recordDate?: string
  syncStatus?: "synced" | "pending_sync" | "failed_sync"
  syncError?: string | null
  scope?: "selected" | "today"
  /** Pre-computed by bot — use these instead of recalculating from ISO timestamps */
  otHours?: number
  otAllowance?: number
  otRate?: number
  otInHhmm?: string
  otOutHhmm?: string
  /** For set_approval_status action */
  recordId?: string
  approvalStatus?: "pending" | "approved" | "rejected"
  approvedBy?: string
  approvalNote?: string
  rejectionReason?: string
}

type OtLogRow = {
  id: string
  nurseName: string
  date: string
  dutyPunchInAt: string
  dutyPunchOutAt: string | null
  otPunchInAt: string | null
  otPunchOutAt: string | null
  normalHours: number
  otHours: number
  otRate: number
  totalOtAllowance: number
  status: "on_duty" | "duty_completed" | "ot_active" | "ot_completed"
  source: "telegram" | "manual"
}

function parseEnvFile(raw: string) {
  const env: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
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
  const env = parseEnvFile(raw)
  sheetId = sheetId || String(env.GOOGLE_SHEET_ID || "").trim()
  serviceEmail = serviceEmail || String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim()
  privateKey = privateKey || String(env.GOOGLE_PRIVATE_KEY || "").trim()

  return { sheetId, serviceEmail, privateKey: privateKey.replace(/\\n/g, "\n") }
}

function parseHours(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, (end - start) / (1000 * 60 * 60))
}

function parseTimeToIso(date: string, hhmm: string) {
  const safeDate = String(date || "").trim()
  const safeTime = String(hhmm || "").trim()
  if (!safeDate || !safeTime) return null
  const dateMatch = safeDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const timeMatch = safeTime.match(/^(\d{1,2}):(\d{2})/)
  if (!dateMatch || !timeMatch) return null
  const dt = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
    0,
  )
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

async function readGoogleSheetOtLogs() {
  const creds = await loadSheetCredentials()
  if (!creds.sheetId || !creds.serviceEmail || !creds.privateKey) return [] as OtLogRow[]

  // @ts-ignore runtime dependency
  const { google } = await import("googleapis")
  const auth = new google.auth.JWT({
    email: creds.serviceEmail,
    key: creds.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  const sheets = google.sheets({ version: "v4", auth })
  const tabName = String(process.env.OT_ATTENDANCE_TAB || "attendance_records").trim()

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: creds.sheetId,
      range: `${tabName}!A2:N5000`,
    })
    const values = response.data.values || []
    return values
      .map((row: string[], index: number) => {
        const date = String(row[0] || "").trim()
        const nurseName = String(row[1] || "").trim()
        const normalIn = String(row[3] || "").trim()
        const normalOut = String(row[4] || "").trim()
        const otIn = String(row[5] || "").trim()
        const otOut = String(row[6] || "").trim()
        const otRate = Math.max(0, Number(row[8] || 10))
        const dutyPunchInAt = parseTimeToIso(date, normalIn) || new Date().toISOString()
        const dutyPunchOutAt = parseTimeToIso(date, normalOut)
        const otPunchInAt = parseTimeToIso(date, otIn)
        const otPunchOutAt = parseTimeToIso(date, otOut)
        const normalHours = dutyPunchOutAt ? Number(Math.min(8, parseHours(dutyPunchInAt, dutyPunchOutAt)).toFixed(2)) : 0
        const otHours = otPunchInAt && otPunchOutAt ? Number(parseHours(otPunchInAt, otPunchOutAt).toFixed(2)) : 0
        const totalOtAllowance = Number((otHours * otRate).toFixed(2))
        const status: OtLogRow["status"] = otPunchInAt && !otPunchOutAt
          ? "ot_active"
          : otPunchInAt && otPunchOutAt
            ? "ot_completed"
            : dutyPunchOutAt
              ? "duty_completed"
              : "on_duty"

        return {
          id: `sheet-${tabName}-${index + 2}`,
          nurseName: nurseName || "Unknown nurse",
          date: date || dutyPunchInAt.slice(0, 10),
          dutyPunchInAt,
          dutyPunchOutAt,
          otPunchInAt,
          otPunchOutAt,
          normalHours,
          otHours,
          otRate,
          totalOtAllowance,
          status,
          source: "telegram" as const,
        }
      })
      .filter((row) => row.nurseName)
  } catch (error) {
    const err = error as {
      message?: string
      response?: { data?: unknown }
      code?: number | string
      status?: number | string
    }
    // eslint-disable-next-line no-console
    console.error(
      `[ot-sheet-read] failed tab=${tabName} sheet=${creds.sheetId} code=${String(err?.code || err?.status || "")} message=${String(
        err?.message || "unknown",
      )}`,
    )
    if (err?.response?.data) {
      // eslint-disable-next-line no-console
      console.error("[ot-sheet-read] google response:", JSON.stringify(err.response.data))
    }
    return []
  }
}

export async function GET() {
  const store = await readNursingModuleStore()
  const currentOtRate = await getOtRateSetting()
  const localRows = (store.otLogs || []) as OtLogRow[]
  const sheetRows = await readGoogleSheetOtLogs()
  const recalculationAuditLogs = Array.isArray((store as { otRecalculationAuditLogs?: unknown[] }).otRecalculationAuditLogs)
    ? ((store as { otRecalculationAuditLogs?: unknown[] }).otRecalculationAuditLogs || []).slice(0, 20)
    : []
  const approvalAuditLogs = Array.isArray((store as { otApprovalAuditLogs?: unknown[] }).otApprovalAuditLogs)
    ? ((store as { otApprovalAuditLogs?: unknown[] }).otApprovalAuditLogs || []).slice(0, 50)
    : []

  const isDateLike = (name: string) => /^\d{4}-\d{2}-\d{2}$/.test(name.trim())
  const rowKey = (r: OtLogRow) => `${r.nurseName.replace(/^@/, "").trim().toLowerCase()}|${r.date}`

  // Deduplicate local records: keep the LATEST record per nurse+date.
  // Sort newest-first so the first match in the map is always the most recent shift state.
  const latestLocalMap = new Map<string, OtLogRow>()
  for (const row of [...localRows].sort((a, b) => b.dutyPunchInAt.localeCompare(a.dutyPunchInAt))) {
    if (isDateLike(row.nurseName)) continue
    const key = rowKey(row)
    if (!latestLocalMap.has(key)) latestLocalMap.set(key, row)
  }

  // Sheet rows supplement for nurse+dates absent from local store entirely.
  const uniqueSheetRows = sheetRows.filter(
    (r) => !isDateLike(r.nurseName) && !latestLocalMap.has(rowKey(r)),
  )

  const merged = [...latestLocalMap.values(), ...uniqueSheetRows].sort(
    (a, b) => b.dutyPunchInAt.localeCompare(a.dutyPunchInAt),
  )

  // eslint-disable-next-line no-console
  console.log("Dashboard records", merged)
  // eslint-disable-next-line no-console
  console.log("Current OT rate:", currentOtRate)
  return NextResponse.json({
    ok: true,
    data: merged,
    events: store.otPunchEvents || [],
    otRatePerHour: currentOtRate,
    recalculationAuditLogs,
    approvalAuditLogs,
  })
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PostPayload | null
  const action = String(payload?.action || "").trim().toLowerCase()
  const nurseName = String(payload?.nurseName || payload?.nurse_name || "").trim()
  const source = String(payload?.source || "").toLowerCase() === "telegram" ? "telegram" : "manual"
  const nurseLooksLikeDate = /^\d{4}-\d{2}-\d{2}$/.test(nurseName)

  if (!action) {
    return NextResponse.json({ ok: false, error: "action is required." }, { status: 400 })
  }

  // set_approval_status can use recordId instead of nurseName — skip the check when recordId is present
  const nurseNameOptional =
    action === "recalculate_records" ||
    (action === "set_approval_status" && !!payload?.recordId)

  if (!nurseNameOptional && !nurseName) {
    return NextResponse.json({ ok: false, error: "action and nurseName are required." }, { status: 400 })
  }
  if (
    nurseLooksLikeDate &&
    ["punch_in", "punch_out", "ot_punch_in", "ot_punch_out", "set_sync_status"].includes(action)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid nurseName "${nurseName}". nurseName must be a staff name, not a date.`,
      },
      { status: 400 },
    )
  }

  try {
    const data =
      action === "punch_in"
        ? await punchInOt(nurseName, source)
        : action === "punch_out"
          ? await punchOutOt(nurseName, source)
          : action === "ot_punch_in"
            ? await punchInOtSession(nurseName, source)
            : action === "ot_punch_out"
              ? await punchOutOtSession(nurseName, source, {
                  otHours: payload?.otHours,
                  otAllowance: payload?.otAllowance,
                  otRate: payload?.otRate,
                  otInHhmm: payload?.otInHhmm,
                  otOutHhmm: payload?.otOutHhmm,
                })
                : action === "set_sync_status"
                  ? payload?.recordId
                    ? await updateOtSyncStatusById(
                        String(payload.recordId),
                        (payload?.syncStatus || "synced") as "synced" | "pending_sync" | "failed_sync",
                        payload?.syncError ?? null,
                      )
                    : await updateOtSyncStatus(
                        nurseName,
                        String(payload?.recordDate || payload?.date || new Date().toISOString().slice(0, 10)),
                        (payload?.syncStatus || "pending_sync") as "synced" | "pending_sync" | "failed_sync",
                        payload?.syncError ?? null,
                      )
                  : action === "recalculate_records"
                    ? await recalculateCurrentOtRecords({
                        nurseName: payload?.scope === "selected" ? nurseName : undefined,
                        date: payload?.scope === "selected" ? undefined : String(payload?.date || new Date().toISOString().slice(0, 10)),
                      })
                  : action === "set_approval_status"
                    ? await setOtApprovalStatus({
                        recordId:        payload?.recordId ? String(payload.recordId) : undefined,
                        nurseName:       nurseName || undefined,
                        approvalStatus:  (["pending", "approved", "rejected"].includes(String(payload?.approvalStatus)) ? payload?.approvalStatus : "pending") as "pending" | "approved" | "rejected",
                        approvedBy:      payload?.approvedBy ? String(payload.approvedBy) : undefined,
                        approvalNote:    payload?.approvalNote ? String(payload.approvalNote) : undefined,
                        rejectionReason: payload?.rejectionReason ? String(payload.rejectionReason) : undefined,
                      })
                : null

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unsupported action. Use punch_in, punch_out, ot_punch_in, ot_punch_out, set_sync_status, or recalculate_records.",
        },
        { status: 400 },
      )
    }

    const currentOtRate = await getOtRateSetting()
    // eslint-disable-next-line no-console
    console.log("Saved OT rate:", currentOtRate)
    return NextResponse.json({ ok: true, data, otRatePerHour: currentOtRate })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update OT logs." },
      { status: 400 },
    )
  }
}
