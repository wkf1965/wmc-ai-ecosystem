"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Activity, RefreshCw } from "lucide-react"

// ── Monthly turning allowance constants (mirrors turningPhotoScorer.ts) ────────
const TURNING_ALLOWANCE_PER_MARK = 0.80
const TURNING_ALLOWANCE_CAP = 150
const TURNING_VALID_THRESHOLD = 70

type TurningRow = {
  id: string
  recordId: string
  patientName: string
  room: string
  turningTime: string
  position: string
  nurseName: string
  savedAt: string
  remark: string
  nextTurningDueAt: string
  status: "done" | "due_soon" | "overdue"
  source: "google_sheet" | "telegram_store"
}

type TurningPhotoAssessment = {
  id: string
  recordId: string
  patientName: string
  room: string
  nurseName: string
  turningPosition: string
  photoFilePath: string
  postureScore: number
  timingScore: number
  safetyScore: number
  overallScore: number
  allowanceEarned: number
  scoreReason: string
  supervisorStatus: "pending" | "approved" | "rejected" | "overridden"
  supervisorComment: string
  uploadedAt: string
  uploadTimestamp: string
  turningSessionTimestamp: string
  timezone: string
  exactDate: string
  exactTime: string
  uploadSource: "camera_live" | "gallery_upload" | "unknown"
  galleryUploadWarning: boolean
  lateUpload: boolean
  duplicateImageHash: boolean
  verificationBadges: string[]
  verificationResult: "ai_verified" | "warning" | "invalid"
  allowanceLocked: boolean
  allowanceLockReason: string | null
  scoringStatus: "PENDING" | "SUCCESS" | "FAILED"
  scoringError: string | null
  scoringAttempts: number
  aiModel: string | null
  analysisMode: "image" | "fallback" | "openai"
}

type MonthlyTurningSummaryRow = {
  nurseName: string
  month: string
  totalRecords: number
  validMarks: number
  invalidMarks: number
  averageScore: number
  allowanceBeforeCap: number
  finalAllowance: number
}

function formatDateTime(value: string) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function statusLabel(value: TurningRow["status"]) {
  if (value === "done") return "Done"
  if (value === "due_soon") return "Due soon"
  return "Overdue"
}

function statusTone(value: TurningRow["status"]) {
  if (value === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (value === "due_soon") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-rose-200 bg-rose-50 text-rose-700"
}

export default function TurningPage() {
  const [rows, setRows] = useState<TurningRow[]>([])
  const [mode, setMode] = useState<"simulation" | "live">("live")
  const [status, setStatus] = useState("")
  const [query, setQuery] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSendingAlerts, setIsSendingAlerts] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState("")
  const [photoRows, setPhotoRows] = useState<TurningPhotoAssessment[]>([])
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [alertStats, setAlertStats] = useState({
    overdueToday: 0,
    alertsSentToday: 0,
    criticalAlertsToday: 0,
    supervisorAlertsToday: 0,
  })

  // ── Monthly turning allowance filters ─────────────────────────────────────
  const [monthlyTurningMonth, setMonthlyTurningMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [monthlyTurningNurse, setMonthlyTurningNurse] = useState("All")

  function readSimulationRows() {
    if (typeof window === "undefined") return [] as TurningRow[]
    const raw = window.localStorage.getItem("wmc_turning_simulation_rows_v1")
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as TurningRow[]) : []
    } catch {
      return []
    }
  }

  async function refreshLiveRows(silent = false) {
    if (mode !== "live") return
    if (!silent) setIsRefreshing(true)
    try {
      const response = await fetch("/api/turning-records", { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        setStatus(`Unable to load turning records${payload?.error ? `: ${payload.error}` : ""}`)
        return
      }
      setRows(payload.data as TurningRow[])
      const photoResponse = await fetch("/api/turning-photo-assessments", { cache: "no-store" })
      const photoPayload = await photoResponse.json().catch(() => null)
      if (photoResponse.ok && photoPayload?.ok && Array.isArray(photoPayload.data)) {
        setPhotoRows(photoPayload.data as TurningPhotoAssessment[])
      }
      const statsResponse = await fetch("/api/turning-records/alerts", { cache: "no-store" })
      const statsPayload = await statsResponse.json().catch(() => null)
      if (statsResponse.ok && statsPayload?.ok && statsPayload.data) {
        setAlertStats({
          overdueToday: Number(statsPayload.data.overdueToday || 0),
          alertsSentToday: Number(statsPayload.data.alertsSentToday || 0),
          criticalAlertsToday: Number(statsPayload.data.criticalAlertsToday || 0),
          supervisorAlertsToday: Number(statsPayload.data.supervisorAlertsToday || 0),
        })
      }
      setLastSyncAt(new Date().toLocaleTimeString())
      if (!silent) setStatus("Turning records refreshed from backend/Telegram.")
    } catch {
      setStatus("Unable to load turning records.")
    } finally {
      if (!silent) setIsRefreshing(false)
    }
  }

  async function sendOverdueAlertsNow() {
    if (mode !== "live") return
    setIsSendingAlerts(true)
    try {
      const response = await fetch("/api/turning-records/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) {
        setStatus(`Unable to send overdue alerts${payload?.error ? `: ${payload.error}` : ""}`)
        return
      }
      const info = payload.data || {}
      setStatus(
        `Alerts sent: ${Number(info.sent || 0)} (overdue ${Number(info.overdue || 0)} · critical ${Number(
          info.criticalSent || 0,
        )} · supervisor ${Number(info.supervisorSent || 0)} · skipped ${Number(info.skippedDuplicate || 0)})${
          info.envError ? ` — ⚠️ ${info.envError}` : ""
        }.`,
      )
      await refreshLiveRows(true)
    } catch {
      setStatus("Unable to send overdue alerts.")
    } finally {
      setIsSendingAlerts(false)
    }
  }

  async function handleRetryScoring(id: string) {
    setRetryingId(id)
    setStatus("Retrying AI scoring...")
    try {
      const response = await fetch("/api/turning-photo-assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry_scoring", id }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) {
        setStatus(`Retry failed: ${payload?.error ?? "unknown error"}`)
        return
      }
      const updated = payload.data as TurningPhotoAssessment
      setPhotoRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...updated } : row)))
      setStatus(updated.scoringStatus === "SUCCESS"
        ? `AI scoring SUCCESS — score: ${updated.overallScore}`
        : `AI scoring still FAILED: ${updated.scoringError ?? "unknown error"}`)
    } catch (err) {
      setStatus(`Retry error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRetryingId(null)
    }
  }

  useEffect(() => {
    if (mode === "simulation") {
      setRows(readSimulationRows())
      setStatus("Simulation mode active (localStorage).")
      return
    }
    void refreshLiveRows(true)
  }, [mode])

  useEffect(() => {
    if (mode !== "live") return
    const timer = window.setInterval(() => {
      void refreshLiveRows(true)
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [mode])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (row) =>
        row.patientName.toLowerCase().includes(q) ||
        row.room.toLowerCase().includes(q) ||
        row.nurseName.toLowerCase().includes(q) ||
        row.position.toLowerCase().includes(q) ||
        row.recordId.toLowerCase().includes(q),
    )
  }, [rows, query])

  const leaderboards = useMemo(() => {
    const now = Date.now()
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const weekStart = now - 7 * 24 * 60 * 60 * 1000

    const build = (fromTs: number) => {
      const map = new Map<string, { nurseName: string; totalAllowance: number; totalScore: number; count: number }>()
      for (const row of photoRows) {
        const ts = new Date(row.uploadedAt).getTime()
        if (Number.isNaN(ts) || ts < fromTs) continue
        const key = row.nurseName.toLowerCase()
        const current = map.get(key) || { nurseName: row.nurseName, totalAllowance: 0, totalScore: 0, count: 0 }
        current.totalAllowance += Number(row.allowanceEarned || 0)
        current.totalScore += Number(row.overallScore || 0)
        current.count += 1
        map.set(key, current)
      }
      return Array.from(map.values())
        .map((row) => ({
          ...row,
          averageScore: row.count ? Number((row.totalScore / row.count).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.totalAllowance - a.totalAllowance || b.averageScore - a.averageScore)
        .slice(0, 5)
    }

    return {
      daily: build(dayStart.getTime()),
      weekly: build(weekStart),
    }
  }, [photoRows])

  const leaderboard = useMemo(() => {
    const map = new Map<string, { nurseName: string; totalAllowance: number; totalScore: number; count: number }>()
    for (const row of photoRows) {
      const key = row.nurseName.toLowerCase()
      const current = map.get(key) || { nurseName: row.nurseName, totalAllowance: 0, totalScore: 0, count: 0 }
      current.totalAllowance += Number(row.allowanceEarned || 0)
      current.totalScore += Number(row.overallScore || 0)
      current.count += 1
      map.set(key, current)
    }
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        averageScore: row.count ? Number((row.totalScore / row.count).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.totalAllowance - a.totalAllowance || b.averageScore - a.averageScore)
      .slice(0, 5)
  }, [photoRows])

  // ── Monthly turning allowance summary ─────────────────────────────────────
  const monthlySummaryRows = useMemo((): MonthlyTurningSummaryRow[] => {
    const scored = photoRows.filter((r) => r.scoringStatus === "SUCCESS")
    const map = new Map<string, { nurseName: string; month: string; scores: number[] }>()
    for (const row of scored) {
      const date = new Date(row.uploadedAt || "")
      if (Number.isNaN(date.getTime())) continue
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      const key = `${row.nurseName}|${month}`
      if (!map.has(key)) map.set(key, { nurseName: row.nurseName, month, scores: [] })
      map.get(key)!.scores.push(Number(row.overallScore || 0))
    }
    const result: MonthlyTurningSummaryRow[] = []
    for (const { nurseName, month, scores } of map.values()) {
      const totalRecords = scores.length
      const validMarks = scores.filter((s) => s >= TURNING_VALID_THRESHOLD).length
      const invalidMarks = totalRecords - validMarks
      const averageScore = totalRecords > 0 ? Number((scores.reduce((a, b) => a + b, 0) / totalRecords).toFixed(1)) : 0
      const allowanceBeforeCap = Number((validMarks * TURNING_ALLOWANCE_PER_MARK).toFixed(2))
      const finalAllowance = Number(Math.min(allowanceBeforeCap, TURNING_ALLOWANCE_CAP).toFixed(2))
      result.push({ nurseName, month, totalRecords, validMarks, invalidMarks, averageScore, allowanceBeforeCap, finalAllowance })
    }
    return result.sort((a, b) => b.month.localeCompare(a.month) || a.nurseName.localeCompare(b.nurseName))
  }, [photoRows])

  const allMonthlyNurses = useMemo(
    () => ["All", ...new Set(monthlySummaryRows.map((r) => r.nurseName))].sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b))),
    [monthlySummaryRows],
  )

  const filteredMonthlySummary = useMemo(() => {
    let list = monthlySummaryRows
    if (monthlyTurningMonth) list = list.filter((r) => r.month === monthlyTurningMonth)
    if (monthlyTurningNurse && monthlyTurningNurse !== "All")
      list = list.filter((r) => r.nurseName.toLowerCase() === monthlyTurningNurse.toLowerCase())
    return list
  }, [monthlySummaryRows, monthlyTurningMonth, monthlyTurningNurse])

  const monthlySummaryTotals = useMemo(() => {
    return filteredMonthlySummary.reduce(
      (acc, r) => ({
        totalRecords: acc.totalRecords + r.totalRecords,
        validMarks: acc.validMarks + r.validMarks,
        invalidMarks: acc.invalidMarks + r.invalidMarks,
        finalAllowance: Number((acc.finalAllowance + r.finalAllowance).toFixed(2)),
      }),
      { totalRecords: 0, validMarks: 0, invalidMarks: 0, finalAllowance: 0 },
    )
  }, [filteredMonthlySummary])

  function exportMonthlyTurningCSV() {
    if (filteredMonthlySummary.length === 0) {
      setStatus("No data to export.")
      return
    }
    const header = ["Month", "Nurse Name", "Total Records", "Valid Marks (≥70)", "Invalid Marks (<70)", "Avg AI Score", "Allowance Before Cap (RM)", "Final Allowance After Cap (RM)"]
    const csvLines = [header.join(",")]
    for (const r of filteredMonthlySummary) {
      csvLines.push([r.month, `"${r.nurseName}"`, r.totalRecords, r.validMarks, r.invalidMarks, r.averageScore.toFixed(1), r.allowanceBeforeCap.toFixed(2), r.finalAllowance.toFixed(2)].join(","))
    }
    csvLines.push([`"TOTAL"`, `""`, monthlySummaryTotals.totalRecords, monthlySummaryTotals.validMarks, monthlySummaryTotals.invalidMarks, `""`, `""`, monthlySummaryTotals.finalAllowance.toFixed(2)].join(","))
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `turning-monthly-allowance-${monthlyTurningMonth || "all"}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setStatus("Monthly turning allowance report exported.")
  }

  return (
    <div className="dashboard-shell">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Nursing operations</p>
            <h1 className="dashboard-title">Turning / Position Care</h1>
            <p className="text-sm text-slate-500">Telegram turning records synced with status and next due time</p>
            <p className="mt-1 text-xs text-slate-500">Last sync: {lastSyncAt || "waiting..."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className="metric-chip">
              Back to dashboard
            </Link>
            <Link href="/patients" className="metric-chip">
              Patients
            </Link>
            <Link href="/rooms" className="metric-chip">
              Rooms
            </Link>
          </div>
        </div>

        <section className="mb-4 grid gap-3 sm:grid-cols-3">
          <article className="panel-card">
            <p className="panel-title">Total turning records</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{rows.length}</p>
            <p className="mt-1 text-sm text-slate-500">Telegram + backend records</p>
          </article>
          <article className="panel-card">
            <p className="panel-title">Overdue</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{rows.filter((row) => row.status === "overdue").length}</p>
            <p className="mt-1 text-sm text-slate-500">Need immediate turning action</p>
          </article>
          <article className="panel-card">
            <p className="panel-title">Sync status</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{status || "Ready"}</p>
          </article>
        </section>

        {/* ── Overdue alert scheduler cards (auto every 5 min) ───────────── */}
        <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="panel-card border-l-4 border-amber-400">
            <p className="panel-title">Overdue Today</p>
            <p className="mt-2 text-2xl font-bold text-amber-600">{alertStats.overdueToday}</p>
            <p className="mt-1 text-xs text-slate-500">Records currently overdue</p>
          </article>
          <article className="panel-card border-l-4 border-sky-400">
            <p className="panel-title">Alerts Sent Today</p>
            <p className="mt-2 text-2xl font-bold text-sky-600">{alertStats.alertsSentToday}</p>
            <p className="mt-1 text-xs text-slate-500">Telegram alerts dispatched</p>
          </article>
          <article className="panel-card border-l-4 border-rose-400">
            <p className="panel-title">Critical Alerts</p>
            <p className="mt-2 text-2xl font-bold text-rose-600">{alertStats.criticalAlertsToday}</p>
            <p className="mt-1 text-xs text-slate-500">Overdue 30+ minutes</p>
          </article>
          <article className="panel-card border-l-4 border-red-600">
            <p className="panel-title">Supervisor Alerts</p>
            <p className="mt-2 text-2xl font-bold text-red-700">{alertStats.supervisorAlertsToday}</p>
            <p className="mt-1 text-xs text-slate-500">Overdue 60+ minutes</p>
          </article>
        </section>

        <section className="panel-card mb-4">
          <div className="mb-2 flex items-center gap-3 text-sm text-slate-700">
            <span className="font-medium">Data mode:</span>
            <label className="inline-flex items-center gap-1">
              <input type="radio" name="turningMode" checked={mode === "simulation"} onChange={() => setMode("simulation")} />
              Simulation
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" name="turningMode" checked={mode === "live"} onChange={() => setMode("live")} />
              Live
            </label>
            <button
              type="button"
              onClick={() => {
                void refreshLiveRows(false)
              }}
              disabled={mode !== "live" || isRefreshing}
              className="ml-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => {
                void sendOverdueAlertsNow()
              }}
              disabled={mode !== "live" || isSendingAlerts}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
            >
              {isSendingAlerts ? "Sending alerts..." : "Send overdue alerts now"}
            </button>
          </div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Search patient / room / nurse / position / record ID</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search turning records"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </section>

        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Turning time</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Recorded by</th>
                <th className="px-4 py-3">Remark</th>
                <th className="px-4 py-3">Record ID</th>
                <th className="px-4 py-3">Saved time</th>
                <th className="px-4 py-3">Next due</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-none">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <span className="inline-flex items-center gap-2">
                      <Activity className="h-4 w-4 text-slate-500" />
                      {row.patientName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.room || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(row.turningTime)}</td>
                  <td className="px-4 py-3 text-slate-700">{row.position}</td>
                  <td className="px-4 py-3 text-slate-700">{row.nurseName || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.remark || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.recordId || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(row.savedAt)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTime(row.nextTurningDueAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-slate-500">
                    No turning records found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-900">Turning Photo AI Scoring</h2>
            <p className="text-sm text-slate-500">
              AI posture, timing, and safety scoring with allowance and supervisor review
              {photoRows.length > 0 && (
                <span className="ml-2 text-xs">
                  ({photoRows.filter((r) => r.scoringStatus === "SUCCESS").length} success
                  {photoRows.filter((r) => r.scoringStatus === "FAILED").length > 0 && (
                    <span className="text-rose-600"> · {photoRows.filter((r) => r.scoringStatus === "FAILED").length} failed</span>
                  )}
                  {photoRows.filter((r) => r.scoringStatus === "PENDING").length > 0 && (
                    <span className="text-amber-600"> · {photoRows.filter((r) => r.scoringStatus === "PENDING").length} pending</span>
                  )}
                  )
                </span>
              )}
            </p>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">AI Status</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Nurse</th>
                <th className="px-4 py-3">Turning photo</th>
                <th className="px-4 py-3">AI posture score</th>
                <th className="px-4 py-3">Timing compliance</th>
                <th className="px-4 py-3">Skin protection score</th>
                <th className="px-4 py-3">Overall score</th>
                <th className="px-4 py-3">Allowance earned</th>
                <th className="px-4 py-3">AI remarks</th>
                <th className="px-4 py-3">Verification</th>
                <th className="px-4 py-3">Supervisor status</th>
              </tr>
            </thead>
            <tbody>
              {photoRows.map((row) => (
                <tr key={row.id} className={`border-b border-slate-100 last:border-none ${row.scoringStatus === "FAILED" ? "bg-rose-50" : row.scoringStatus === "PENDING" ? "bg-amber-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {row.scoringStatus === "SUCCESS" ? (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          SUCCESS
                        </span>
                      ) : row.scoringStatus === "FAILED" ? (
                        <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                          FAILED
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          PENDING
                        </span>
                      )}
                      {row.aiModel && (
                        <span className="text-[10px] text-slate-400">{row.aiModel}</span>
                      )}
                      {row.scoringAttempts > 1 && (
                        <span className="text-[10px] text-slate-400">{row.scoringAttempts} attempts</span>
                      )}
                      {(row.scoringStatus === "FAILED" || row.scoringStatus === "PENDING") && (
                        <button
                          type="button"
                          onClick={() => void handleRetryScoring(row.id)}
                          disabled={retryingId === row.id}
                          className="mt-1 inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        >
                          {retryingId === row.id ? "Retrying..." : "Retry AI"}
                        </button>
                      )}
                      {row.scoringStatus === "FAILED" && row.scoringError && (
                        <span className="mt-1 block max-w-[160px] truncate text-[9px] text-rose-500" title={row.scoringError}>
                          {row.scoringError}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.patientName}</td>
                  <td className="px-4 py-3 text-slate-700">{row.turningPosition}</td>
                  <td className="px-4 py-3 text-slate-700">{row.nurseName}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.photoFilePath ? (
                      <div className="flex items-center gap-2">
                        <Image
                          src={`/api/turning-photo-assessments/photo?filePath=${encodeURIComponent(row.photoFilePath)}`}
                          alt={`${row.patientName} turning`}
                          width={60}
                          height={60}
                          className="rounded border border-slate-200 object-cover"
                        />
                        <a
                          href={`/api/turning-photo-assessments/photo?filePath=${encodeURIComponent(row.photoFilePath)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline"
                        >
                          Open
                        </a>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.scoringStatus === "SUCCESS" ? row.postureScore : "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.scoringStatus === "SUCCESS" ? row.timingScore : "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.scoringStatus === "SUCCESS" ? row.safetyScore : "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.scoringStatus === "SUCCESS" ? row.overallScore : "-"}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.scoringStatus === "SUCCESS" ? (
                      <>
                        <div>RM {Number(row.allowanceEarned || 0).toFixed(2)}</div>
                        {row.allowanceLocked ? (
                          <div className="mt-1 inline-flex rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Allowance locked</div>
                        ) : null}
                      </>
                    ) : "-"}
                  </td>
                  <td className="max-w-[200px] px-4 py-3 text-xs text-slate-500" title={row.scoreReason || ""}>
                    {row.scoreReason ? (
                      <span className="line-clamp-2">{row.scoreReason}</span>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div className="mb-1 text-xs font-semibold uppercase">{row.verificationResult || "warning"}</div>
                    <div className="flex flex-wrap gap-1">
                      {(row.verificationBadges || []).map((badge) => (
                        <span key={`${row.id}-${badge}`} className="inline-flex rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                          {badge}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.supervisorStatus}</td>
                </tr>
              ))}
              {photoRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-6 text-slate-500">
                    No turning photo assessments yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {/* ── Monthly Turning Allowance Summary ─────────────────────────── */}
        <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Monthly Turning Allowance Summary</h2>
                <p className="text-sm text-slate-500">
                  1 valid mark (≥{TURNING_VALID_THRESHOLD}) = RM {TURNING_ALLOWANCE_PER_MARK.toFixed(2)} &nbsp;·&nbsp;
                  Monthly cap RM {TURNING_ALLOWANCE_CAP.toFixed(2)} per nurse
                </p>
              </div>
              <button
                type="button"
                onClick={exportMonthlyTurningCSV}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                Export CSV
              </button>
            </div>

            {/* Filters */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Month</label>
                <input
                  type="month"
                  value={monthlyTurningMonth}
                  onChange={(e) => setMonthlyTurningMonth(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Nurse</label>
                <select
                  value={monthlyTurningNurse}
                  onChange={(e) => setMonthlyTurningNurse(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                >
                  {allMonthlyNurses.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              {monthlyTurningMonth && (
                <button
                  type="button"
                  onClick={() => { setMonthlyTurningMonth(""); setMonthlyTurningNurse("All") }}
                  className="text-xs text-slate-500 underline"
                >
                  Show all months
                </button>
              )}
            </div>
          </div>

          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Nurse Name</th>
                <th className="px-4 py-3">Total Records</th>
                <th className="px-4 py-3">Valid Marks (≥{TURNING_VALID_THRESHOLD})</th>
                <th className="px-4 py-3">Invalid Marks (&lt;{TURNING_VALID_THRESHOLD})</th>
                <th className="px-4 py-3">Avg AI Score</th>
                <th className="px-4 py-3">Before Cap (RM)</th>
                <th className="px-4 py-3">Final Allowance (RM)</th>
                <th className="px-4 py-3">Cap Hit?</th>
              </tr>
            </thead>
            <tbody>
              {filteredMonthlySummary.map((row) => {
                const capHit = row.allowanceBeforeCap > TURNING_ALLOWANCE_CAP
                return (
                  <tr key={`${row.nurseName}|${row.month}`} className="border-b border-slate-100 last:border-none">
                    <td className="px-4 py-3 text-slate-700">{row.month}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.nurseName}</td>
                    <td className="px-4 py-3 text-slate-700">{row.totalRecords}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-emerald-700">{row.validMarks}</span>
                    </td>
                    <td className="px-4 py-3">
                      {row.invalidMarks > 0 ? (
                        <span className="text-rose-600">{row.invalidMarks}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className={row.averageScore >= TURNING_VALID_THRESHOLD ? "text-emerald-700 font-semibold" : "text-rose-600 font-semibold"}>
                        {row.averageScore}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">RM {row.allowanceBeforeCap.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-900">RM {row.finalAllowance.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {capHit ? (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          Capped
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filteredMonthlySummary.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-slate-500">
                    No turning data for the selected period.
                  </td>
                </tr>
              )}
              {/* Totals row */}
              {filteredMonthlySummary.length > 0 && (
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                  <td className="px-4 py-3">{monthlySummaryTotals.totalRecords}</td>
                  <td className="px-4 py-3 text-emerald-700">{monthlySummaryTotals.validMarks}</td>
                  <td className="px-4 py-3 text-rose-600">{monthlySummaryTotals.invalidMarks}</td>
                  <td className="px-4 py-3">—</td>
                  <td className="px-4 py-3">—</td>
                  <td className="px-4 py-3">RM {monthlySummaryTotals.finalAllowance.toFixed(2)}</td>
                  <td className="px-4 py-3">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Nurse Leaderboard (Daily / Weekly)</h2>
          <p className="text-sm text-slate-500">Best turning nurse, total allowance, and average AI score</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">Daily</p>
              <div className="grid gap-2">
                {leaderboards.daily.map((row, idx) => (
                  <div key={`d-${row.nurseName}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <span>
                      #{idx + 1} {row.nurseName}
                    </span>
                    <span>
                      RM {row.totalAllowance.toFixed(2)} | Avg {row.averageScore}
                    </span>
                  </div>
                ))}
                {leaderboards.daily.length === 0 ? <p className="text-sm text-slate-500">No daily data.</p> : null}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">Weekly</p>
              <div className="grid gap-2">
                {leaderboards.weekly.map((row, idx) => (
                  <div key={`w-${row.nurseName}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <span>
                      #{idx + 1} {row.nurseName}
                    </span>
                    <span>
                      RM {row.totalAllowance.toFixed(2)} | Avg {row.averageScore}
                    </span>
                  </div>
                ))}
                {leaderboards.weekly.length === 0 ? <p className="text-sm text-slate-500">No weekly data.</p> : null}
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {leaderboard.map((row, idx) => (
              <div key={row.nurseName} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span>
                  #{idx + 1} {row.nurseName}
                </span>
                <span>
                  Allowance RM {row.totalAllowance.toFixed(2)} | Avg score {row.averageScore}
                </span>
              </div>
            ))}
            {leaderboard.length === 0 ? <p className="text-sm text-slate-500">No nurse leaderboard data yet.</p> : null}
          </div>
        </section>
      </main>
    </div>
  )
}
