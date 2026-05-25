"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Clock3, LogIn, LogOut, Send } from "lucide-react"

type OtLogRow = {
  id: string
  nurseName: string
  date: string
  punchInAt: string
  punchOutAt: string | null
  totalHours: number
  overtimeHours: number
}

const STORAGE_KEY = "wmc_nursing_ot_logs_v1"
const DEFAULT_SHIFT_HOURS = 8

function nowIso() {
  return new Date().toISOString()
}

function formatDateTime(value: string) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function readLogs() {
  if (typeof window === "undefined") return [] as OtLogRow[]
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return [] as OtLogRow[]
  try {
    const parsed = JSON.parse(raw) as OtLogRow[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] as OtLogRow[]
  }
}

function writeLogs(rows: OtLogRow[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export default function OvertimeOtPage() {
  const [nurseName, setNurseName] = useState("")
  const [status, setStatus] = useState("")
  const [rows, setRows] = useState<OtLogRow[]>(() => readLogs())
  const [isSendingTelegram, setIsSendingTelegram] = useState(false)
  const [telegramMode, setTelegramMode] = useState<"simulation" | "live">("simulation")

  const activeSession = useMemo(
    () => rows.find((item) => !item.punchOutAt && item.nurseName.trim().toLowerCase() === nurseName.trim().toLowerCase()),
    [rows, nurseName],
  )

  const totalOvertimeHours = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.overtimeHours || 0), 0),
    [rows],
  )

  function punchIn() {
    const normalizedName = nurseName.trim()
    if (!normalizedName) {
      setStatus("Please enter nurse name before punch in.")
      return
    }
    const existingOpen = rows.find(
      (item) => !item.punchOutAt && item.nurseName.trim().toLowerCase() === normalizedName.toLowerCase(),
    )
    if (existingOpen) {
      setStatus("This nurse already has an active punch-in session.")
      return
    }
    const next: OtLogRow = {
      id: `ot-${Date.now()}`,
      nurseName: normalizedName,
      date: new Date().toISOString().slice(0, 10),
      punchInAt: nowIso(),
      punchOutAt: null,
      totalHours: 0,
      overtimeHours: 0,
    }
    const updated = [next, ...rows]
    setRows(updated)
    writeLogs(updated)
    setStatus("Punch in recorded.")
  }

  function punchOut() {
    const normalizedName = nurseName.trim()
    if (!normalizedName) {
      setStatus("Please enter nurse name before punch out.")
      return
    }
    const index = rows.findIndex(
      (item) => !item.punchOutAt && item.nurseName.trim().toLowerCase() === normalizedName.toLowerCase(),
    )
    if (index === -1) {
      setStatus("No active punch-in session found for this nurse.")
      return
    }

    const now = new Date()
    const source = rows[index]
    const started = new Date(source.punchInAt)
    const workedHours = Math.max(0, (now.getTime() - started.getTime()) / (1000 * 60 * 60))
    const overtimeHours = Math.max(0, workedHours - DEFAULT_SHIFT_HOURS)

    const updatedRow: OtLogRow = {
      ...source,
      punchOutAt: now.toISOString(),
      totalHours: Number(workedHours.toFixed(2)),
      overtimeHours: Number(overtimeHours.toFixed(2)),
    }

    const updated = [...rows]
    updated[index] = updatedRow
    setRows(updated)
    writeLogs(updated)
    setStatus(`Punch out recorded. Overtime: ${updatedRow.overtimeHours.toFixed(2)}h`)
  }

  async function sendOtSummaryToTelegram() {
    const completedRows = rows.filter((row) => !!row.punchOutAt)
    const topRows = completedRows.slice(0, 10)
    const lines = [
      "WMC Nursing OT Summary",
      `Generated: ${new Date().toLocaleString()}`,
      `Total OT hours: ${totalOvertimeHours.toFixed(2)}`,
      `Completed sessions: ${completedRows.length}`,
      "",
      "Recent sessions:",
      ...(topRows.length
        ? topRows.map(
            (row) =>
              `- ${row.nurseName} | ${row.date} | Worked ${row.totalHours.toFixed(2)}h | OT ${row.overtimeHours.toFixed(2)}h`,
          )
        : ["- No completed OT sessions yet."]),
    ]

    try {
      setIsSendingTelegram(true)
      const response = await fetch("/api/integrations/telegram/send-ot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: lines.join("\n"),
          simulated: telegramMode !== "live",
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setStatus(`Telegram OT send failed${payload?.error ? `: ${payload.error}` : ""}`)
        return
      }
      setStatus(telegramMode === "live" ? "Telegram OT summary sent (live)." : "Telegram OT summary sent (simulation).")
    } catch {
      setStatus("Unable to send Telegram OT summary.")
    } finally {
      setIsSendingTelegram(false)
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Nursing operations</p>
          <h1 className="text-2xl font-semibold text-slate-900">Overtime OT Module</h1>
          <p className="text-sm text-slate-500">OT calculation, punch in/out workflow, and Telegram bot handoff</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/nurse-duty-roster" className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Open duty roster
          </Link>
          <Link href="/dashboard" className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Back to dashboard
          </Link>
        </div>
      </div>

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total OT hours</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{totalOvertimeHours.toFixed(2)}</p>
          <p className="mt-1 text-sm text-slate-500">Across all recorded sessions</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active sessions</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{rows.filter((row) => !row.punchOutAt).length}</p>
          <p className="mt-1 text-sm text-slate-500">Nurses currently punched in</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Standard shift</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{DEFAULT_SHIFT_HOURS}h</p>
          <p className="mt-1 text-sm text-slate-500">OT = worked hours - shift hours</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Nurse name</label>
            <input
              value={nurseName}
              onChange={(event) => setNurseName(event.target.value)}
              placeholder="Enter nurse name"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={punchIn}
            className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <LogIn className="h-4 w-4" />
            Punch in
          </button>
          <button
            type="button"
            onClick={punchOut}
            className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <LogOut className="h-4 w-4" />
            Punch out
          </button>
          <a
            href="https://t.me/wmc_ai_nursing_bot"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 self-end rounded-lg border border-indigo-300 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <Send className="h-4 w-4" />
            Open Telegram bot
          </a>
        </div>
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-3 text-sm text-slate-700">
            <span className="font-medium">Telegram mode:</span>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="telegramMode"
                value="simulation"
                checked={telegramMode === "simulation"}
                onChange={() => setTelegramMode("simulation")}
              />
              Simulation
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="telegramMode"
                value="live"
                checked={telegramMode === "live"}
                onChange={() => setTelegramMode("live")}
              />
              Live
            </label>
          </div>
          <button
            type="button"
            onClick={sendOtSummaryToTelegram}
            disabled={isSendingTelegram}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isSendingTelegram
              ? "Sending..."
              : `Send OT summary to Telegram (${telegramMode === "live" ? "live" : "simulation"})`}
          </button>
          {telegramMode === "live" ? (
            <p className="mt-2 text-xs text-amber-700">
              Live mode requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to be configured.
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            <Clock3 className="h-4 w-4" />
            {activeSession ? `Active: ${activeSession.nurseName} since ${formatDateTime(activeSession.punchInAt)}` : "No active session for selected nurse"}
          </span>
          <span>{status || "Ready for OT punch actions."}</span>
        </div>
      </section>

      <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Nurse</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Punch in</th>
              <th className="px-4 py-3">Punch out</th>
              <th className="px-4 py-3">Worked hours</th>
              <th className="px-4 py-3">OT hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-none">
                <td className="px-4 py-3 font-medium text-slate-900">{row.nurseName}</td>
                <td className="px-4 py-3 text-slate-700">{row.date}</td>
                <td className="px-4 py-3 text-slate-700">{formatDateTime(row.punchInAt)}</td>
                <td className="px-4 py-3 text-slate-700">{row.punchOutAt ? formatDateTime(row.punchOutAt) : "Active"}</td>
                <td className="px-4 py-3 text-slate-700">{row.totalHours.toFixed(2)}</td>
                <td className="px-4 py-3 text-slate-700">{row.overtimeHours.toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={6}>
                  No OT records yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  )
}
