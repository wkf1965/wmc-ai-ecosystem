import { promises as fs } from "fs"
import path from "path"
import { readTurningRows, type TurningApiRow } from "./turningData"
import { sendTelegramMessage } from "../telegramSender"

// ── Escalation thresholds (minutes overdue) ──────────────────────────────────
const NORMAL_MIN = 15
const CRITICAL_MIN = 30
const SUPERVISOR_MIN = 60

export type AlertLevel = "NONE" | "NORMAL" | "CRITICAL" | "SUPERVISOR"

const LEVEL_RANK: Record<AlertLevel, number> = { NONE: 0, NORMAL: 1, CRITICAL: 2, SUPERVISOR: 3 }

type AlertRecord = {
  alertSent: boolean
  alertSentAt: string
  lastAlertLevel: AlertLevel
  patientName: string
  room: string
}

type AlertEvent = {
  level: AlertLevel
  at: string
  room: string
  patientName: string
}

type AlertState = {
  alerts: Record<string, AlertRecord>
  events: AlertEvent[]
}

const ALERT_STATE_PATH = path.join(process.cwd(), ".turning-overdue-alerts.json")
const PURGE_AGE_MS = 48 * 60 * 60 * 1000

// ── State persistence (with legacy migration) ────────────────────────────────

function isAlertLevel(value: unknown): value is AlertLevel {
  return value === "NONE" || value === "NORMAL" || value === "CRITICAL" || value === "SUPERVISOR"
}

async function readAlertState(): Promise<AlertState> {
  try {
    const raw = await fs.readFile(ALERT_STATE_PATH, "utf8")
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const alerts: Record<string, AlertRecord> = {}
    const rawAlerts =
      parsed?.alerts && typeof parsed.alerts === "object" ? (parsed.alerts as Record<string, unknown>) : {}

    for (const [key, value] of Object.entries(rawAlerts)) {
      if (typeof value === "string") {
        // Legacy format: value was just the alertSentAt ISO string.
        alerts[key] = { alertSent: true, alertSentAt: value, lastAlertLevel: "NORMAL", patientName: "", room: "" }
      } else if (value && typeof value === "object") {
        const v = value as Record<string, unknown>
        alerts[key] = {
          alertSent: Boolean(v.alertSent ?? true),
          alertSentAt: String(v.alertSentAt ?? ""),
          lastAlertLevel: isAlertLevel(v.lastAlertLevel) ? v.lastAlertLevel : "NORMAL",
          patientName: String(v.patientName ?? ""),
          room: String(v.room ?? ""),
        }
      }
    }

    const events: AlertEvent[] = Array.isArray(parsed?.events)
      ? (parsed.events as AlertEvent[]).filter((e) => e && typeof e.at === "string")
      : []

    return { alerts, events }
  } catch {
    return { alerts: {}, events: [] }
  }
}

async function writeAlertState(state: AlertState) {
  await fs.writeFile(ALERT_STATE_PATH, JSON.stringify(state, null, 2), "utf8")
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value || "-"
  return parsed.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })
}

function alertKey(row: TurningApiRow) {
  return `${row.room}::${row.patientName}::${row.nextTurningDueAt}`
}

function overdueMinutes(row: TurningApiRow): number {
  const due = new Date(row.nextTurningDueAt).getTime()
  if (Number.isNaN(due)) return 0
  return Math.floor((Date.now() - due) / 60_000)
}

function levelForMinutes(mins: number): AlertLevel {
  if (mins >= SUPERVISOR_MIN) return "SUPERVISOR"
  if (mins >= CRITICAL_MIN) return "CRITICAL"
  if (mins >= NORMAL_MIN) return "NORMAL"
  return "NONE"
}

// ── Message builders ──────────────────────────────────────────────────────────

function buildNormalMessage(row: TurningApiRow) {
  return [
    "⚠️ TURNING OVERDUE ALERT",
    "",
    `Patient: ${row.patientName || "-"}`,
    `Room: ${row.room || "-"}`,
    `Last Position: ${row.position || "-"}`,
    `Last Turning: ${formatDateTime(row.turningTime)}`,
    `Due Time: ${formatDateTime(row.nextTurningDueAt)}`,
    "",
    "Please perform side turning immediately.",
  ].join("\n")
}

function buildCriticalMessage(row: TurningApiRow) {
  return [
    "🔴 CRITICAL TURNING ALERT",
    "",
    `Patient: ${row.patientName || "-"}`,
    `Room: ${row.room || "-"}`,
    "",
    "Overdue:",
    "30+ minutes",
    "",
    "Please attend immediately.",
  ].join("\n")
}

function buildSupervisorMessage(row: TurningApiRow) {
  return [
    "🔴 SUPERVISOR ACTION REQUIRED",
    "",
    `Patient: ${row.patientName || "-"}`,
    `Room: ${row.room || "-"}`,
    "",
    "Turning overdue:",
    "60+ minutes",
  ].join("\n")
}

function messageForLevel(level: AlertLevel, row: TurningApiRow): string {
  if (level === "SUPERVISOR") return buildSupervisorMessage(row)
  if (level === "CRITICAL") return buildCriticalMessage(row)
  return buildNormalMessage(row)
}

// ── Env check (#9) ─────────────────────────────────────────────────────────────

export function checkTelegramEnv(): string | null {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim()
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim()
  if (!token) return "TELEGRAM_BOT_TOKEN is missing"
  if (!chatId) return "TELEGRAM_CHAT_ID is missing"
  return null
}

// ── Main alert engine (shared by scheduler + manual button) ──────────────────

export async function sendTurningOverdueAlertsNow() {
  const envError = checkTelegramEnv()
  if (envError) {
    // eslint-disable-next-line no-console
    console.error(`[Alert] Failed: ${envError}. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in web/.env.local`)
  }

  const rows = await readTurningRows()
  const overdueRows = rows.filter((row) => row.status === "overdue")

  // eslint-disable-next-line no-console
  console.log(`[Scheduler] Overdue records found: ${overdueRows.length}`)

  const state = await readAlertState()
  const now = Date.now()

  let sent = 0
  let normalSent = 0
  let criticalSent = 0
  let supervisorSent = 0
  let skippedDuplicate = 0
  let skippedBelowThreshold = 0
  let failed = 0

  for (const row of overdueRows) {
    const key = alertKey(row)
    const mins = overdueMinutes(row)
    const targetLevel = levelForMinutes(mins)

    // < 15 min overdue → not yet alertable
    if (targetLevel === "NONE") {
      skippedBelowThreshold += 1
      continue
    }

    const existing = state.alerts[key]
    const prevLevel: AlertLevel = existing?.lastAlertLevel ?? "NONE"

    // Duplicate prevention (#5): only send when escalating to a higher level.
    if (LEVEL_RANK[targetLevel] <= LEVEL_RANK[prevLevel]) {
      skippedDuplicate += 1
      continue
    }

    if (envError) {
      failed += 1
      continue
    }

    try {
      await sendTelegramMessage({ simulated: false, message: messageForLevel(targetLevel, row) })
      const at = new Date().toISOString()

      // Alert tracking (#3): alertSent = true, alertSentAt, lastAlertLevel
      state.alerts[key] = {
        alertSent: true,
        alertSentAt: at,
        lastAlertLevel: targetLevel,
        patientName: row.patientName,
        room: row.room,
      }
      state.events.push({ level: targetLevel, at, room: row.room, patientName: row.patientName })
      sent += 1

      if (targetLevel === "NORMAL") {
        normalSent += 1
        // eslint-disable-next-line no-console
        console.log(`[Alert] Sent to Telegram (room ${row.room}, ${row.patientName}, overdue ${mins} min)`)
      } else if (targetLevel === "CRITICAL") {
        criticalSent += 1
        // eslint-disable-next-line no-console
        console.log(`[Alert] Critical Alert Sent (room ${row.room}, ${row.patientName}, overdue ${mins} min)`)
      } else if (targetLevel === "SUPERVISOR") {
        supervisorSent += 1
        // eslint-disable-next-line no-console
        console.log(`[Alert] Supervisor Alert Sent (room ${row.room}, ${row.patientName}, overdue ${mins} min)`)
      }
    } catch (error) {
      failed += 1
      // eslint-disable-next-line no-console
      console.error(`[Alert] Failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Purge alert state + events older than 48h
  for (const [key, value] of Object.entries(state.alerts)) {
    const ts = new Date(value.alertSentAt).getTime()
    if (!Number.isNaN(ts) && now - ts > PURGE_AGE_MS) delete state.alerts[key]
  }
  state.events = state.events.filter((e) => {
    const t = new Date(e.at).getTime()
    return !Number.isNaN(t) && now - t <= PURGE_AGE_MS
  })

  await writeAlertState(state)

  return {
    checked: rows.length,
    overdue: overdueRows.length,
    sent,
    normalSent,
    criticalSent,
    supervisorSent,
    skippedDuplicate,
    skippedBelowThreshold,
    failed,
    envError: envError || null,
    at: new Date().toISOString(),
  }
}

// ── Dashboard card stats (#6) ──────────────────────────────────────────────────

export async function getTurningAlertStats() {
  const rows = await readTurningRows().catch(() => [] as TurningApiRow[])
  const overdueToday = rows.filter((row) => row.status === "overdue").length

  const state = await readAlertState()
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const startMs = dayStart.getTime()

  let alertsSentToday = 0
  let criticalAlertsToday = 0
  let supervisorAlertsToday = 0

  for (const event of state.events) {
    const t = new Date(event.at).getTime()
    if (Number.isNaN(t) || t < startMs) continue
    alertsSentToday += 1
    if (event.level === "CRITICAL") criticalAlertsToday += 1
    else if (event.level === "SUPERVISOR") supervisorAlertsToday += 1
  }

  return {
    overdueToday,
    alertsSentToday,
    criticalAlertsToday,
    supervisorAlertsToday,
    at: new Date().toISOString(),
  }
}
