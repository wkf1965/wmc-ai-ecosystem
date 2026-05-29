"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Activity } from "lucide-react"
import { listPatients, syncPatientsFromTelegramAdmissions } from "../../lib/patientManagement"

type VitalRecord = {
  telegramRecordId: string
  timestamp: string
  patientName: string
  roomNumber: string
  bloodPressure: string
  pulseHeartRate: string
  temperature: string
  spo2: string
  bloodSugar: string
  remark: string
}

function formatDateTime(value: string) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export default function VitalSignsPage() {
  const [rows, setRows] = useState<VitalRecord[]>([])
  const [patientsByName, setPatientsByName] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const [lastSyncAt, setLastSyncAt] = useState("")
  const [nextRetryMs, setNextRetryMs] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    let inFlight = false
    let retryCount = 0
    let retryTimer: number | null = null

    const scheduleNextPoll = (delayMs = 20000) => {
      if (!mounted) return
      if (retryTimer) window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => {
        void load()
      }, delayMs)
    }

    const load = async () => {
      if (!mounted || inFlight) return
      inFlight = true
      try {
        await syncPatientsFromTelegramAdmissions()
        const index: Record<string, string> = {}
        for (const patient of listPatients()) {
          const key = String(patient.fullName || "").trim().toLowerCase()
          if (!key || index[key]) continue
          index[key] = patient.id
        }
        if (mounted) setPatientsByName(index)

        const response = await fetch("/api/modules/telegram-vitals", { cache: "no-store" })
        const payload = await response.json().catch(() => null)
        if (!mounted) return
        if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
          setStatus("Unable to load vitals records.")
          const nextRetry = Math.min(retryCount + 1, 3)
          retryCount = nextRetry
          const backoffDelay = 20000 * Math.pow(2, nextRetry)
          setNextRetryMs(backoffDelay)
          scheduleNextPoll(backoffDelay)
          return
        }
        setRows(payload.data as VitalRecord[])
        setStatus("Vital signs synced from Telegram bot records.")
        setLastSyncAt(new Date().toLocaleTimeString())
        setNextRetryMs(null)
        retryCount = 0
        scheduleNextPoll(20000)
      } catch (error) {
        if (!mounted) return
        setStatus("Unable to load vitals records.")
        const nextRetry = Math.min(retryCount + 1, 3)
        retryCount = nextRetry
        const backoffDelay = 20000 * Math.pow(2, nextRetry)
        setNextRetryMs(backoffDelay)
        console.error("[vital-signs-loop] sync failed, scheduling retry", { backoffDelay, error })
        scheduleNextPoll(backoffDelay)
      } finally {
        inFlight = false
      }
    }

    void load()
    return () => {
      mounted = false
      if (retryTimer) window.clearTimeout(retryTimer)
    }
  }, [])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (row) =>
        row.patientName.toLowerCase().includes(q) ||
        row.roomNumber.toLowerCase().includes(q) ||
        row.remark.toLowerCase().includes(q),
    )
  }, [rows, query])

  return (
    <div className="dashboard-shell">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Nursing operations</p>
            <h1 className="dashboard-title">Vital Signs Module</h1>
            <p className="text-sm text-slate-500">
              Patient vitals from Telegram with links to patient profile and room module
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Loop sync: {lastSyncAt ? `ok at ${lastSyncAt}` : "starting..."}
              {nextRetryMs ? ` | retry in ${Math.ceil(nextRetryMs / 1000)}s` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/patients" className="metric-chip">
              Patients
            </Link>
            <Link href="/rooms" className="metric-chip">
              Rooms
            </Link>
            <Link href="/dashboard" className="metric-chip">
              Back to dashboard
            </Link>
          </div>
        </div>
        <section className="mb-4 grid gap-3 sm:grid-cols-3">
          <article className="panel-card">
            <p className="panel-title">Total records</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{rows.length}</p>
            <p className="mt-1 text-sm text-slate-500">Vitals entries from Telegram bot</p>
          </article>
          <article className="panel-card">
            <p className="panel-title">Unique patients</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{new Set(rows.map((row) => row.patientName)).size}</p>
            <p className="mt-1 text-sm text-slate-500">Based on patient name in vitals logs</p>
          </article>
          <article className="panel-card">
            <p className="panel-title">Sync status</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{status || "Waiting for first sync..."}</p>
          </article>
        </section>

        <section className="panel-card mb-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Search patient/room</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by patient, room, or remark"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </section>

        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Blood pressure</th>
                <th className="px-4 py-3">Pulse/Heart rate</th>
                <th className="px-4 py-3">Temperature</th>
                <th className="px-4 py-3">SpO2</th>
                <th className="px-4 py-3">Blood sugar</th>
                <th className="px-4 py-3">Remark</th>
                <th className="px-4 py-3">Recorded at</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const matchedPatientId = patientsByName[row.patientName.trim().toLowerCase()]
                return (
                  <tr key={row.telegramRecordId} className="border-b border-slate-100 last:border-none">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        <Activity className="h-4 w-4 text-slate-500" />
                        {row.patientName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.roomNumber || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.bloodPressure || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.pulseHeartRate || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.temperature || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.spo2 || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.bloodSugar || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.remark || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDateTime(row.timestamp)}</td>
                    <td className="px-4 py-3">
                      {matchedPatientId ? (
                        <Link href={`/patients/${matchedPatientId}`} className="text-sm font-medium text-sky-700 hover:underline">
                          Open profile
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-500">No profile match</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-slate-500">
                    No vitals records found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  )
}
