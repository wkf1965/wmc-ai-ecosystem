"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Boxes, Minus, Pencil, Plus } from "lucide-react"
import { getNurseName, setNurseName } from "../../lib/roleMode"

type InventoryItem = {
  id: string
  itemName: string
  quantity: number
  unit: string
  rate: number
  personInCharge: string
  lastUpdatedAt: string
}

type InventoryRecord = {
  id: string
  itemId: string
  itemName: string
  quantityChange: number
  unit: string
  unitRate: number
  room: string
  patientName: string
  personInCharge: string
  actionType: "taken" | "given" | "used" | "added"
  recordedAt: string
  source: "telegram" | "frontend" | "api"
  sourceStatus: "live" | "simulation"
}

// Items requested for nurse usage capture. "Other" lets the nurse free-type.
const ITEM_OPTIONS = [
  "Pampers",
  "Wet Tissue",
  "Ryles Tube",
  "CBD Tube",
  "Milk Powder",
  "Gloves",
  "Underpad",
  "Syringe",
  "Feeding Set",
  "Other",
] as const

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

export default function NurseInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [records, setRecords] = useState<InventoryRecord[]>([])

  // form state
  const [item, setItem] = useState<(typeof ITEM_OPTIONS)[number]>("Pampers")
  const [customItem, setCustomItem] = useState("")
  const [room, setRoom] = useState("")
  const [patientName, setPatientName] = useState("")
  const [lookingUp, setLookingUp] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [nurse, setNurse] = useState("")
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")

  // summary view
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
      const res = await fetch("/api/inventory", { cache: "no-store" })
      const json = await res.json().catch(() => null)
      if (json?.ok && json?.data) {
        setItems(Array.isArray(json.data.inventory) ? json.data.inventory : [])
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

  // Debounced patient lookup by room.
  const lookupTimer = useRef<number | null>(null)
  useEffect(() => {
    if (lookupTimer.current) window.clearTimeout(lookupTimer.current)
    const r = room.trim()
    if (!r) {
      setPatientName("")
      return
    }
    lookupTimer.current = window.setTimeout(async () => {
      setLookingUp(true)
      try {
        const res = await fetch(`/api/patient-by-room?room=${encodeURIComponent(r)}`, { cache: "no-store" })
        const json = await res.json().catch(() => null)
        if (json?.ok && json?.patientName) setPatientName(json.patientName)
      } catch {
        // ignore — nurse can type patient name area is not shown; lookup only
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

  async function submit() {
    setError("")
    const resolvedItem = item === "Other" ? customItem.trim() : item
    if (!resolvedItem) return setError("Please enter the item name.")
    if (!Number.isFinite(quantity) || quantity <= 0) return setError("Quantity must be greater than 0.")
    if (!nurse.trim()) {
      setEditingName(true)
      return setError("Please set your name first.")
    }
    setBusy(true)
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemName: resolvedItem,
          quantityChange: quantity,
          actionType: "used",
          room: room.trim(),
          patientName: patientName.trim(),
          personInCharge: nurse.trim(),
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Could not save. Try again.")
        return
      }
      setToast("Saved successfully.")
      setQuantity(1)
      setCustomItem("")
      void refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.")
    } finally {
      setBusy(false)
    }
  }

  // ── Derived: usage records (consumption only) ──────────────────────────────
  const usageRecords = useMemo(
    () => records.filter((r) => r.actionType !== "added" && Number(r.quantityChange) < 0),
    [records],
  )

  const todayUnits = useMemo(
    () => usageRecords.filter((r) => isToday(r.recordedAt)).reduce((s, r) => s + Math.abs(r.quantityChange), 0),
    [usageRecords],
  )
  const monthUnits = useMemo(
    () => usageRecords.filter((r) => isThisMonth(r.recordedAt)).reduce((s, r) => s + Math.abs(r.quantityChange), 0),
    [usageRecords],
  )

  const patientSummary = useMemo(() => {
    const map = new Map<string, { patient: string; room: string; total: number; charge: number; lastAt: string }>()
    for (const r of usageRecords) {
      if (!inPeriod(r.recordedAt, period)) continue
      const patient = (r.patientName || "").trim() || "(unspecified)"
      const key = patient.toLowerCase()
      const cur = map.get(key) || { patient, room: r.room || "-", total: 0, charge: 0, lastAt: r.recordedAt }
      const units = Math.abs(r.quantityChange)
      cur.total += units
      cur.charge += units * (Number(r.unitRate) || 0)
      if (!cur.room || cur.room === "-") cur.room = r.room || "-"
      if (new Date(r.recordedAt).getTime() > new Date(cur.lastAt).getTime()) cur.lastAt = r.recordedAt
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.charge - a.charge)
  }, [usageRecords, period])

  const recentHistory = useMemo(() => records.slice(0, 40), [records])
  const lowStock = useMemo(() => items.filter((i) => i.quantity <= 5), [items])

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
              <h1 className="text-lg font-bold text-slate-900">Inventory</h1>
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

        {/* ── Record usage ─────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-900">Record item usage</h2>
          {error ? (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Item</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ITEM_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setItem(opt)}
                className={`min-h-[48px] rounded-xl border px-2 text-sm font-semibold transition active:scale-[0.97] ${
                  item === opt
                    ? "border-amber-500 bg-amber-500 text-white shadow"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {item === "Other" ? (
            <input
              value={customItem}
              onChange={(e) => setCustomItem(e.target.value)}
              placeholder="Type item name"
              className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Room</p>
              <input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. 201"
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

          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity used</p>
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

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="mt-5 flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-amber-600 text-base font-bold text-white shadow active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save usage"}
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">Date &amp; time are recorded automatically.</p>
        </section>

        {/* ── Stock balance ────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Remaining stock balance</h2>
            {lowStock.length > 0 ? (
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                {lowStock.length} low
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((it) => {
              const low = it.quantity <= 5
              return (
                <div
                  key={it.id}
                  className={`rounded-xl border p-3 ${low ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"}`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <Boxes className="h-3.5 w-3.5" />
                    {it.itemName}
                  </div>
                  <p className={`mt-1 text-2xl font-bold ${low ? "text-rose-700" : "text-slate-900"}`}>{it.quantity}</p>
                  <p className="text-xs text-slate-500">{it.unit} · {rm(it.rate)}/{it.unit.replace(/s$/, "")}{low ? " · restock" : ""}</p>
                </div>
              )
            })}
            {items.length === 0 ? <p className="text-sm text-slate-500">No stock items yet.</p> : null}
          </div>
        </section>

        {/* ── Usage summary ────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-900">Usage summary</h2>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-amber-50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{todayUnits}</p>
              <p className="text-xs font-semibold text-amber-700">Today (units)</p>
            </div>
            <div className="rounded-xl bg-sky-50 p-3 text-center">
              <p className="text-2xl font-bold text-sky-700">{monthUnits}</p>
              <p className="text-xs font-semibold text-sky-700">This month</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{patientSummary.length}</p>
              <p className="text-xs font-semibold text-emerald-700">Patients</p>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Patient total usage</p>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
              {(["today", "month", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-md px-2.5 py-1 font-semibold capitalize ${
                    period === p ? "bg-slate-900 text-white" : "text-slate-600"
                  }`}
                >
                  {p === "month" ? "Month" : p === "today" ? "Daily" : "All"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Patient</th>
                  <th className="px-2 py-2 font-semibold">Room</th>
                  <th className="px-2 py-2 font-semibold">Total used</th>
                  <th className="px-2 py-2 font-semibold">Charge</th>
                  <th className="px-2 py-2 font-semibold">Last used</th>
                </tr>
              </thead>
              <tbody>
                {patientSummary.map((row) => (
                  <tr key={row.patient} className="border-b border-slate-100 text-slate-700">
                    <td className="px-2 py-2 font-medium text-slate-900">{row.patient}</td>
                    <td className="px-2 py-2">{row.room}</td>
                    <td className="px-2 py-2 font-semibold">{row.total}</td>
                    <td className="px-2 py-2 font-semibold text-slate-900">{rm(row.charge)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-slate-500">{fmt(row.lastAt)}</td>
                  </tr>
                ))}
                {patientSummary.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-sm text-slate-500">
                      No usage recorded for this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── History ──────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-900">Inventory history</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Item</th>
                  <th className="px-2 py-2 font-semibold">Qty</th>
                  <th className="px-2 py-2 font-semibold">Patient</th>
                  <th className="px-2 py-2 font-semibold">Room</th>
                  <th className="px-2 py-2 font-semibold">Nurse</th>
                  <th className="px-2 py-2 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentHistory.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 text-slate-700">
                    <td className="px-2 py-2 font-medium text-slate-900">{r.itemName}</td>
                    <td className="px-2 py-2">
                      <span className={r.quantityChange < 0 ? "text-rose-600" : "text-emerald-600"}>
                        {r.quantityChange > 0 ? `+${r.quantityChange}` : r.quantityChange}
                      </span>
                    </td>
                    <td className="px-2 py-2">{r.patientName || "-"}</td>
                    <td className="px-2 py-2">{r.room || "-"}</td>
                    <td className="px-2 py-2">{r.personInCharge || "-"}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-slate-500">{fmt(r.recordedAt)}</td>
                  </tr>
                ))}
                {recentHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center text-sm text-slate-500">
                      No inventory records yet.
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
