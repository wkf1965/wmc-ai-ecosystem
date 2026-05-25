"use client"

import { useCallback, useEffect, useState } from "react"
import { v1Url } from "@/lib/api/config"

// ── Types ─────────────────────────────────────────────────────────────────────

type Room = {
  id: string
  roomNumber: string
  ward: string
  totalBeds: number
  occupiedBeds: number
  status: "available" | "full" | string
  floor: number
}

type RoomsData = {
  totalRooms: number
  totalBeds: number
  occupiedBeds: number
  availableBeds: number
  occupancyRate: number
  rooms: Room[]
  mock: boolean
}

type AssignInput = { patientId: string; patientName: string; roomNumber: string }

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchRooms(): Promise<RoomsData | null> {
  try {
    const res = await fetch(v1Url("/rooms"), { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as RoomsData
  } catch { return null }
}

async function postAssign(input: AssignInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(v1Url("/rooms/assign"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const body = await res.json() as { error?: string }
    return res.ok ? { ok: true } : { ok: false, error: body.error ?? `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }
}

// ── Status pill ───────────────────────────────────────────────────────────────

function RoomStatusPill({ status }: { status: string }) {
  const style = status === "available"
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>
      {status === "available" ? "Available" : "Full"}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function RoomsCard() {
  const [data, setData]           = useState<RoomsData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [showAssign, setShowAssign] = useState(false)
  const [form, setForm]           = useState<AssignInput>({ patientId: "", patientName: "", roomNumber: "" })
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: "ok" | "err"; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setData(await fetchRooms())
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await postAssign(form)
    setSaving(false)
    if (result.ok) {
      setMsg({ type: "ok", text: `✅ ${form.patientName || form.patientId} assigned to ${form.roomNumber}` })
      setForm({ patientId: "", patientName: "", roomNumber: "" })
      setShowAssign(false)
      await load()
    } else {
      setMsg({ type: "err", text: `⚠️ ${result.error}` })
    }
    setTimeout(() => setMsg(null), 5000)
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">🏥 Room Management</h3>
          {data && !loading && (
            <p className="mt-0.5 text-xs text-slate-500">
              {data.availableBeds} beds available · {data.occupancyRate}% occupied
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} disabled={loading}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition"
          >
            {loading ? "…" : "↻"}
          </button>
          <button onClick={() => setShowAssign((v) => !v)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${showAssign ? "bg-slate-200 text-slate-700" : "bg-slate-900 text-white hover:bg-slate-800"}`}
          >
            {showAssign ? "Cancel" : "+ Assign"}
          </button>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`mb-3 rounded-xl px-3 py-2 text-xs font-medium ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Assign form */}
      {showAssign && (
        <form onSubmit={(e) => void handleAssign(e)} className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assign Patient to Room</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { name: "patientId",   placeholder: "Patient ID / MRN", required: true },
              { name: "patientName", placeholder: "Patient Name" },
              { name: "roomNumber",  placeholder: "Room (e.g. B-202)", required: true },
            ].map(({ name, placeholder, required }) => (
              <input key={name} name={name} value={form[name as keyof AssignInput]}
                onChange={(e) => setForm((p) => ({ ...p, [name]: e.target.value }))}
                placeholder={placeholder} required={required}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            ))}
          </div>
          <button type="submit" disabled={saving}
            className="mt-2 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {saving ? "Assigning…" : "Confirm Assignment"}
          </button>
        </form>
      )}

      {/* Occupancy bar */}
      {data && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Occupancy</span>
            <span>{data.occupiedBeds}/{data.totalBeds} beds</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${data.occupancyRate >= 90 ? "bg-rose-500" : data.occupancyRate >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${data.occupancyRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Rooms grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[1,2,3,4].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-2">
          {data.rooms.map((room) => (
            <div key={room.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div>
                <p className="text-xs font-bold text-slate-800">{room.roomNumber}</p>
                <p className="text-xs text-slate-400">{room.ward}</p>
              </div>
              <div className="text-right">
                <RoomStatusPill status={room.status} />
                <p className="mt-1 text-xs text-slate-400">{room.occupiedBeds}/{room.totalBeds}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-slate-400">Failed to load rooms</p>
      )}
    </div>
  )
}
