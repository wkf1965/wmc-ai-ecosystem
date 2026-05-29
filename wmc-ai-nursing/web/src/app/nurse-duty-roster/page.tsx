"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { CalendarClock, Clock3, Pill, RefreshCw, Users } from "lucide-react"

type DutyRow = {
  id: string
  shift: string
  timeWindow: string
  ward: string
  leadNurse: string
  nurseNames: string
  onDuty: number
  handoverAt: string
}

type WeeklyRosterRow = {
  day: string
  morning: string
  evening: string
  night: string
}

type DutyRosterSettings = {
  dutyRows: DutyRow[]
  nurseLeaveList: string
  weeklyRoster: WeeklyRosterRow[]
  updatedAt?: string
}

type AttendanceRow = {
  id: string
  nurseName: string
  date: string
  dutyPunchInAt: string
  dutyPunchOutAt: string | null
  otPunchInAt: string | null
  otPunchOutAt: string | null
  status: "on_duty" | "duty_completed" | "ot_active" | "ot_completed"
  source?: "telegram" | "manual"
  syncStatus?: "synced" | "pending_sync" | "failed_sync"
}

type DutyRosterSheetRow = {
  date: string
  shift: string
  staffName: string
  expectedStart: string
  expectedEnd: string
  punchIn: string
  punchOut: string
  status: "Present" | "Absent" | "Late" | "Not Yet Punch In"
  lateMinutes: number
  remarks: string
}

const dutyRowsSeed: DutyRow[] = [
  {
    id: "shift-morning-a",
    shift: "Morning",
    timeWindow: "06:00 - 14:00",
    ward: "A-Floor",
    leadNurse: "Nurse Lee",
    nurseNames: "Nurse Lee, Nurse Tan, Nurse Kumar",
    onDuty: 14,
    handoverAt: "13:45",
  },
  {
    id: "shift-evening-b",
    shift: "Evening",
    timeWindow: "14:00 - 22:00",
    ward: "B-Floor",
    leadNurse: "Nurse Chan",
    nurseNames: "Nurse Chan, Nurse Wong, Nurse Lim",
    onDuty: 12,
    handoverAt: "21:45",
  },
  {
    id: "shift-night-c",
    shift: "Night",
    timeWindow: "22:00 - 06:00",
    ward: "Rehab Unit",
    leadNurse: "Nurse Patel",
    nurseNames: "Nurse Patel, Nurse Ong, Nurse Das",
    onDuty: 9,
    handoverAt: "05:45",
  },
]

const nurseLeaveSeed = "Nurse Alicia Tan, Nurse Marcus Lim"

const weeklyRosterSeed: WeeklyRosterRow[] = [
  { day: "Monday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
  { day: "Tuesday", morning: "Nurse Lee, Nurse Kumar", evening: "Nurse Chan, Nurse Lim", night: "Nurse Patel, Nurse Das" },
  { day: "Wednesday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
  { day: "Thursday", morning: "Nurse Lee, Nurse Kumar", evening: "Nurse Chan, Nurse Lim", night: "Nurse Patel, Nurse Das" },
  { day: "Friday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
  { day: "Saturday", morning: "Nurse Lee, Nurse Kumar", evening: "Nurse Chan, Nurse Lim", night: "Nurse Patel, Nurse Das" },
  { day: "Sunday", morning: "Nurse Lee, Nurse Tan", evening: "Nurse Chan, Nurse Wong", night: "Nurse Patel, Nurse Ong" },
]

export default function NurseDutyRosterPage() {
  const [dutyRows, setDutyRows] = useState<DutyRow[]>(dutyRowsSeed)
  const [nurseLeaveList, setNurseLeaveList] = useState(nurseLeaveSeed)
  const [weeklyRoster, setWeeklyRoster] = useState<WeeklyRosterRow[]>(weeklyRosterSeed)
  const [status, setStatus] = useState("")
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([])
  const [isRefreshingAttendance, setIsRefreshingAttendance] = useState(false)
  const [isRunningAbsentCheck, setIsRunningAbsentCheck] = useState(false)
  const [isRefreshingRoster, setIsRefreshingRoster] = useState(false)
  const [isSavingAll, setIsSavingAll] = useState(false)
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const [backendSyncAvailable, setBackendSyncAvailable] = useState(true)
  const [sheetDutyRows, setSheetDutyRows] = useState<DutyRosterSheetRow[]>([])
  const [attendanceDateFilter, setAttendanceDateFilter] = useState("")
  const [attendanceShiftFilter, setAttendanceShiftFilter] = useState<"all" | "Morning" | "Evening" | "Night">("all")
  const [lastSavedAt, setLastSavedAt] = useState("")

  useEffect(() => {
    async function refreshDutyRoster(silent = false) {
      if (!silent) setIsRefreshingRoster(true)
      try {
        const response = await fetch("/api/duty-roster", { cache: "no-store" })
        const payload = await response.json().catch(() => null)
        if (!payload?.ok || !payload?.data) return
        const rosterData = payload.data as DutyRosterSettings
        // eslint-disable-next-line no-console
        console.log("Loaded duty roster:", rosterData)
        if (Array.isArray(rosterData.dutyRows)) setDutyRows(rosterData.dutyRows)
        if (typeof rosterData.nurseLeaveList === "string") setNurseLeaveList(rosterData.nurseLeaveList)
        if (Array.isArray(rosterData.weeklyRoster)) setWeeklyRoster(rosterData.weeklyRoster)
        setLastSavedAt(String(rosterData.updatedAt || ""))
        setBackendSyncAvailable(true)
        if (!silent) setStatus("Roster refreshed from server.")
      } catch {
        setBackendSyncAvailable(false)
        if (!silent) setStatus("Unable to refresh duty roster from server.")
      } finally {
        if (!silent) setIsRefreshingRoster(false)
      }
    }
    void refreshDutyRoster(true)
  }, [])

  async function refreshAttendanceRecords(silent = false) {
    if (!silent) setIsRefreshingAttendance(true)
    try {
      const response = await fetch("/api/ot-records", { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        setStatus(`Unable to load attendance records${payload?.error ? `: ${payload.error}` : ""}.`)
        return
      }
      setAttendanceRows(payload.data as AttendanceRow[])
      const dutySheetResponse = await fetch("http://localhost:3001/api/attendance/duty-roster", { cache: "no-store" }).catch(() => null)
      if (dutySheetResponse?.ok) {
        const dutyPayload = await dutySheetResponse.json().catch(() => null)
        if (dutyPayload?.ok && Array.isArray(dutyPayload.rows)) {
          setSheetDutyRows(dutyPayload.rows as DutyRosterSheetRow[])
        }
      }
      if (!silent) setStatus("Actual attendance records refreshed.")
    } catch {
      setStatus("Unable to load attendance records.")
    } finally {
      if (!silent) setIsRefreshingAttendance(false)
    }
  }

  useEffect(() => {
    void refreshAttendanceRecords(true)
    const timer = window.setInterval(() => {
      void refreshAttendanceRecords(true)
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [])

  async function runAbsentCheckNow() {
    setIsRunningAbsentCheck(true)
    try {
      const response = await fetch("http://localhost:3001/api/attendance/duty-roster/run-absent-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) {
        setStatus(`Unable to run absent check now${payload?.error ? `: ${payload.error}` : ""}.`)
        return
      }
      await refreshAttendanceRecords(true)
      setStatus("Absent check completed and attendance refreshed.")
    } catch {
      setStatus("Unable to run absent check now.")
    } finally {
      setIsRunningAbsentCheck(false)
    }
  }

  const totalOnDuty = useMemo(() => dutyRows.reduce((sum, row) => sum + row.onDuty, 0), [dutyRows])
  const filteredSheetDutyRows = useMemo(() => {
    return sheetDutyRows.filter((row) => {
      if (attendanceDateFilter && row.date !== attendanceDateFilter) return false
      if (attendanceShiftFilter !== "all" && row.shift !== attendanceShiftFilter) return false
      return true
    })
  }, [sheetDutyRows, attendanceDateFilter, attendanceShiftFilter])

  const attendanceSummary = useMemo(() => {
    const counts = { Present: 0, Absent: 0, Late: 0, NotYet: 0 }
    for (const row of filteredSheetDutyRows) {
      if (row.status === "Present") counts.Present += 1
      else if (row.status === "Absent") counts.Absent += 1
      else if (row.status === "Late") counts.Late += 1
      else if (row.status === "Not Yet Punch In") counts.NotYet += 1
    }
    return counts
  }, [filteredSheetDutyRows])

  function statusLabel(statusValue: AttendanceRow["status"]) {
    if (statusValue === "on_duty") return "On duty"
    if (statusValue === "duty_completed") return "Duty completed"
    if (statusValue === "ot_active") return "OT active"
    return "OT completed"
  }

  function statusTone(statusValue: AttendanceRow["status"]) {
    if (statusValue === "on_duty") return "border-sky-200 bg-sky-50 text-sky-700"
    if (statusValue === "duty_completed") return "border-emerald-200 bg-emerald-50 text-emerald-700"
    if (statusValue === "ot_active") return "border-amber-200 bg-amber-50 text-amber-700"
    return "border-violet-200 bg-violet-50 text-violet-700"
  }

  function formatDateTime(value: string | null) {
    if (!value) return "-"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString()
  }

  function shiftFromPunchIn(punchIn: string) {
    const parsed = new Date(punchIn)
    if (Number.isNaN(parsed.getTime())) return "-"
    const hour = parsed.getHours()
    if (hour >= 6 && hour < 14) return "Morning"
    if (hour >= 14 && hour < 22) return "Evening"
    return "Night"
  }

  function updateOnDuty(rowId: string, nextValue: string) {
    const parsed = Math.max(0, Number.parseInt(nextValue || "0", 10) || 0)
    const nextRows = dutyRows.map((row) => (row.id === rowId ? { ...row, onDuty: parsed } : row))
    setDutyRows(nextRows)
    setStatus("Draft updated. Save row or Save all.")
  }

  function updateDutyField(rowId: string, patch: Partial<DutyRow>) {
    const nextRows = dutyRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    setDutyRows(nextRows)
    setStatus("Draft updated. Save row or Save all.")
  }

  async function saveDutyRow(row: DutyRow) {
    setSavingRowId(row.id)
    try {
      const rowPayload = {
        rowId: row.id,
        shift: row.shift,
        timeWindow: row.timeWindow,
        ward: row.ward,
        leadNurse: row.leadNurse,
        nurseNames: row.nurseNames,
        onDuty: row.onDuty,
        handoverAt: row.handoverAt,
      }
      // eslint-disable-next-line no-console
      console.log("Saving duty roster:", rowPayload)
      const response = await fetch("/api/duty-roster/save-row", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rowPayload),
      })
      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.ok) {
        if (payload?.data?.updatedAt) setLastSavedAt(String(payload.data.updatedAt))
        setStatus("Duty roster saved successfully")
        setBackendSyncAvailable(true)
        return true
      }
      setStatus(`Unable to save duty roster${payload?.error ? `: ${payload.error}` : ""}.`)
      setBackendSyncAvailable(false)
      return false
    } catch {
      setStatus("Unable to save duty roster.")
      setBackendSyncAvailable(false)
      return false
    } finally {
      setSavingRowId(null)
    }
  }

  async function saveAllDutyRows() {
    setIsSavingAll(true)
    try {
      const allPayload = {
        nurseLeaveList,
        weeklyRoster,
      }
      // eslint-disable-next-line no-console
      console.log("Saving duty roster:", allPayload)
      const response = await fetch("/api/duty-roster/save-row", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(allPayload),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) {
        setStatus(`Unable to save duty roster${payload?.error ? `: ${payload.error}` : ""}.`)
        setBackendSyncAvailable(false)
        return
      }
      let allRowsSaved = true
      for (const row of dutyRows) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await saveDutyRow(row)
        if (!ok) allRowsSaved = false
      }
      if (allRowsSaved) {
        setStatus("Duty roster saved successfully")
        setBackendSyncAvailable(true)
        if (payload?.data?.updatedAt) setLastSavedAt(String(payload.data.updatedAt))
      } else {
        setStatus("Unable to save duty roster.")
        setBackendSyncAvailable(false)
      }
    } finally {
      setIsSavingAll(false)
    }
  }

  function updateNurseNames(rowId: string, nextValue: string) {
    updateDutyField(rowId, { nurseNames: nextValue })
  }

  function updateNurseLeaveList(nextValue: string) {
    setNurseLeaveList(nextValue)
    setStatus("Draft updated. Save row or Save all.")
  }

  function updateWeeklyRoster(day: string, shift: "morning" | "evening" | "night", nextValue: string) {
    const nextRows = weeklyRoster.map((row) => (row.day === day ? { ...row, [shift]: nextValue } : row))
    setWeeklyRoster(nextRows)
    setStatus("Draft updated. Save row or Save all.")
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Nursing operations</p>
          <h1 className="text-2xl font-semibold text-slate-900">Nurse Duty Roster Module</h1>
          <p className="text-sm text-slate-500">Roster planning connected with OT, shift handover, and medication operations</p>
        </div>
        <Link href="/dashboard" className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          Back to dashboard
        </Link>
      </div>

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active shifts</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{dutyRows.length}</p>
          <p className="mt-1 text-sm text-slate-500">Morning, evening, and night coverage</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total nurses on duty</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{totalOnDuty}</p>
          <p className="mt-1 text-sm text-slate-500">Current roster capacity</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Next handover</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{dutyRows[0]?.handoverAt || "-"}</p>
          <p className="mt-1 text-sm text-slate-500">Planned handover checkpoint</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Present staff</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{attendanceSummary.Present}</p>
          <p className="mt-1 text-sm text-slate-500">Live duty roster attendance</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Absent staff</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{attendanceSummary.Absent}</p>
          <p className="mt-1 text-sm text-slate-500">Auto absent checker</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Late staff</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{attendanceSummary.Late}</p>
          <p className="mt-1 text-sm text-slate-500">Punch in after expected start</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Not yet punch in</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{attendanceSummary.NotYet}</p>
          <p className="mt-1 text-sm text-slate-500">Within 15–30 minutes grace window</p>
        </article>
      </section>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Related modules</h2>
        <p className="text-sm text-slate-500">Open connected workflows directly from duty roster</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/overtime-ot" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <Clock3 className="h-4 w-4" />
            Overtime OT
          </Link>
          <Link href="/shift-handover" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <CalendarClock className="h-4 w-4" />
            Shift handover
          </Link>
          <Link href="/medications" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <Pill className="h-4 w-4" />
            Medications
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void (async () => {
                setIsRefreshingRoster(true)
                try {
                  const response = await fetch("/api/duty-roster", { cache: "no-store" })
                  const payload = await response.json().catch(() => null)
                  if (payload?.ok && payload?.data) {
                    const rosterData = payload.data as DutyRosterSettings
                    // eslint-disable-next-line no-console
                    console.log("Loaded duty roster:", rosterData)
                    if (Array.isArray(rosterData.dutyRows)) setDutyRows(rosterData.dutyRows)
                    if (typeof rosterData.nurseLeaveList === "string") setNurseLeaveList(rosterData.nurseLeaveList)
                    if (Array.isArray(rosterData.weeklyRoster)) setWeeklyRoster(rosterData.weeklyRoster)
                    setLastSavedAt(String(rosterData.updatedAt || ""))
                    setStatus("Roster refreshed from server.")
                    setBackendSyncAvailable(true)
                  } else {
                    setStatus("Unable to refresh duty roster from server.")
                    setBackendSyncAvailable(false)
                  }
                } catch {
                  setStatus("Unable to refresh duty roster from server.")
                  setBackendSyncAvailable(false)
                } finally {
                  setIsRefreshingRoster(false)
                }
              })()
            }}
            disabled={isRefreshingRoster}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshingRoster ? "animate-spin" : ""}`} />
            {isRefreshingRoster ? "Refreshing roster..." : "Refresh roster"}
          </button>
          <button
            type="button"
            onClick={() => {
              void saveAllDutyRows()
            }}
            disabled={isSavingAll}
            className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            {isSavingAll ? "Saving all..." : "Save All Duty Roster"}
          </button>
          <p className="text-sm text-slate-600">
            {status || "You can edit shift fields, then Save row or Save All Duty Roster."}
          </p>
          <p className="text-xs text-slate-500">
            Last saved at: {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : "-"}
          </p>
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Nurse on leave name list</h2>
        <p className="text-sm text-slate-500">Track nurses unavailable for duty assignment this week</p>
        <textarea
          rows={3}
          value={nurseLeaveList}
          onChange={(event) => updateNurseLeaveList(event.target.value)}
          placeholder="Enter nurse names on leave, separated by commas"
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Shift</th>
              <th className="px-4 py-3">Window</th>
              <th className="px-4 py-3">Ward</th>
              <th className="px-4 py-3">Lead nurse</th>
              <th className="px-4 py-3">Nurse name list</th>
              <th className="px-4 py-3">On duty</th>
              <th className="px-4 py-3">Handover</th>
            </tr>
          </thead>
          <tbody>
            {dutyRows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-none">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <div className="flex min-w-28 flex-col gap-2">
                    <span>{row.shift}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void saveDutyRow(row)
                      }}
                      disabled={savingRowId === row.id || isSavingAll}
                      className="inline-flex w-fit rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    >
                      {savingRowId === row.id ? "Saving..." : "Save row"}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <input
                    type="text"
                    value={row.timeWindow}
                    onChange={(event) => updateDutyField(row.id, { timeWindow: event.target.value })}
                    placeholder="e.g. 06:00 - 14:00"
                    className="w-full min-w-40 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <input
                    type="text"
                    value={row.ward}
                    onChange={(event) => updateDutyField(row.id, { ward: event.target.value })}
                    placeholder="e.g. A-Floor"
                    className="w-full min-w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <input
                    type="text"
                    value={row.leadNurse}
                    onChange={(event) => updateDutyField(row.id, { leadNurse: event.target.value })}
                    placeholder="e.g. Nurse Lee"
                    className="w-full min-w-40 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <textarea
                    rows={2}
                    value={row.nurseNames}
                    onChange={(event) => updateNurseNames(row.id, event.target.value)}
                    placeholder="Enter nurses on duty, separated by commas"
                    className="w-full min-w-56 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <label className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-500" />
                    <input
                      type="number"
                      min={0}
                      value={row.onDuty}
                      onChange={(event) => {
                        updateOnDuty(row.id, event.target.value)
                      }}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <input
                    type="text"
                    value={row.handoverAt}
                    onChange={(event) => updateDutyField(row.id, { handoverAt: event.target.value })}
                    placeholder="e.g. 13:45"
                    className="w-full min-w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Weekly duty roster</h2>
          <p className="text-sm text-slate-500">Edit morning, evening, and night assignments for each day</p>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">Morning</th>
              <th className="px-4 py-3">Evening</th>
              <th className="px-4 py-3">Night</th>
            </tr>
          </thead>
          <tbody>
            {weeklyRoster.map((row) => (
              <tr key={row.day} className="border-b border-slate-100 last:border-none">
                <td className="px-4 py-3 font-medium text-slate-900">{row.day}</td>
                <td className="px-4 py-3">
                  <input
                    value={row.morning}
                    onChange={(event) => updateWeeklyRoster(row.day, "morning", event.target.value)}
                    className="w-full min-w-48 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    value={row.evening}
                    onChange={(event) => updateWeeklyRoster(row.day, "evening", event.target.value)}
                    className="w-full min-w-48 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    value={row.night}
                    onChange={(event) => updateWeeklyRoster(row.day, "night", event.target.value)}
                    className="w-full min-w-48 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Actual Attendance Records</h2>
            <p className="text-sm text-slate-500">Live punch in / out and OT records from Telegram and manual entries</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void refreshAttendanceRecords(false)
            }}
            disabled={isRefreshingAttendance}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshingAttendance ? "animate-spin" : ""}`} />
            {isRefreshingAttendance ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => {
              void runAbsentCheckNow()
            }}
            disabled={isRunningAbsentCheck}
            className="ml-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRunningAbsentCheck ? "animate-spin" : ""}`} />
            {isRunningAbsentCheck ? "Running absent check..." : "Run absent check now"}
          </button>
        </div>
        <div className="grid gap-2 border-b border-slate-200 bg-white px-4 py-3 md:grid-cols-3">
          <label className="text-sm text-slate-600">
            Date
            <input
              type="date"
              value={attendanceDateFilter}
              onChange={(event) => setAttendanceDateFilter(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            Shift
            <select
              value={attendanceShiftFilter}
              onChange={(event) => setAttendanceShiftFilter(event.target.value as "all" | "Morning" | "Evening" | "Night")}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="all">All shifts</option>
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
              <option value="Night">Night</option>
            </select>
          </label>
          <div className="self-end text-xs text-slate-500">Auto-updated from Telegram /punchin and /punchout</div>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Shift</th>
              <th className="px-4 py-3">Staff Name</th>
              <th className="px-4 py-3">Expected duty time</th>
              <th className="px-4 py-3">Punch in time</th>
              <th className="px-4 py-3">Punch out time</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredSheetDutyRows.map((row, idx) => (
              <tr key={`${row.date}-${row.shift}-${row.staffName}-${idx}`} className="border-b border-slate-100 last:border-none">
                <td className="px-4 py-3 text-slate-700">{row.date}</td>
                <td className="px-4 py-3 text-slate-700">{row.shift}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{row.staffName}</td>
                <td className="px-4 py-3 text-slate-700">{row.expectedStart} - {row.expectedEnd}</td>
                <td className="px-4 py-3 text-slate-700">{row.punchIn || "-"}</td>
                <td className="px-4 py-3 text-slate-700">{row.punchOut || "-"}</td>
                <td className="px-4 py-3 text-slate-700">{row.status}</td>
              </tr>
            ))}
            {filteredSheetDutyRows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={7}>
                  No duty roster attendance rows found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Nurse name</th>
              <th className="px-4 py-3">Shift</th>
              <th className="px-4 py-3">Punch in time</th>
              <th className="px-4 py-3">Punch out time</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Cloud sync</th>
              <th className="px-4 py-3">Record ID</th>
            </tr>
          </thead>
          <tbody>
            {attendanceRows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-none">
                <td className="px-4 py-3 font-medium text-slate-900">{row.nurseName}</td>
                <td className="px-4 py-3 text-slate-700">{shiftFromPunchIn(row.dutyPunchInAt)}</td>
                <td className="px-4 py-3 text-slate-700">{formatDateTime(row.dutyPunchInAt)}</td>
                <td className="px-4 py-3 text-slate-700">{formatDateTime(row.dutyPunchOutAt)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusTone(row.status)}`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700">{(row.source || "manual") === "telegram" ? "Telegram" : "Manual"}</td>
                <td className="px-4 py-3 text-slate-700">{row.syncStatus || "pending_sync"}</td>
                <td className="px-4 py-3 text-slate-700">{row.id}</td>
              </tr>
            ))}
            {attendanceRows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={8}>
                  No attendance records yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  )
}
