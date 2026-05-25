"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { CalendarClock, Clock3, Pill, Users } from "lucide-react"

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

const DUTY_ROSTER_STORAGE_KEY = "wmc_nursing_duty_roster_v1"
const NURSE_LEAVE_STORAGE_KEY = "wmc_nursing_leave_list_v1"
const WEEKLY_ROSTER_STORAGE_KEY = "wmc_nursing_weekly_roster_v1"

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

function readDutyRows() {
  if (typeof window === "undefined") return dutyRowsSeed
  const raw = window.localStorage.getItem(DUTY_ROSTER_STORAGE_KEY)
  if (!raw) return dutyRowsSeed
  try {
    const parsed = JSON.parse(raw) as DutyRow[]
    if (!Array.isArray(parsed)) return dutyRowsSeed
    return parsed.map((item, index) => ({
      ...dutyRowsSeed[index],
      ...item,
      nurseNames: String(item?.nurseNames || dutyRowsSeed[index]?.nurseNames || ""),
      onDuty: Number(item?.onDuty || 0),
    }))
  } catch {
    return dutyRowsSeed
  }
}

function writeDutyRows(rows: DutyRow[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(DUTY_ROSTER_STORAGE_KEY, JSON.stringify(rows))
}

function readNurseLeaveList() {
  if (typeof window === "undefined") return nurseLeaveSeed
  return window.localStorage.getItem(NURSE_LEAVE_STORAGE_KEY) || nurseLeaveSeed
}

function writeNurseLeaveList(value: string) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(NURSE_LEAVE_STORAGE_KEY, value)
}

function readWeeklyRoster() {
  if (typeof window === "undefined") return weeklyRosterSeed
  const raw = window.localStorage.getItem(WEEKLY_ROSTER_STORAGE_KEY)
  if (!raw) return weeklyRosterSeed
  try {
    const parsed = JSON.parse(raw) as WeeklyRosterRow[]
    if (!Array.isArray(parsed)) return weeklyRosterSeed
    return weeklyRosterSeed.map((seedRow, index) => ({
      ...seedRow,
      ...parsed[index],
      day: seedRow.day,
      morning: String(parsed[index]?.morning || seedRow.morning),
      evening: String(parsed[index]?.evening || seedRow.evening),
      night: String(parsed[index]?.night || seedRow.night),
    }))
  } catch {
    return weeklyRosterSeed
  }
}

function writeWeeklyRoster(rows: WeeklyRosterRow[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(WEEKLY_ROSTER_STORAGE_KEY, JSON.stringify(rows))
}

export default function NurseDutyRosterPage() {
  const [dutyRows, setDutyRows] = useState<DutyRow[]>(dutyRowsSeed)
  const [nurseLeaveList, setNurseLeaveList] = useState(nurseLeaveSeed)
  const [weeklyRoster, setWeeklyRoster] = useState<WeeklyRosterRow[]>(weeklyRosterSeed)
  const [status, setStatus] = useState("")

  useEffect(() => {
    setDutyRows(readDutyRows())
    setNurseLeaveList(readNurseLeaveList())
    setWeeklyRoster(readWeeklyRoster())
  }, [])

  const totalOnDuty = useMemo(() => dutyRows.reduce((sum, row) => sum + row.onDuty, 0), [dutyRows])

  function updateOnDuty(rowId: string, nextValue: string) {
    const parsed = Math.max(0, Number.parseInt(nextValue || "0", 10) || 0)
    const nextRows = dutyRows.map((row) => (row.id === rowId ? { ...row, onDuty: parsed } : row))
    setDutyRows(nextRows)
    writeDutyRows(nextRows)
    setStatus("Duty roster updated.")
  }

  function updateNurseNames(rowId: string, nextValue: string) {
    const nextRows = dutyRows.map((row) => (row.id === rowId ? { ...row, nurseNames: nextValue } : row))
    setDutyRows(nextRows)
    writeDutyRows(nextRows)
    setStatus("Duty roster updated.")
  }

  function updateNurseLeaveList(nextValue: string) {
    setNurseLeaveList(nextValue)
    writeNurseLeaveList(nextValue)
    setStatus("Nurse leave list updated.")
  }

  function updateWeeklyRoster(day: string, shift: "morning" | "evening" | "night", nextValue: string) {
    const nextRows = weeklyRoster.map((row) => (row.day === day ? { ...row, [shift]: nextValue } : row))
    setWeeklyRoster(nextRows)
    writeWeeklyRoster(nextRows)
    setStatus("Weekly duty roster updated.")
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
        <p className="mt-3 text-sm text-slate-600">{status || "You can edit on-duty nurse count and nurse name list for each shift below."}</p>
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
                <td className="px-4 py-3 font-medium text-slate-900">{row.shift}</td>
                <td className="px-4 py-3 text-slate-700">{row.timeWindow}</td>
                <td className="px-4 py-3 text-slate-700">{row.ward}</td>
                <td className="px-4 py-3 text-slate-700">{row.leadNurse}</td>
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
                      onChange={(event) => updateOnDuty(row.id, event.target.value)}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                </td>
                <td className="px-4 py-3 text-slate-700">{row.handoverAt}</td>
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
    </main>
  )
}
