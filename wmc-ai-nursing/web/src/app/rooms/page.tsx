"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { BedDouble, Building2, ShieldAlert } from "lucide-react"
import { analyzePatientRisk } from "../../lib/aiRiskDetection"
import { listAvailableRooms, listPatients, type Patient } from "../../lib/patientManagement"

function severityTone(level: "green" | "yellow" | "orange" | "red") {
  if (level === "red") return "bg-rose-100 text-rose-700"
  if (level === "orange") return "bg-orange-100 text-orange-700"
  if (level === "yellow") return "bg-amber-100 text-amber-700"
  return "bg-emerald-100 text-emerald-700"
}

type RoomRow = {
  room: string
  wing: string
  patientId: string
  patientName: string
  assignedNurse: string
  fallRisk: string
  riskScore: number
  severity: "green" | "yellow" | "orange" | "red"
}

export default function RoomsPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [query, setQuery] = useState("")
  const [wingFilter, setWingFilter] = useState("All")

  useEffect(() => {
    setPatients(listPatients())
  }, [])

  const roomRows = useMemo<RoomRow[]>(() => {
    return patients
      .map((patient) => {
        const room = String(patient.roomNumber || "").trim()
        const risk = analyzePatientRisk(patient)
        return {
          room,
          wing: room.split("-")[0],
          patientId: patient.id,
          patientName: patient.fullName,
          assignedNurse: patient.assignedNurse,
          fallRisk: patient.fallRisk,
          riskScore: risk.totalScore,
          severity: risk.severity,
        }
      })
      .filter((row) => row.room.length > 0)
      .sort((left, right) => left.room.localeCompare(right.room))
  }, [patients])

  const wings = useMemo(() => Array.from(new Set(roomRows.map((row) => row.wing))).sort(), [roomRows])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return roomRows.filter((row) => {
      if (wingFilter !== "All" && row.wing !== wingFilter) return false
      if (!q) return true
      return (
        row.room.toLowerCase().includes(q) ||
        row.patientName.toLowerCase().includes(q) ||
        row.assignedNurse.toLowerCase().includes(q)
      )
    })
  }, [roomRows, query, wingFilter])

  const vacantRooms = useMemo(() => {
    return listAvailableRooms()
  }, [roomRows])

  const summary = useMemo(() => {
    const highRisk = roomRows.filter((row) => row.severity === "red" || row.severity === "orange").length
    const wings = new Set(roomRows.map((row) => row.wing)).size
    return {
      occupiedRooms: roomRows.length,
      highRiskRooms: highRisk,
      activeWings: wings,
    }
  }, [roomRows])

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Nursing operations</p>
          <h1 className="text-2xl font-semibold text-slate-900">Rooms Module</h1>
          <p className="text-sm text-slate-500">Room occupancy and bedside risk overview</p>
        </div>
        <Link href="/patients" className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          Open patients
        </Link>
      </div>

      <section className="mb-4 grid gap-3 sm:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Occupied rooms</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.occupiedRooms}</p>
          <p className="mt-1 text-sm text-slate-500">Current census mapping</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">High-risk rooms</p>
          <p className="mt-2 text-2xl font-bold text-rose-700">{summary.highRiskRooms}</p>
          <p className="mt-1 text-sm text-slate-500">Orange or red AI severity</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active wings</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.activeWings}</p>
          <p className="mt-1 text-sm text-slate-500">Coverage across units</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Vacant rooms</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{vacantRooms.length}</p>
          <p className="mt-1 text-sm text-slate-500">Available for admissions</p>
        </article>
      </section>

      <section className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1.2fr_220px]">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Search room or resident</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search room, resident, or nurse"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Wing</label>
          <select value={wingFilter} onChange={(event) => setWingFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option>All</option>
            {wings.map((wing) => (
              <option key={wing} value={wing}>
                {wing}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Resident</th>
              <th className="px-4 py-3">Assigned nurse</th>
              <th className="px-4 py-3">Fall risk</th>
              <th className="px-4 py-3">AI risk</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.patientId} className="border-b border-slate-100 last:border-none">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <span className="inline-flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    {row.room}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700">{row.patientName}</td>
                <td className="px-4 py-3 text-slate-700">{row.assignedNurse}</td>
                <td className="px-4 py-3 text-slate-700">
                  <span className="inline-flex items-center gap-1">
                    <BedDouble className="h-4 w-4 text-slate-500" />
                    {row.fallRisk}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityTone(row.severity)}`}>
                    {row.severity.toUpperCase()} · {row.riskScore}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/patients/${row.patientId}`} className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline">
                    <ShieldAlert className="h-4 w-4" />
                    Open profile
                  </Link>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={6}>
                  No rooms match your filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Vacant room list</h2>
        <p className="text-sm text-slate-500">Current unoccupied rooms in the configured wings</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {vacantRooms.slice(0, 80).map((room) => (
            <span key={room} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              {room}
            </span>
          ))}
          {vacantRooms.length === 0 ? <span className="text-sm text-slate-500">No vacant rooms.</span> : null}
        </div>
      </section>
    </main>
  )
}
