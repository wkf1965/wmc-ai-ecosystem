"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Minus, Pencil, Plus, Stethoscope } from "lucide-react"
import { getNurseName, setNurseName } from "../../lib/roleMode"

type ServiceRate = { id: string; serviceName: string; rate: number; updatedAt: string }

type ServiceRecord = {
  id: string
  serviceId: string
  serviceName: string
  patientName: string
  room: string
  nurseName: string
  recordedAt: string
  quantity: number
  unitRate: number
  totalAmount: number
  remarks: string
  status: "pending" | "completed" | "billed"
  source: "telegram" | "frontend" | "api"
}

type Period = "today" | "month" | "all"

function isToday(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function isThisMonth(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

function inPeriod(value: string, period: Period) {
  if (period === "all") return true
  if (period === "today") return isToday(value)
  return isThisMonth(value)
}

function fmt(value: string) {
  if (!value) return "-"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

function rm(value: number) {
  return `RM${(Number(value) || 0).toFixed(2)}`
}

export default function NurseNursingServicesPage() {
  const [rates, setRates] = useState<ServiceRate[]>([])
  const [records, setRecords] = useState<ServiceRecord[]>([])

  // form state
  const [serviceId, setServiceId] = useState("wound-dressing")
  const [room, setRoom] = useState("")
  const [patientName, setPatientName] = useState("")
  const [lookingUp, setLookingUp] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [rate, setRate] = useState(0)
  const [rateTouched, setRateTouched] = useState(false)
  const [remarks, setRemarks] = useState("")
  const [nurse, setNurse] = useState("")
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [period, setPeriod] = useState<Period>("today")

  useEffect(() => {
    const stored = getNurseName()
    setNurse(stored)
    if (!stored) setEditingName(true)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(""), 3000)
    return () => window.clearTimeout(t)
  }, [toast])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/nursing-services", { cache: "no-store" })
      const json = await res.json().catch(() => null)
      if (json?.ok && json?.data) {
        setRates(Array.isArray(json.data.rates) ? json.data.rates : [])
        setRecords(Array.isArray(json.data.records) ? json.data.records : [])
      }
    } catch {
      // keep last good state
    }
  }, [])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => void refresh(), 20000)
    return () => window.clearInterval(t)
  }, [refresh])

  // Auto-fill rate when service changes (unless the nurse overrode it).
  useEffect(() => {
    if (rateTouched) return
    const match = rates.find((r) => r.id === serviceId)
    if (match) setRate(match.rate)
  }, [serviceId, rates, rateTouched])

  // Debounced patient lookup by room.
  const lookupTimer = useRef<number | null>(null)
  useEffect(() => {
    if (lookupTimer.current) window.clearTimeout(lookupTimer.current)
    const r = room.trim()
    if (!r) return
    lookupTimer.current = window.setTimeout(async () => {
      setLookingUp(true)
      try {
        const res = await fetch(`/api/patient-by-room?room=${encodeURIComponent(r)}`, { cache: "no-store" })
        const json = await res.json().catch(() => null)
        if (json?.ok && json?.patientName) setPatientName(json.patientName)
      } catch {
        // ignore
      } finally {
        setLookingUp(false)
      }
    }, 450)
    return () => {
      if (lookupTimer.current) window.clearTimeout(lookupTimer.current)
    }
  }, [room])

  function saveName() {
    const next = nameDraft.trim()
    if (!next) {
      setToast("Please enter your name.")
      return
    }
    setNurseName(next)
    setNurse(next)
    setEditingName(false)
    setToast(`Welcome, ${next}.`)
  }

  const total = useMemo(() => Math.round((Number(rate) || 0) * Math.max(1, quantity) * 100) / 100, [rate, quantity])

  async function submit() {
    setError("")
    if (!patientName.trim()) return setError("Please enter a patient (type a room to auto-fill).")
    if (!Number.isFinite(quantity) || quantity <= 0) return setError("Quantity must be greater than 0.")
    if (!nurse.trim()) {
      setEditingName(true)
      return setError("Please set your name first.")
    }
    setBusy(true)
    try {
      const res = await fetch("/api/nursing-services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId,
          patientName: patientName.trim(),
          room: room.trim(),
          nurseName: nurse.trim(),
          quantity,
          unitRate: rate,
          remarks: remarks.trim(),
          status: "completed",
          source: "frontend",
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Could not save. Try again.")
        return
      }
      setToast("Service charge saved.")
      setQuantity(1)
      setRemarks("")
      void refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.")
    } finally {
      setBusy(false)
    }
  }

  const todayCharges = useMemo(
    () => records.filter((r) => isToday(r.recordedAt)).reduce((s, r) => s + (Number(r.totalAmount) || 0), 0),
    [records],
  )
  const monthCharges = useMemo(
    () => records.filter((r) => isThisMonth(r.recordedAt)).reduce((s, r) => s + (Number(r.totalAmount) || 0), 0),
    [records],
  )

  const patientSummary = useMemo(() => {
    const map = new Map<string, { patient: string; room: string; total: number; count: number; lastAt: string }>()
    for (const r of records) {
      if (!inPeriod(r.recordedAt, period)) continue
      const patient = (r.patientName || "").trim() || "(unspecified)"
      const key = patient.toLowerCase()
      const cur = map.get(key) || { patient, room: r.room || "-", total: 0, count: 0, lastAt: r.recordedAt }
      cur.total += Number(r.totalAmount) || 0
      cur.count += 1
      if (!cur.room || cur.room === "-") cur.room = r.room || "-"
      if (new Date(r.recordedAt).getTime() > new Date(cur.lastAt).getTime()) cur.lastAt = r.recordedAt
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [records, period])

  const recentHistory = useMemo(() => records.slice(0, 40), [records])

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/nurse"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
              aria-label="Back to Nurse Mode"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">WMC AI Nursing</p>
              <h1 className="text-lg font-bold text-slate-900">Nursing Services</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setNameDraft(nurse)
              setEditingName(true)
            }}
            className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900"
          >
            {nurse || "Set name"}
            <Pencil className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        {editingName ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-sm font-semibold text-slate-700">Your name</label>
            <div className="mt-2 flex gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="e.g. Wong"
                autoFocus
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
              <button
                type="button"
                onClick={saveName}
                className="rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white active:scale-[0.98]"
              >
                Save
              </button>
            </div>
          </section>
        ) : null}

        {/* ── Record service ───────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-900">Record nursing service</h2>
          {error ? (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Room</p>
              <input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. 2"
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Patient</p>
              <input
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder={lookingUp ? "Looking up…" : "Auto from room"}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
            </div>
          </div>

          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Service</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rates.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setServiceId(opt.id)
                  setRateTouched(false)
                }}
                className={`flex min-h-[48px] items-center justify-between rounded-xl border px-3 text-sm font-semibold transition active:scale-[0.97] ${
                  serviceId === opt.id
                    ? "border-cyan-600 bg-cyan-600 text-white shadow"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <span>{opt.serviceName}</span>
                <span className={serviceId === opt.id ? "text-cyan-100" : "text-slate-400"}>{rm(opt.rate)}</span>
              </button>
            ))}
            {rates.length === 0 ? <p className="text-sm text-slate-500">Loading services…</p> : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700 active:scale-[0.95]"
                  aria-label="Decrease"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))}
                  inputMode="numeric"
                  className="h-12 w-20 rounded-xl border border-slate-300 text-center text-lg font-bold text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 text-slate-700 active:scale-[0.95]"
                  aria-label="Increase"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Unit rate (RM)</p>
              <input
                value={rate}
                onChange={(e) => {
                  setRateTouched(true)
                  setRate(Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0))
                }}
                inputMode="decimal"
                className="h-12 w-full rounded-xl border border-slate-300 px-4 text-base font-semibold text-slate-900"
              />
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Remarks (optional)</p>
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Daily dressing, left heel"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm font-semibold text-slate-600">Total amount</span>
            <span className="text-2xl font-bold text-slate-900">{rm(total)}</span>
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="mt-4 flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-cyan-600 text-base font-bold text-white shadow active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save service charge"}
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">Date &amp; time are recorded automatically.</p>
        </section>

        {/* ── Summary ──────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-900">Charge summary</h2>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-cyan-50 p-3 text-center">
              <p className="text-xl font-bold text-cyan-700">{rm(todayCharges)}</p>
              <p className="text-xs font-semibold text-cyan-700">Today</p>
            </div>
            <div className="rounded-xl bg-sky-50 p-3 text-center">
              <p className="text-xl font-bold text-sky-700">{rm(monthCharges)}</p>
              <p className="text-xs font-semibold text-sky-700">This month</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-xl font-bold text-emerald-700">{patientSummary.length}</p>
              <p className="text-xs font-semibold text-emerald-700">Patients</p>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Patient total charges</p>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
              {(["today", "month", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    period === p ? "bg-slate-900 text-white" : "text-slate-600"
                  }`}
                >
                  {p === "month" ? "Month" : p === "today" ? "Daily" : "All"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Patient</th>
                  <th className="px-2 py-2 font-semibold">Room</th>
                  <th className="px-2 py-2 font-semibold">Services</th>
                  <th className="px-2 py-2 font-semibold">Total charge</th>
                </tr>
              </thead>
              <tbody>
                {patientSummary.map((row) => (
                  <tr key={row.patient} className="border-b border-slate-100 text-slate-700">
                    <td className="px-2 py-2 font-medium text-slate-900">{row.patient}</td>
                    <td className="px-2 py-2">{row.room}</td>
                    <td className="px-2 py-2">{row.count}</td>
                    <td className="px-2 py-2 font-semibold">{rm(row.total)}</td>
                  </tr>
                ))}
                {patientSummary.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-6 text-center text-sm text-slate-500">
                      No charges for this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── History ──────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
            <Stethoscope className="h-4 w-4 text-cyan-600" /> Recent services
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Service</th>
                  <th className="px-2 py-2 font-semibold">Patient</th>
                  <th className="px-2 py-2 font-semibold">Room</th>
                  <th className="px-2 py-2 font-semibold">Qty</th>
                  <th className="px-2 py-2 font-semibold">Amount</th>
                  <th className="px-2 py-2 font-semibold">Nurse</th>
                  <th className="px-2 py-2 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentHistory.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 text-slate-700">
                    <td className="px-2 py-2 font-medium text-slate-900">{r.serviceName}</td>
                    <td className="px-2 py-2">{r.patientName || "-"}</td>
                    <td className="px-2 py-2">{r.room || "-"}</td>
                    <td className="px-2 py-2">{r.quantity}</td>
                    <td className="px-2 py-2 font-semibold">{rm(r.totalAmount)}</td>
                    <td className="px-2 py-2">{r.nurseName || "-"}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-slate-500">{fmt(r.recordedAt)}</td>
                  </tr>
                ))}
                {recentHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-sm text-slate-500">
                      No nursing service records yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {toast ? (
        <div className="fixed inset-x-0 bottom-24 z-40 mx-auto w-fit max-w-[90%] rounded-full bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
