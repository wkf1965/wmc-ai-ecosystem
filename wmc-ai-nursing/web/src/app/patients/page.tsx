"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { analyzePatientRisk, PatientRiskProfile } from "../../lib/aiRiskDetection"
import { listPatients, Patient } from "../../lib/patientManagement"

const riskClass = (risk: string) => {
  const normalized = risk.toLowerCase()
  if (normalized === "high") return "bg-rose-100 text-rose-700 border-rose-200"
  if (normalized === "moderate") return "bg-amber-100 text-amber-700 border-amber-200"
  return "bg-emerald-100 text-emerald-700 border-emerald-200"
}

function patientRoom(patientId: string) {
  const value = patientId.replace(/\D/g, "")
  const suffix = value.padStart(3, "0")
  const wing = Number.parseInt(suffix, 10) % 4
  const map = ["A", "B", "C", "D"]
  return `${map[wing]}-2${suffix.slice(-2)}`
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [query, setQuery] = useState("")
  const [riskFilter, setRiskFilter] = useState("All")
  const [nurseFilter, setNurseFilter] = useState("All")

  useEffect(() => {
    setPatients(listPatients())
  }, [])

  const nurses = useMemo(() => Array.from(new Set(patients.map((person) => person.assignedNurse))).sort(), [patients])

  const patientRisks = useMemo(() => {
    const rows = patients.map((person) => {
      const risk = analyzePatientRisk(person)
      return { ...person, risk }
    })

    const search = query.toLowerCase()

    return rows
      .filter((person) => {
        if (riskFilter !== "All" && person.risk.riskBadge !== riskFilter.toLowerCase()) return false
        if (nurseFilter !== "All" && person.assignedNurse !== nurseFilter) return false
        if (!search) return true

        return (
          person.fullName.toLowerCase().includes(search) ||
          person.diagnosis.toLowerCase().includes(search) ||
          person.assignedNurse.toLowerCase().includes(search) ||
          personRoom(person.id).toLowerCase().includes(search)
        )
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName))
  }, [patients, query, riskFilter, nurseFilter])

  const patientStats = useMemo(() => {
    const highRisk = patientRisks.filter((person) => person.risk.riskBadge === "high").length
    const medHigh = patientRisks.filter((person) => person.fallRisk === "High").length

    return {
      total: patients.length,
      highRisk,
      medHigh,
    }
  }, [patientRisks, patients])

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Care portfolio</p>
          <h1 className="text-2xl font-semibold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-500">Clinical profile directory and resident snapshots</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/patients/new"
            className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            + Add resident
          </Link>
          <Link href="/ai-note-analyzer" className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            + Add nursing note
          </Link>
        </div>
      </div>

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Residents</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{patientStats.total}</p>
          <p className="mt-1 text-sm text-slate-500">Total registry in active care</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">AI high risk</p>
          <p className="mt-2 text-2xl font-bold text-rose-700">{patientStats.highRisk}</p>
          <p className="mt-1 text-sm text-slate-500">Requires attention window &lt;24h</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Fall risk high</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">{patientStats.medHigh}</p>
          <p className="mt-1 text-sm text-slate-500">Needs transfer support planning</p>
        </article>
      </section>

      <section className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1.2fr_180px_220px]">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Search</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, diagnosis, room, nurse"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Risk level</label>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option>All</option>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Assigned nurse</label>
          <select value={nurseFilter} onChange={(event) => setNurseFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option>All</option>
            {nurses.map((nurse) => (
              <option key={nurse} value={nurse}>
                {nurse}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Resident</th>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Diagnosis</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3">Mobility</th>
              <th className="px-4 py-3">AI Risk</th>
              <th className="px-4 py-3">Assigned RN</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {patientRisks.map((person) => (
              <tr key={person.id} className="border-b border-slate-100 last:border-none">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{person.fullName}</p>
                  <p className="text-xs text-slate-500">ID: {person.id}</p>
                </td>
                <td className="px-4 py-3 text-slate-700">{patientRoom(person.id)}</td>
                <td className="px-4 py-3 text-slate-700">{person.diagnosis}</td>
                <td className="px-4 py-3 text-slate-700">{person.age}</td>
                <td className="px-4 py-3 text-slate-700">{person.mobilityStatus}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${riskClass(person.risk.riskBadge)}`}>
                    {person.risk.riskBadge.toUpperCase()}
                  </span>
                  <div className="mt-1 text-xs text-slate-500">Score: {person.risk.totalScore}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{person.assignedNurse}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/patients/${person.id}`} className="font-medium text-sky-700 hover:underline">
                      Open profile
                    </Link>
                    <Link href={`/patients/${person.id}/edit`} className="text-xs text-slate-600 underline-offset-2 hover:text-slate-900">
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {!patientRisks.length ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={8}>
                  No residents match your search or filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  )
}
