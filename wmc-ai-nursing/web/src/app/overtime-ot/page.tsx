"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Clock3, LogIn, LogOut, RefreshCw, Send } from "lucide-react"

type OtApprovalStatus = "pending" | "approved" | "rejected"

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
  approvalStatus?: OtApprovalStatus
  approvedAt?: string | null
  approvedBy?: string | null
  approvalNote?: string | null
  rejectedAt?: string | null
  rejectionReason?: string | null
  source?: "telegram" | "manual"
  syncStatus?: "synced" | "pending_sync" | "failed_sync"
  syncError?: string | null
  lastSyncAttemptAt?: string | null
}

type ApprovalAuditRow = {
  id: string
  recordId: string
  nurseName: string
  date: string
  action: OtApprovalStatus
  approvedBy: string
  approvalNote: string
  rejectionReason: string
  timestamp: string
}

type MonthlyOtSummaryRow = {
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

type OtEventRow = {
  id: string
  nurseName: string
  commandType: "punchin" | "punchout" | "otin" | "otout"
  timestamp: string
  source: "telegram" | "manual"
}

type OtRecalculationAuditRow = {
  id: string
  recordId: string
  nurseName: string
  date: string
  old_rate: number
  new_rate: number
  old_allowance: number
  new_allowance: number
  updated_at: string
}

const DEFAULT_SHIFT_HOURS = 8

/**
 * Canonical OT calculation — same rule as calculateOT in attendanceCalculation.js
 * and nursingModuleStore.ts.
 *
 * Rule: round hours to 2 dp FIRST, then multiply rate, then round result.
 * This ensures Telegram, dashboard, and recalculation all produce the same value.
 */
function calculateOT(startAt: string, endAt: string, rate: number) {
  const ms = new Date(endAt).getTime() - new Date(startAt).getTime()
  const rawMinutes = Number.isNaN(ms) ? 0 : Math.max(0, ms / 60000)
  const otHoursRounded = Math.round((rawMinutes / 60) * 100) / 100
  const allowanceRounded = Math.round(otHoursRounded * (Number(rate) || 0) * 100) / 100
  return { rawMinutes, otHoursRounded, allowanceRounded }
}

function formatDateTime(value: string) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function toNumber(value: unknown) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

function formatMoney(value: unknown) {
  return toNumber(value).toFixed(2)
}

export default function OvertimeOtPage() {
  const [nurseName, setNurseName] = useState("")
  const [status, setStatus] = useState("")
  const [rows, setRows] = useState<OtLogRow[]>([])
  const [events, setEvents] = useState<OtEventRow[]>([])
  const [recalculationAuditRows, setRecalculationAuditRows] = useState<OtRecalculationAuditRow[]>([])
  const [isSendingTelegram, setIsSendingTelegram] = useState(false)
  const [telegramMode, setTelegramMode] = useState<"simulation" | "live">("live")
  const [otRateInput, setOtRateInput] = useState("0")
  const isOtRateDirtyRef = useRef(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [queuePendingCount, setQueuePendingCount] = useState(0)
  const [queueFailedCount, setQueueFailedCount] = useState(0)
  const [isRetryingQueue, setIsRetryingQueue] = useState(false)
  const [isRecalculatingRecords, setIsRecalculatingRecords] = useState(false)

  // ── Approval workflow state ──────────────────────────────────────────────────
  const [approvalModal, setApprovalModal] = useState<{
    record: OtLogRow
    intent: "approved" | "rejected"
  } | null>(null)
  const [modalSupervisor, setModalSupervisor] = useState("")
  const [modalNote, setModalNote] = useState("")
  const [modalRejectionReason, setModalRejectionReason] = useState("")
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false)
  const [approvalAuditRows, setApprovalAuditRows] = useState<ApprovalAuditRow[]>([])
  const [retryingSyncId, setRetryingSyncId] = useState<string | null>(null)

  // ── Monthly summary state ────────────────────────────────────────────────────
  const [monthlyMonth, setMonthlyMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
  const [monthlyNurseFilter, setMonthlyNurseFilter] = useState("")

  const activeSession = useMemo(() => rows.find((item) => item.nurseName.trim().toLowerCase() === nurseName.trim().toLowerCase()), [rows, nurseName])

  const totalOvertimeHours = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.otHours || 0), 0),
    [rows],
  )
  const totalAllowance = useMemo(() => rows.reduce((sum, row) => sum + Number(row.totalOtAllowance || 0), 0), [rows])
  const dutyActiveCount = useMemo(() => rows.filter((row) => row.status === "on_duty").length, [rows])
  const otActiveCount = useMemo(() => rows.filter((row) => row.status === "ot_active").length, [rows])
  const lastTelegramEvent = useMemo(
    () => events.find((event) => event.source === "telegram") || null,
    [events],
  )

  const monthlySummaryRows = useMemo<MonthlyOtSummaryRow[]>(() => {
    const r2 = (n: number) => Math.round(n * 100) / 100
    const filtered = rows.filter(
      (row) =>
        row.status === "ot_completed" &&
        String(row.date || "").startsWith(monthlyMonth) &&
        (!monthlyNurseFilter ||
          row.nurseName.toLowerCase().includes(monthlyNurseFilter.toLowerCase())),
    )
    const map = new Map<string, MonthlyOtSummaryRow>()
    for (const row of filtered) {
      const name     = row.nurseName.replace(/^@/, "").trim()
      const allowance = Math.max(0, toNumber(row.totalOtAllowance))
      const approval  = (row.approvalStatus || "pending") as OtApprovalStatus
      const entry = map.get(name) ?? {
        month: monthlyMonth,
        nurseName: name,
        totalSessions: 0,
        totalOtHours: 0,
        otRate: 0,
        totalOtAllowance: 0,
        pendingAmount: 0,
        approvedAmount: 0,
        rejectedAmount: 0,
        finalPayable: 0,
      }
      entry.totalSessions   += 1
      entry.totalOtHours     = r2(entry.totalOtHours + toNumber(row.otHours))
      entry.otRate           = Math.max(entry.otRate, toNumber(row.otRate))
      entry.totalOtAllowance = r2(entry.totalOtAllowance + allowance)
      if (approval === "approved")       entry.approvedAmount = r2(entry.approvedAmount + allowance)
      else if (approval === "rejected")  entry.rejectedAmount = r2(entry.rejectedAmount + allowance)
      else                               entry.pendingAmount  = r2(entry.pendingAmount  + allowance)
      entry.finalPayable = entry.approvedAmount
      map.set(name, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.nurseName.localeCompare(b.nurseName))
  }, [rows, monthlyMonth, monthlyNurseFilter])

  useEffect(() => {
    for (const row of rows) {
      // eslint-disable-next-line no-console
      console.log("Session OT rate:", row.otRate)
    }
  }, [rows])

  useEffect(() => {
    const rate = Math.max(0, Number.parseFloat(otRateInput) || 0)
    // eslint-disable-next-line no-console
    console.log("Current OT rate:", rate)
  }, [otRateInput])

  function statusLabel(statusValue: OtLogRow["status"]) {
    if (statusValue === "on_duty") return "On duty"
    if (statusValue === "duty_completed") return "Duty completed"
    if (statusValue === "ot_active") return "OT active"
    return "OT completed"
  }

  function statusTone(statusValue: OtLogRow["status"]) {
    if (statusValue === "on_duty") return "border-sky-200 bg-sky-50 text-sky-700"
    if (statusValue === "duty_completed") return "border-emerald-200 bg-emerald-50 text-emerald-700"
    if (statusValue === "ot_active") return "border-amber-200 bg-amber-50 text-amber-700"
    return "border-violet-200 bg-violet-50 text-violet-700"
  }

  function saveSimulationRows(nextRows: OtLogRow[]) {
    if (typeof window === "undefined") return
    window.localStorage.setItem("wmc_ot_simulation_rows_v2", JSON.stringify(nextRows))
  }

  function readSimulationRows() {
    if (typeof window === "undefined") return []
    const raw = window.localStorage.getItem("wmc_ot_simulation_rows_v2")
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as OtLogRow[]) : []
    } catch {
      return []
    }
  }

  async function refreshLiveRows(silent = false) {
    if (telegramMode !== "live") return
    if (!silent) setIsRefreshing(true)
    try {
      const response = await fetch("/api/ot-records", { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        setStatus(`Unable to load OT logs from server${payload?.error ? `: ${payload.error}` : ""}`)
        return
      }
      setRows(payload.data as OtLogRow[])
      setEvents(Array.isArray(payload.events) ? (payload.events as OtEventRow[]) : [])
      setRecalculationAuditRows(
        Array.isArray(payload.recalculationAuditLogs) ? (payload.recalculationAuditLogs as OtRecalculationAuditRow[]) : [],
      )
      if (Array.isArray(payload.approvalAuditLogs)) {
        setApprovalAuditRows(payload.approvalAuditLogs as ApprovalAuditRow[])
      }
      const rateResponse = await fetch("/api/settings/ot-rate", { cache: "no-store" }).catch(() => null)
      if (rateResponse?.ok) {
        const ratePayload = await rateResponse.json().catch(() => null)
        if (ratePayload?.ok && ratePayload.rate !== undefined && ratePayload.rate !== null) {
          // eslint-disable-next-line no-console
          console.log("Loaded OT rate from backend:", ratePayload.rate)
          if (!isOtRateDirtyRef.current) {
            setOtRateInput(String(ratePayload.rate))
          }
        }
      } else if (payload.otRatePerHour !== undefined && payload.otRatePerHour !== null) {
        if (!isOtRateDirtyRef.current) {
          setOtRateInput(String(payload.otRatePerHour))
        }
      }
      const queueResponse = await fetch("http://localhost:3001/api/attendance/sync-queue", { cache: "no-store" }).catch(() => null)
      if (queueResponse?.ok) {
        const queuePayload = await queueResponse.json().catch(() => null)
        if (queuePayload?.ok) {
          setQueuePendingCount(Number(queuePayload.pendingCount || 0))
          setQueueFailedCount(Number(queuePayload.failedCount || 0))
        }
      }
      if (!silent) setStatus("Live OT records refreshed.")
    } catch {
      setStatus("Unable to load OT logs from server.")
    } finally {
      if (!silent) setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (telegramMode === "simulation") {
      const localRows = readSimulationRows()
      setRows(localRows)
      setEvents([])
      setStatus("Simulation mode active (localStorage).")
      return
    }
    void refreshLiveRows(true)
  }, [telegramMode])

  useEffect(() => {
    if (telegramMode !== "live") return
    const timer = window.setInterval(() => {
      void refreshLiveRows(true)
    }, 3_000)
    return () => window.clearInterval(timer)
  }, [telegramMode])

  function applySimulationUpdate(update: (current: OtLogRow[]) => OtLogRow[]) {
    setRows((current) => {
      const nextRows = update(current)
      saveSimulationRows(nextRows)
      return nextRows
    })
  }

  async function punchIn() {
    const normalizedName = nurseName.trim()
    if (!normalizedName) {
      setStatus("Please enter nurse name before punch in.")
      return
    }
    const existingOpen = rows.find((item) => item.nurseName.trim().toLowerCase() === normalizedName.toLowerCase() && (item.status === "on_duty" || item.status === "ot_active"))
    if (existingOpen) {
      setStatus("This nurse already has an active session.")
      return
    }
    if (telegramMode === "simulation") {
      const nowAt = new Date().toISOString()
      const currentRate = Math.max(0, Number.parseFloat(otRateInput) || 0)
      applySimulationUpdate((current) => [
        {
          id: `ot-sim-${Date.now()}`,
          nurseName: normalizedName,
          date: nowAt.slice(0, 10),
          dutyPunchInAt: nowAt,
          dutyPunchOutAt: null,
          otPunchInAt: null,
          otPunchOutAt: null,
          normalHours: 0,
          otHours: 0,
          otRate: currentRate,
          totalOtAllowance: 0,
          status: "on_duty",
        },
        ...current,
      ])
      setStatus("Normal duty punch in recorded (simulation).")
      return
    }
    const response = await fetch("/api/ot-records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "punch_in", nurseName: normalizedName, source: "manual" }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      setStatus(`Unable to punch in${payload?.error ? `: ${payload.error}` : ""}`)
      return
    }
    if (Array.isArray(payload.data)) {
      setRows(payload.data as OtLogRow[])
    }
    setStatus("Normal duty punch in recorded.")
  }

  async function punchOut() {
    const normalizedName = nurseName.trim()
    if (!normalizedName) {
      setStatus("Please enter nurse name before punch out.")
      return
    }
    const index = rows.findIndex((item) => item.status === "on_duty" && item.nurseName.trim().toLowerCase() === normalizedName.toLowerCase())
    if (index === -1) {
      setStatus("No active normal duty punch-in session found for this nurse.")
      return
    }

    if (telegramMode === "simulation") {
      const nowAt = new Date().toISOString()
      applySimulationUpdate((current) =>
        current.map((row, idx) => {
          if (idx !== index) return row
          const hours = Math.max(0, (new Date(nowAt).getTime() - new Date(row.dutyPunchInAt).getTime()) / (1000 * 60 * 60))
          return {
            ...row,
            dutyPunchOutAt: nowAt,
            normalHours: Number(Math.min(DEFAULT_SHIFT_HOURS, hours).toFixed(2)),
            status: "duty_completed",
          }
        }),
      )
      setStatus("Normal duty punch out recorded (simulation).")
      return
    }

    const response = await fetch("/api/ot-records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "punch_out", nurseName: normalizedName, source: "manual" }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      setStatus(`Unable to punch out${payload?.error ? `: ${payload.error}` : ""}`)
      return
    }
    if (Array.isArray(payload.data)) {
      setRows(payload.data as OtLogRow[])
      const updatedRow = (payload.data as OtLogRow[]).find((row) => row.id === rows[index]?.id)
      if (updatedRow) {
        setStatus(`Normal duty punch out recorded. Normal hours: ${updatedRow.normalHours.toFixed(2)}h`)
        return
      }
    }
    setStatus("Normal duty punch out recorded.")
  }

  async function otPunchIn() {
    const normalizedName = nurseName.trim()
    if (!normalizedName) {
      setStatus("Please enter nurse name before OT punch in.")
      return
    }
    const onDuty = rows.find((row) => row.nurseName.trim().toLowerCase() === normalizedName.toLowerCase() && row.status === "on_duty")
    if (onDuty) {
      setStatus("Please punch out first before starting OT.")
      return
    }
    const completedDuty = rows.find((row) => row.nurseName.trim().toLowerCase() === normalizedName.toLowerCase() && row.status === "duty_completed")
    if (!completedDuty) {
      setStatus("No completed normal duty session found.")
      return
    }
    if (telegramMode === "simulation") {
      const nowAt = new Date().toISOString()
      applySimulationUpdate((current) =>
        current.map((row) =>
          row.id !== completedDuty.id
            ? row
            : {
                ...row,
                otPunchInAt: nowAt,
                otPunchOutAt: null,
                status: "ot_active",
              },
        ),
      )
      setStatus("OT punch in recorded (simulation).")
      return
    }
    const response = await fetch("/api/ot-records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "ot_punch_in", nurseName: normalizedName, source: "manual" }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      setStatus(`Unable to OT punch in${payload?.error ? `: ${payload.error}` : ""}`)
      return
    }
    if (Array.isArray(payload.data)) setRows(payload.data as OtLogRow[])
    setStatus("OT punch in recorded.")
  }

  async function otPunchOut() {
    const normalizedName = nurseName.trim()
    if (!normalizedName) {
      setStatus("Please enter nurse name before OT punch out.")
      return
    }
    // Accept ot_active or on_duty — backend will handle the on_duty → ot_completed transition
    const activeOt = rows.find(
      (row) =>
        row.nurseName.trim().toLowerCase() === normalizedName.toLowerCase() &&
        (row.status === "ot_active" || row.status === "on_duty"),
    )
    if (!activeOt) {
      setStatus("No active OT session found.")
      return
    }
    if (telegramMode === "simulation") {
      const nowAt = new Date().toISOString()
      applySimulationUpdate((current) =>
        current.map((row) => {
          if (row.id !== activeOt.id) return row
          const fallbackRate = Math.max(0, Number.parseFloat(otRateInput) || 0)
          const effectiveRate = toNumber(row.otRate) > 0 ? toNumber(row.otRate) : fallbackRate
          // Use calculateOT: rounds hours first, then multiplies — same rule as Telegram
          const { otHoursRounded, allowanceRounded } = calculateOT(
            String(row.otPunchInAt || nowAt),
            nowAt,
            effectiveRate,
          )
          return {
            ...row,
            otPunchOutAt: nowAt,
            otHours: otHoursRounded,
            otRate: effectiveRate,
            totalOtAllowance: allowanceRounded,
            status: "ot_completed",
          }
        }),
      )
      setStatus("OT punch out recorded (simulation).")
      return
    }
    const response = await fetch("/api/ot-records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "ot_punch_out", nurseName: normalizedName, source: "manual" }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      setStatus(`Unable to OT punch out${payload?.error ? `: ${payload.error}` : ""}`)
      return
    }
    if (Array.isArray(payload.data)) setRows(payload.data as OtLogRow[])
    setStatus("OT punch out recorded.")
    await refreshLiveRows(false)
  }

  async function saveOtRate() {
    const nextRate = Math.max(0, Number.parseFloat(otRateInput) || 0)
    // eslint-disable-next-line no-console
    console.log("Saving OT rate:", nextRate)
    if (telegramMode === "simulation") {
      setOtRateInput(String(nextRate))
      setStatus("OT rate updated (simulation).")
      return
    }
    const response = await fetch("/api/settings/ot-rate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rate: nextRate }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok || payload.rate === undefined || payload.rate === null) {
      setStatus(`Unable to set OT rate${payload?.error ? `: ${payload.error}` : ""}`)
      return
    }
    const savedRate = Number(payload.rate)
    isOtRateDirtyRef.current = false
    setOtRateInput(String(savedRate))
    // eslint-disable-next-line no-console
    console.log("Updated OT Rate:", savedRate)
    setStatus(`OT rate updated to RM${savedRate}/hour`)
    await refreshLiveRows(true)
  }

  async function recalculateCurrentRecords() {
    const normalizedName = nurseName.trim()
    const scope = normalizedName ? "selected" : "today"
    const targetDate = new Date().toISOString().slice(0, 10)

    if (telegramMode === "simulation") {
      const rate = Math.max(0, Number.parseFloat(otRateInput) || 0)
      applySimulationUpdate((current) =>
        current.map((row) => {
          const shouldUpdate =
            scope === "selected"
              ? row.nurseName.trim().toLowerCase() === normalizedName.toLowerCase()
              : row.date === targetDate
          if (!shouldUpdate) return row
          // Round stored otHours first (it should already be 2 dp, belt-and-suspenders)
          const otHours = Math.round(toNumber(row.otHours) * 100) / 100
          return {
            ...row,
            otRate: Number(rate.toFixed(2)),
            totalOtAllowance: Math.round(otHours * rate * 100) / 100,
          }
        }),
      )
      setStatus(
        scope === "selected"
          ? `Recalculated OT records for ${normalizedName} using RM${rate}/hour (simulation).`
          : `Recalculated today's OT records using RM${rate}/hour (simulation).`,
      )
      return
    }

    setIsRecalculatingRecords(true)
    try {
      const response = await fetch("/api/ot-records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "recalculate_records",
          scope,
          nurseName: normalizedName || undefined,
          date: targetDate,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) {
        setStatus(`Unable to recalculate OT records${payload?.error ? `: ${payload.error}` : ""}`)
        return
      }

      if (payload.data?.otLogs && Array.isArray(payload.data.otLogs)) {
        setRows(payload.data.otLogs as OtLogRow[])
      }
      if (Array.isArray(payload.data?.auditLogs)) {
        setRecalculationAuditRows((current) =>
          [...(payload.data.auditLogs as OtRecalculationAuditRow[]), ...current].slice(0, 20),
        )
      }
      const updatedCount = Number(payload.data?.updatedCount || 0)
      const appliedRate = toNumber(payload.data?.appliedRate)
      setStatus(
        scope === "selected"
          ? `Recalculated ${updatedCount} record(s) for ${normalizedName} at RM${formatMoney(appliedRate)}/hour.`
          : `Recalculated ${updatedCount} record(s) for today at RM${formatMoney(appliedRate)}/hour.`,
      )
      await refreshLiveRows(true)
    } catch {
      setStatus("Unable to recalculate OT records.")
    } finally {
      setIsRecalculatingRecords(false)
    }
  }

  async function sendOtSummaryToTelegram() {
    const completedRows = rows.filter((row) => row.status === "ot_completed")
    const topRows = completedRows.slice(0, 10)
    const lines = [
      "WMC Nursing OT Summary",
      `Generated: ${new Date().toLocaleString()}`,
      `Total OT hours: ${formatMoney(totalOvertimeHours)}`,
      `Total OT allowance: ${formatMoney(totalAllowance)}`,
      `Completed sessions: ${rows.filter((row) => row.status === "ot_completed").length}`,
      "",
      "Recent sessions:",
      ...(topRows.length
        ? topRows.map(
            (row) =>
              `- ${row.nurseName} | ${row.date} | Normal ${formatMoney(row.normalHours)}h | OT ${formatMoney(row.otHours)}h | Rate ${formatMoney(
                toNumber(row.otRate) > 0 ? row.otRate : otRateInput,
              )} | Allowance ${formatMoney(row.totalOtAllowance)}`,
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

  async function retryCloudSyncQueue() {
    setIsRetryingQueue(true)
    try {
      const response = await fetch("http://localhost:3001/api/attendance/sync-queue/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) {
        setStatus(`Unable to retry cloud sync${payload?.error ? `: ${payload.error}` : ""}`)
        return
      }
      setQueuePendingCount(Number(payload.pendingCount || 0))
      setQueueFailedCount(Number(payload.failedCount || 0))
      setStatus("Cloud sync retry triggered.")
      await refreshLiveRows(true)
    } catch {
      setStatus("Unable to retry cloud sync queue.")
    } finally {
      setIsRetryingQueue(false)
    }
  }

  /** Called by the modal Submit button (or directly for pending-reset). */
  async function submitApproval(
    recordId: string,
    approvalStatus: OtApprovalStatus,
    approvedBy: string,
    approvalNote: string,
    rejectionReason: string,
  ) {
    // eslint-disable-next-line no-console
    console.log("CONFIRM APPROVE CLICKED", { recordId, approvalStatus, approvedBy })

    if (telegramMode === "simulation") {
      const nowSim = new Date().toISOString()
      setRows((current) =>
        current.map((r) =>
          r.id !== recordId ? r : {
            ...r,
            approvalStatus,
            approvedBy: approvedBy || null,
            approvalNote: approvalNote || null,
            approvedAt: approvalStatus === "approved" ? nowSim : null,
            rejectedAt: approvalStatus === "rejected" ? nowSim : null,
            rejectionReason: rejectionReason || null,
          },
        ),
      )
      // eslint-disable-next-line no-console
      console.log("approve result (simulation): local state updated for", recordId)
      return
    }

    const approvePayload = {
      action: "set_approval_status",
      recordId,
      approvalStatus,
      approvedBy:      approvedBy      || undefined,
      approvalNote:    approvalNote    || undefined,
      rejectionReason: rejectionReason || undefined,
    }
    // eslint-disable-next-line no-console
    console.log("approve payload", approvePayload)

    try {
      const resp = await fetch("/api/ot-records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(approvePayload),
      })
      const result = await resp.json().catch(() => null)
      // eslint-disable-next-line no-console
      console.log("approve result", result, "status:", resp.status)

      if (!resp.ok || !result?.ok) {
        const errMsg = `Failed to update approval: ${result?.error || "unknown error"}`
        // eslint-disable-next-line no-console
        console.error("approve API error:", errMsg)
        setStatus(errMsg)
        return
      }
      // eslint-disable-next-line no-console
      console.log("Approval saved locally — starting cloud sync check...")
      if (Array.isArray(result.data)) {
        setRows(result.data as OtLogRow[])
        const updated = (result.data as OtLogRow[]).find((r) => r.id === recordId)
        if (updated) {
          // eslint-disable-next-line no-console
          console.log("Cloud sync result:", updated.syncStatus, "| syncError:", updated.syncError)
          if (updated.syncStatus === "synced") {
            setStatus(`Approval ${approvalStatus}. Cloud sync: synced.`)
          } else {
            setStatus(`Approval ${approvalStatus}. Cloud sync: ${updated.syncStatus ?? "pending"}.`)
          }
        }
      }
      await refreshLiveRows(false)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("approve fetch error:", err)
      // eslint-disable-next-line no-console
      console.error("Cloud sync error:", err)
      setStatus("Unable to update approval status.")
    }
  }

  async function handleRetryApprovalSync(recordId: string) {
    setRetryingSyncId(recordId)
    // eslint-disable-next-line no-console
    console.log("Starting cloud sync for approval — recordId:", recordId)
    try {
      const resp = await fetch("/api/ot-records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_sync_status", recordId, syncStatus: "synced" }),
      })
      const result = await resp.json().catch(() => null)
      // eslint-disable-next-line no-console
      console.log("Cloud sync result:", result)
      if (!resp.ok || !result?.ok) {
        setStatus(`Retry cloud sync failed: ${result?.error ?? "unknown error"}`)
        return
      }
      setStatus("Cloud sync: synced.")
      await refreshLiveRows(false)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Cloud sync error:", err)
      setStatus("Retry cloud sync failed.")
    } finally {
      setRetryingSyncId(null)
    }
  }

  function openApprovalModal(record: OtLogRow, intent: "approved" | "rejected") {
    // eslint-disable-next-line no-console
    console.log("selectedRecord", record)
    setApprovalModal({ record, intent })
    setModalSupervisor("")
    setModalNote("")
    setModalRejectionReason("")
  }

  async function handleModalSubmit() {
    // eslint-disable-next-line no-console
    console.log("CONFIRM APPROVE CLICKED (handleModalSubmit)", { approvalModal, modalSupervisor })
    if (!approvalModal) {
      // eslint-disable-next-line no-console
      console.warn("handleModalSubmit: approvalModal is null, aborting")
      return
    }
    if (!modalSupervisor.trim()) {
      setStatus("⚠️ Supervisor name is required before confirming.")
      return
    }
    setIsSubmittingApproval(true)
    try {
      await submitApproval(
        approvalModal.record.id,
        approvalModal.intent,
        modalSupervisor.trim(),
        modalNote.trim(),
        modalRejectionReason.trim(),
      )
      setStatus(
        approvalModal.intent === "approved"
          ? `✅ OT approved for ${approvalModal.record.nurseName}.`
          : `❌ OT rejected for ${approvalModal.record.nurseName}.`,
      )
      setApprovalModal(null)
    } finally {
      setIsSubmittingApproval(false)
    }
  }

  function exportMonthlyCSV(approvedOnly = false) {
    const source = approvedOnly
      ? monthlySummaryRows.filter((r) => r.approvedAmount > 0)
      : monthlySummaryRows
    const headers = [
      "Month", "Nurse Name", "Total Sessions", "Total OT Hours",
      "OT Rate (RM/hr)", "Total OT Allowance", "Approved", "Pending", "Rejected", "Final Payable",
    ]
    const csvRows = [
      headers.join(","),
      ...source.map((r) =>
        [
          r.month, `"${r.nurseName}"`, r.totalSessions, r.totalOtHours,
          r.otRate, r.totalOtAllowance, r.approvedAmount, r.pendingAmount, r.rejectedAmount, r.finalPayable,
        ].join(","),
      ),
    ]
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = approvedOnly
      ? `OT_Payroll_Approved_${monthlyMonth}.csv`
      : `OT_Monthly_Report_${monthlyMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
    {/* ── Approval modal ──────────────────────────────────────────────────── */}
    {approvalModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className={`rounded-t-2xl px-5 py-4 ${approvalModal.intent === "approved" ? "bg-emerald-50" : "bg-rose-50"}`}>
            <p className="text-base font-semibold text-slate-900">
              {approvalModal.intent === "approved" ? "✅ Approve OT" : "❌ Reject OT"}
            </p>
            <p className="text-sm text-slate-500">
              {approvalModal.record.nurseName} · {approvalModal.record.date} ·{" "}
              RM{formatMoney(approvalModal.record.totalOtAllowance)}
            </p>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Supervisor Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={modalSupervisor}
                onChange={(e) => setModalSupervisor(e.target.value)}
                placeholder="e.g. Sister Lim"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
            {approvalModal.intent === "approved" ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Approval Note (optional)</label>
                <input
                  type="text"
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  placeholder="e.g. Approved for May payroll"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Rejection Reason (optional)</label>
                <input
                  type="text"
                  value={modalRejectionReason}
                  onChange={(e) => setModalRejectionReason(e.target.value)}
                  placeholder="e.g. Late OT request"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <button
              onClick={() => setApprovalModal(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleModalSubmit}
              disabled={isSubmittingApproval}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                approvalModal.intent === "approved"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              {isSubmittingApproval
                ? "Saving…"
                : approvalModal.intent === "approved"
                  ? "Confirm Approve"
                  : "Confirm Reject"}
            </button>
          </div>
        </div>
      </div>
    )}
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

      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total OT allowance</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatMoney(totalAllowance)}</p>
          <p className="mt-1 text-sm text-slate-500">Across all OT completed sessions</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total OT hours</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatMoney(totalOvertimeHours)}</p>
          <p className="mt-1 text-sm text-slate-500">Across all recorded sessions</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active sessions</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{dutyActiveCount + otActiveCount}</p>
          <p className="mt-1 text-sm text-slate-500">On duty: {dutyActiveCount} | OT active: {otActiveCount}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Standard shift</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{DEFAULT_SHIFT_HOURS}h</p>
          <p className="mt-1 text-sm text-slate-500">OT = worked hours - shift hours</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pending cloud sync</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{queuePendingCount}</p>
          <p className="mt-1 text-sm text-slate-500">Waiting for retry queue</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Failed cloud sync</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{queueFailedCount}</p>
          <p className="mt-1 text-sm text-slate-500">Needs manual retry</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
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
            Punch In
          </button>
          <button
            type="button"
            onClick={() => {
              void retryCloudSyncQueue()
            }}
            disabled={telegramMode !== "live" || isRetryingQueue}
            className="ml-2 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50"
          >
            {isRetryingQueue ? "Retrying cloud sync..." : "Retry cloud sync"}
          </button>
          <button
            type="button"
            onClick={punchOut}
            className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <LogOut className="h-4 w-4" />
            Punch Out
          </button>
          <button
            type="button"
            onClick={otPunchIn}
            className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <LogIn className="h-4 w-4" />
            OT In
          </button>
          <button
            type="button"
            onClick={otPunchOut}
            className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white"
          >
            <LogOut className="h-4 w-4" />
            OT Out
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
        <div className="mt-3 grid gap-3 md:grid-cols-[220px_auto]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">OT rate per hour</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={otRateInput}
                placeholder="e.g. 17, 20, 17.5"
                onChange={(event) => {
                  const value = event.target.value
                  // eslint-disable-next-line no-console
                  console.log("OT rate input:", value)
                  isOtRateDirtyRef.current = true
                  setOtRateInput(value)
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={saveOtRate}
                className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Update
              </button>
              <button
                type="button"
                onClick={() => {
                  void recalculateCurrentRecords()
                }}
                disabled={isRecalculatingRecords}
                className="inline-flex rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50"
              >
                {isRecalculatingRecords ? "Recalculating..." : "Recalculate Current Records"}
              </button>
            </div>
          </div>
          <div className="self-end text-xs text-slate-600">
            OT rule: Please punch out first before starting OT.
          </div>
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
          <button
            type="button"
            onClick={() => {
              void refreshLiveRows(false)
            }}
            disabled={telegramMode !== "live" || isRefreshing}
            className="ml-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
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
            {activeSession
              ? `${activeSession.nurseName} • ${statusLabel(activeSession.status)}`
              : "No session for selected nurse"}
          </span>
          <span>{status || "Ready for OT punch actions."}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            {lastTelegramEvent
              ? `Last Telegram event: /${lastTelegramEvent.commandType} ${lastTelegramEvent.nurseName} @ ${formatDateTime(
                  lastTelegramEvent.timestamp,
                )}`
              : "Last Telegram event: none"}
          </span>
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          Telegram command examples: <code>/punchin Nurse Lee</code>, <code>/punchout Nurse Lee</code>,{" "}
          <code>/otin Nurse Lee</code>, <code>/otout Nurse Lee</code>
        </div>
      </section>

      <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Nurse</th>
              <th className="px-4 py-3">Duty punch in</th>
              <th className="px-4 py-3">Duty punch out</th>
              <th className="px-4 py-3">OT punch in</th>
              <th className="px-4 py-3">OT punch out</th>
              <th className="px-4 py-3">Normal hours</th>
              <th className="px-4 py-3">OT hours</th>
              <th className="px-4 py-3">OT rate</th>
              <th className="px-4 py-3">Total OT allowance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Approval</th>
              <th className="px-4 py-3">Cloud sync</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-none">
                <td className="px-4 py-3 font-medium text-slate-900">{row.nurseName}</td>
                <td className="px-4 py-3 text-slate-700">{formatDateTime(row.dutyPunchInAt)}</td>
                <td className="px-4 py-3 text-slate-700">{row.dutyPunchOutAt ? formatDateTime(row.dutyPunchOutAt) : "-"}</td>
                <td className="px-4 py-3 text-slate-700">{row.otPunchInAt ? formatDateTime(row.otPunchInAt) : "-"}</td>
                <td className="px-4 py-3 text-slate-700">{row.otPunchOutAt ? formatDateTime(row.otPunchOutAt) : "-"}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(row.normalHours)}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(row.otHours)}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(toNumber(row.otRate) > 0 ? row.otRate : otRateInput)}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(row.totalOtAllowance)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(row.status)}`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {row.status === "ot_completed" ? (
                    <div className="space-y-1">
                      {/* Active status badge */}
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        (row.approvalStatus || "pending") === "approved"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : (row.approvalStatus || "pending") === "rejected"
                            ? "border-rose-300 bg-rose-50 text-rose-700"
                            : "border-amber-300 bg-amber-50 text-amber-700"
                      }`}>
                        {(row.approvalStatus || "pending") === "approved" ? "✅ Approved" : (row.approvalStatus || "pending") === "rejected" ? "❌ Rejected" : "🕐 Pending"}
                      </span>
                      {/* Action buttons */}
                      <div className="flex gap-1">
                        {(row.approvalStatus || "pending") !== "approved" && (
                          <button
                            onClick={() => openApprovalModal(row, "approved")}
                            className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Approve
                          </button>
                        )}
                        {(row.approvalStatus || "pending") !== "rejected" && (
                          <button
                            onClick={() => openApprovalModal(row, "rejected")}
                            className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Reject
                          </button>
                        )}
                        {(row.approvalStatus || "pending") !== "pending" && (
                          <button
                            onClick={() => submitApproval(row.id, "pending", "", "", "")}
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      {/* Approval meta */}
                      {row.approvedBy && (
                        <p className="text-[10px] text-slate-400">
                          By: {row.approvedBy}
                          {row.approvedAt ? ` · ${new Date(row.approvedAt).toLocaleString()}` : ""}
                        </p>
                      )}
                      {row.rejectionReason && (
                        <p className="text-[10px] text-rose-400">Reason: {row.rejectionReason}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    {row.syncStatus === "synced" ? (
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        Synced
                      </span>
                    ) : row.syncStatus === "failed_sync" ? (
                      <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                        Failed sync
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                        Pending sync
                      </span>
                    )}
                    {row.syncStatus !== "synced" && row.approvalStatus && row.approvalStatus !== "pending" && (
                      <button
                        type="button"
                        onClick={() => void handleRetryApprovalSync(row.id)}
                        disabled={retryingSyncId === row.id}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {retryingSyncId === row.id ? "Syncing..." : "Retry sync"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={12}>
                  No OT records yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Last recalculation (audit)</p>
          <p className="text-xs text-slate-500">Rate and allowance changes from recent recalculate actions</p>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Updated at</th>
              <th className="px-4 py-3">Nurse</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Old rate</th>
              <th className="px-4 py-3">New rate</th>
              <th className="px-4 py-3">Old allowance</th>
              <th className="px-4 py-3">New allowance</th>
            </tr>
          </thead>
          <tbody>
            {recalculationAuditRows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-none">
                <td className="px-4 py-3 text-slate-700">{formatDateTime(row.updated_at)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{row.nurseName}</td>
                <td className="px-4 py-3 text-slate-700">{row.date || "-"}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(row.old_rate)}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(row.new_rate)}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(row.old_allowance)}</td>
                <td className="px-4 py-3 text-slate-700">{formatMoney(row.new_allowance)}</td>
              </tr>
            ))}
            {recalculationAuditRows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={7}>
                  No recalculation audit logs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {/* ── Monthly OT Summary ─────────────────────────────────────────────── */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Monthly OT Summary</p>
            <p className="text-xs text-slate-500">Grouped by nurse · only OT completed records · Telegram: /monthly_ot YYYY-MM</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportMonthlyCSV(false)}
              disabled={monthlySummaryRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export All CSV
            </button>
            <button
              onClick={() => exportMonthlyCSV(true)}
              disabled={monthlySummaryRows.every((r) => r.approvedAmount === 0)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              💰 Payroll Export (Approved Only)
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Month</label>
            <input
              type="month"
              value={monthlyMonth}
              onChange={(e) => setMonthlyMonth(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Nurse (optional)</label>
            <input
              type="text"
              value={monthlyNurseFilter}
              onChange={(e) => setMonthlyNurseFilter(e.target.value)}
              placeholder="Filter by nurse name"
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
        </div>

        {/* Summary totals row */}
        {monthlySummaryRows.length > 0 && (() => {
          const totals = monthlySummaryRows.reduce(
            (acc, r) => ({
              totalSessions:    acc.totalSessions    + r.totalSessions,
              totalOtHours:     Math.round((acc.totalOtHours     + r.totalOtHours)     * 100) / 100,
              totalOtAllowance: Math.round((acc.totalOtAllowance + r.totalOtAllowance) * 100) / 100,
              approvedAmount:   Math.round((acc.approvedAmount   + r.approvedAmount)   * 100) / 100,
              pendingAmount:    Math.round((acc.pendingAmount    + r.pendingAmount)    * 100) / 100,
              rejectedAmount:   Math.round((acc.rejectedAmount   + r.rejectedAmount)   * 100) / 100,
              finalPayable:     Math.round((acc.finalPayable     + r.finalPayable)     * 100) / 100,
            }),
            { totalSessions: 0, totalOtHours: 0, totalOtAllowance: 0, approvedAmount: 0, pendingAmount: 0, rejectedAmount: 0, finalPayable: 0 },
          )
          return (
            <div className="flex flex-wrap gap-4 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
              <div className="text-xs text-slate-600"><span className="font-semibold">{monthlySummaryRows.length}</span> nurses · <span className="font-semibold">{totals.totalSessions}</span> sessions</div>
              <div className="text-xs text-slate-600">Total hours: <span className="font-semibold">{totals.totalOtHours}h</span></div>
              <div className="text-xs text-slate-600">Total allowance: <span className="font-semibold">RM{formatMoney(totals.totalOtAllowance)}</span></div>
              <div className="text-xs text-emerald-700">Approved: <span className="font-semibold">RM{formatMoney(totals.approvedAmount)}</span></div>
              <div className="text-xs text-amber-700">Pending: <span className="font-semibold">RM{formatMoney(totals.pendingAmount)}</span></div>
              <div className="text-xs text-rose-700">Rejected: <span className="font-semibold">RM{formatMoney(totals.rejectedAmount)}</span></div>
              <div className="text-xs font-bold text-slate-900">Final Payable: RM{formatMoney(totals.finalPayable)}</div>
            </div>
          )
        })()}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Nurse Name</th>
                <th className="px-4 py-3">Sessions</th>
                <th className="px-4 py-3">Total OT Hours</th>
                <th className="px-4 py-3">OT Rate</th>
                <th className="px-4 py-3">Total OT Allowance</th>
                <th className="px-4 py-3 text-emerald-700">Approved</th>
                <th className="px-4 py-3 text-amber-700">Pending</th>
                <th className="px-4 py-3 text-rose-700">Rejected</th>
                <th className="px-4 py-3 font-bold text-slate-700">Final Payable</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummaryRows.map((row) => (
                <tr key={row.nurseName} className="border-b border-slate-100 last:border-none hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{row.month}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.nurseName}</td>
                  <td className="px-4 py-3 text-slate-700">{row.totalSessions}</td>
                  <td className="px-4 py-3 text-slate-700">{formatMoney(row.totalOtHours)} h</td>
                  <td className="px-4 py-3 text-slate-700">RM{formatMoney(row.otRate)}</td>
                  <td className="px-4 py-3 text-slate-700">RM{formatMoney(row.totalOtAllowance)}</td>
                  <td className="px-4 py-3 font-medium text-emerald-700">RM{formatMoney(row.approvedAmount)}</td>
                  <td className="px-4 py-3 text-amber-700">RM{formatMoney(row.pendingAmount)}</td>
                  <td className="px-4 py-3 text-rose-700">RM{formatMoney(row.rejectedAmount)}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">RM{formatMoney(row.finalPayable)}</td>
                </tr>
              ))}
              {monthlySummaryRows.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={10}>
                    No completed OT records for {monthlyMonth}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Approval Audit Log ──────────────────────────────────────────────── */}
      {approvalAuditRows.length > 0 && (
        <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Approval Audit Log</p>
            <p className="text-xs text-slate-500">Who approved or rejected, and when</p>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Nurse</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Note / Reason</th>
              </tr>
            </thead>
            <tbody>
              {approvalAuditRows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-none">
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(r.timestamp)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{r.nurseName}</td>
                  <td className="px-4 py-3 text-slate-700">{r.date}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      r.action === "approved"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : r.action === "rejected"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}>
                      {r.action === "approved" ? "✅ Approved" : r.action === "rejected" ? "❌ Rejected" : "🕐 Reset to Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.approvedBy || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{r.approvalNote || r.rejectionReason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
    </>
  )
}
