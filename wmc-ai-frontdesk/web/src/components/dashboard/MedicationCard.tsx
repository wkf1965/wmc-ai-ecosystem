"use client"

import { useCallback, useEffect, useState } from "react"
import { v1Url } from "@/lib/api/config"

// ── Types ─────────────────────────────────────────────────────────────────────

type MedSummary = {
  totalSchedules: number
  givenToday: number
  pendingToday: number
  overdueCount: number
  mock: boolean
}

type PendingSchedule = {
  id: string
  patientName: string
  medicineName: string
  dosage: string
  scheduledTime: string
  prescribedBy: string
}

type GiveInput = {
  patientId:    string
  patientName:  string
  medicineName: string
  dosage:       string
  route:        string
  givenBy:      string
  notes:        string
}

const EMPTY_GIVE: GiveInput = {
  patientId:    "",
  patientName:  "",
  medicineName: "",
  dosage:       "",
  route:        "oral",
  givenBy:      "",
  notes:        "",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchSummary(): Promise<MedSummary | null> {
  try {
    const res = await fetch(v1Url("/medicine/summary"), { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as MedSummary
  } catch { return null }
}

async function fetchPending(): Promise<PendingSchedule[]> {
  try {
    const res = await fetch(v1Url("/medicine/pending"), { cache: "no-store" })
    if (!res.ok) return []
    const data = await res.json() as { pending: PendingSchedule[] }
    return data.pending ?? []
  } catch { return [] }
}

async function postGive(input: GiveInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(v1Url("/medicine/give"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId:    input.patientId.trim(),
        patientName:  input.patientName.trim() || null,
        medicineName: input.medicineName.trim(),
        dosage:       input.dosage.trim() || null,
        route:        input.route,
        givenBy:      input.givenBy.trim(),
        notes:        input.notes.trim() || null,
      }),
    })
    const body = await res.json() as { error?: string }
    return res.ok ? { ok: true } : { ok: false, error: body.error ?? `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "danger" | "neutral" }) {
  const style = tone === "good" ? "bg-emerald-50 text-emerald-700"
    : tone === "warn"   ? "bg-amber-50 text-amber-700"
    : tone === "danger" ? "bg-rose-50 text-rose-700"
    : "bg-slate-100 text-slate-600"
  return (
    <div className={`rounded-xl px-3 py-2 text-center ${style}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function MedicationCard() {
  const [summary, setSummary]   = useState<MedSummary | null>(null)
  const [pending, setPending]   = useState<PendingSchedule[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState<GiveInput>(EMPTY_GIVE)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState<{ type: "ok" | "err"; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [s, p] = await Promise.all([fetchSummary(), fetchPending()])
    setSummary(s)
    setPending(p)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleGive(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await postGive(form)
    setSaving(false)
    if (result.ok) {
      setMsg({ type: "ok", text: `✅ ${form.medicineName} recorded for ${form.patientName || form.patientId}` })
      setForm(EMPTY_GIVE)
      setShowForm(false)
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
          <h3 className="text-sm font-semibold text-slate-800">💊 Medication</h3>
          {summary && !loading && (
            <p className="mt-0.5 text-xs text-slate-500">
              {summary.givenToday} given today · {summary.pendingToday} pending
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} disabled={loading}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition"
          >
            {loading ? "…" : "↻"}
          </button>
          <button onClick={() => setShowForm((v) => !v)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${showForm ? "bg-slate-200 text-slate-700" : "bg-slate-900 text-white hover:bg-slate-800"}`}
          >
            {showForm ? "Cancel" : "+ Give Med"}
          </button>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`mb-3 rounded-xl px-3 py-2 text-xs font-medium ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Stats row */}
      {summary && !loading && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <StatPill label="Given Today" value={summary.givenToday}    tone="good" />
          <StatPill label="Pending"     value={summary.pendingToday}  tone={summary.pendingToday > 0 ? "warn" : "good"} />
          <StatPill label="Overdue"     value={summary.overdueCount}  tone={summary.overdueCount > 0 ? "danger" : "good"} />
        </div>
      )}

      {/* Overdue alert */}
      {summary && summary.overdueCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <span className="text-sm">🚨</span>
          <p className="text-xs font-semibold text-rose-700">
            {summary.overdueCount} medication{summary.overdueCount > 1 ? "s" : ""} overdue — action required
          </p>
        </div>
      )}

      {/* Give medication form */}
      {showForm && (
        <form onSubmit={(e) => void handleGive(e)} className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Record Medication</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { name: "patientId",    placeholder: "Patient ID / MRN *", required: true },
              { name: "patientName",  placeholder: "Patient Name" },
              { name: "medicineName", placeholder: "Medicine Name *", required: true },
              { name: "dosage",       placeholder: "Dosage (e.g. 5mg)" },
              { name: "givenBy",      placeholder: "Nurse Name *", required: true },
              { name: "notes",        placeholder: "Notes (optional)" },
            ].map(({ name, placeholder, required }) => (
              <input key={name} name={name} value={form[name as keyof GiveInput]}
                onChange={(e) => setForm((p) => ({ ...p, [name]: e.target.value }))}
                placeholder={placeholder} required={required}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select name="route" value={form.route}
              onChange={(e) => setForm((p) => ({ ...p, route: e.target.value }))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm"
            >
              {["oral", "iv", "im", "subcutaneous", "topical", "inhalation"].map((r) => (
                <option key={r} value={r}>{r.toUpperCase()}</option>
              ))}
            </select>
            <button type="submit" disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {saving ? "Saving…" : "Record Administration"}
            </button>
          </div>
        </form>
      )}

      {/* Pending medications list */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center">
          <p className="text-xs text-emerald-600 font-semibold">✅ All medications given for today</p>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pending Today</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {pending.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-slate-800">{s.medicineName} <span className="font-normal text-slate-500">{s.dosage}</span></p>
                  <p className="text-xs text-slate-500">{s.patientName} · {s.scheduledTime}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Pending
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
