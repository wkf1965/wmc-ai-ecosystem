"use client"

import { useMemo } from "react"
import Link from "next/link"
import { listPatients } from "../../lib/patientManagement"

function parseMeds(patientName: string, meds: string) {
  return meds
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ patientName, med: item }))
}

export default function MedicationsPage() {
  const rows = useMemo(() => {
    const patients = listPatients()
    return patients.flatMap((person) => parseMeds(person.fullName, person.currentMedications))
  }, [])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Medication Operations</p>
          <h1 className="text-2xl font-semibold text-slate-900">Medication Dashboard</h1>
        </div>
        <Link href="/dashboard" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Back to dashboard
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Resident</th>
              <th className="px-4 py-3">Medication</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={`${entry.patientName}-${entry.med}`} className="border-b border-slate-100 last:border-none">
                <td className="px-4 py-3 text-slate-900">{entry.patientName}</td>
                <td className="px-4 py-3 text-slate-700">{entry.med}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-700">active</span>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-slate-500">
                  No medication records available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  )
}