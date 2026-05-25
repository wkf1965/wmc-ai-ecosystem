"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { v1Url } from "@/lib/api/config"

// ── Types ─────────────────────────────────────────────────────────────────────

type NursingRecord = {
  id: string
  patientId: string
  patientName?: string | null
  nurseName: string
  shiftDate?: string
  bloodPressure?: string | null
  pulse?: number | null
  temperature?: number | null
  oxygen?: string | null
  painScore?: number | null
  appetite?: string | null
  mood?: string | null
  mobility?: string | null
  sideTurning?: string | null
  woundCondition?: string | null
  notes?: string | null
  createdAt: string
  mock?: boolean
}

type FormState = {
  patientId:      string
  patientName:    string
  nurseName:      string
  bloodPressure:  string
  pulse:          string
  temperature:    string
  oxygen:         string
  painScore:      string
  appetite:       string
  mood:           string
  mobility:       string
  sideTurning:    string
  woundCondition: string
  notes:          string
}

type FieldErrors = Partial<Record<keyof FormState, string>>

// ── Option lists ──────────────────────────────────────────────────────────────

const APPETITE_OPTS   = ["good", "fair", "poor", "nil-by-mouth"] as const
const MOOD_OPTS       = ["alert", "cooperative", "anxious", "confused", "drowsy", "agitated"] as const
const MOBILITY_OPTS   = ["independent", "walker-assisted", "wheelchair", "bedbound", "fully-dependent"] as const
const SIDE_TURN_OPTS  = ["not-required", "2-hourly", "4-hourly", "done-morning", "done-afternoon", "done-night"] as const
const WOUND_OPTS      = ["none", "healing", "stable", "deteriorating", "infected", "dressed"] as const

// ── Empty form ────────────────────────────────────────────────────────────────

const EMPTY: FormState = {
  patientId:      "",
  patientName:    "",
  nurseName:      "",
  bloodPressure:  "",
  pulse:          "",
  temperature:    "",
  oxygen:         "",
  painScore:      "",
  appetite:       "good",
  mood:           "alert",
  mobility:       "independent",
  sideTurning:    "not-required",
  woundCondition: "none",
  notes:          "",
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchRecords(): Promise<NursingRecord[]> {
  const res = await fetch(v1Url("/nursing/records"), { cache: "no-store" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as { records: NursingRecord[] }
  return data.records ?? []
}

async function postRecord(
  form: FormState
): Promise<{ ok: true; record: NursingRecord; source: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(v1Url("/nursing/records"), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId:      form.patientId.trim(),
        patientName:    form.patientName.trim() || null,
        nurseName:      form.nurseName.trim(),
        bloodPressure:  form.bloodPressure.trim()  || null,
        pulse:          form.pulse.trim()          || null,
        temperature:    form.temperature.trim()    || null,
        oxygen:         form.oxygen.trim()         || null,
        painScore:      form.painScore.trim()      || null,
        appetite:       form.appetite,
        mood:           form.mood,
        mobility:       form.mobility,
        sideTurning:    form.sideTurning,
        woundCondition: form.woundCondition,
        notes:          form.notes.trim()          || null,
      }),
    })
    const body = await res.json() as { record?: NursingRecord; source?: string; error?: string }
    if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` }
    return { ok: true, record: body.record!, source: body.source ?? "mock" }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
      {required && <span className="ml-0.5 text-rose-500">*</span>}
    </label>
  )
}

function TextInput({
  name, value, onChange, placeholder, error, type = "text",
}: {
  name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; error?: string; type?: string
}) {
  return (
    <>
      <input
        name={name} value={value} onChange={onChange}
        type={type} placeholder={placeholder}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 transition ${
          error ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white"
        }`}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </>
  )
}

function SelectInput({
  name, value, onChange, options,
}: {
  name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  options: readonly string[]
}) {
  return (
    <select
      name={name} value={value} onChange={onChange}
      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.charAt(0).toUpperCase() + o.slice(1).replace(/-/g, " ")}
        </option>
      ))}
    </select>
  )
}

function PainDot({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-slate-400">—</span>
  const color = score <= 2 ? "bg-emerald-500" : score <= 5 ? "bg-amber-500" : "bg-rose-500"
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span>{score}/10</span>
    </span>
  )
}

function RecordRow({ rec }: { rec: NursingRecord }) {
  const date = rec.createdAt
    ? new Date(rec.createdAt).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" })
    : "—"
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{date}</td>
      <td className="px-4 py-3 text-sm font-semibold text-slate-800">{rec.patientName ?? rec.patientId}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{rec.nurseName}</td>
      <td className="px-4 py-3 text-sm font-mono text-slate-700">{rec.bloodPressure ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{rec.pulse ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{rec.temperature ? `${rec.temperature}°C` : "—"}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{rec.oxygen ?? "—"}</td>
      <td className="px-4 py-3 text-sm"><PainDot score={rec.painScore} /></td>
      <td className="px-4 py-3 text-sm capitalize text-slate-600">{rec.mood ?? "—"}</td>
      <td className="px-4 py-3 text-sm capitalize text-slate-600">{(rec.mobility ?? "—").replace(/-/g, " ")}</td>
      <td className="px-4 py-3 text-sm capitalize text-slate-600">{(rec.woundCondition ?? "—").replace(/-/g, " ")}</td>
      <td className="max-w-xs px-4 py-3 text-xs text-slate-500 truncate">{rec.notes ?? "—"}</td>
    </tr>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NursingPage() {
  const [form, setForm]             = useState<FormState>(EMPTY)
  const [errors, setErrors]         = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [submitErr, setSubmitErr]   = useState<string | null>(null)

  const [records, setRecords]       = useState<NursingRecord[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listErr, setListErr]       = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    setLoadingList(true)
    setListErr(null)
    try {
      setRecords(await fetchRecords())
    } catch (err) {
      setListErr(err instanceof Error ? err.message : "Failed to load records")
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { void fetchList() }, [fetchList])

  // ── Field change ────────────────────────────────────────────────────────────
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm((p) => ({ ...p, [name]: value }))
    if (errors[name as keyof FormState]) setErrors((p) => ({ ...p, [name]: undefined }))
  }

  // ── Validate ────────────────────────────────────────────────────────────────
  function validate(): boolean {
    const next: FieldErrors = {}
    if (!form.patientId.trim())   next.patientId  = "Patient ID is required"
    if (!form.nurseName.trim())   next.nurseName   = "Nurse name is required"
    if (form.pulse && isNaN(Number(form.pulse)))
      next.pulse = "Pulse must be a number"
    if (form.temperature && isNaN(Number(form.temperature)))
      next.temperature = "Temperature must be a number"
    if (form.painScore && (isNaN(Number(form.painScore)) || Number(form.painScore) < 0 || Number(form.painScore) > 10))
      next.painScore = "Pain score 0–10"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSuccessMsg(null)
    setSubmitErr(null)
    if (!validate()) return

    setSubmitting(true)
    try {
      const result = await postRecord(form)
      if (!result.ok) { setSubmitErr(result.error); return }

      setSuccessMsg(
        `✅ Nursing record saved for "${form.patientName || form.patientId}" (${result.source === "mock" ? "mock DB" : "database"})`
      )
      setForm(EMPTY)
      setErrors({})
      await fetchList()

      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setSuccessMsg(null), 5000)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Nursing Records</h1>
            <p className="mt-1 text-sm text-slate-500">
              Daily vitals & patient observations ·{" "}
              <span className="font-mono text-xs">POST /api/v1/nursing/records</span>
            </p>
          </div>
          <a
            href="/dashboard"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            ← Dashboard
          </a>
        </div>

        {/* ── Form ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-slate-800">New Nursing Record</h2>

          {successMsg && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="shrink-0">✅</span>
              <span>{successMsg}</span>
            </div>
          )}
          {submitErr && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <span className="shrink-0">⚠️</span>
              <span>Error: {submitErr}</span>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} noValidate>

            {/* Row 1 — Identity */}
            <div className="mb-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Patient & Nurse
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <FieldLabel required>Patient ID</FieldLabel>
                  <TextInput name="patientId" value={form.patientId} onChange={handleChange}
                    placeholder="e.g. P-1001 or UUID" error={errors.patientId} />
                </div>
                <div>
                  <FieldLabel>Patient Name</FieldLabel>
                  <TextInput name="patientName" value={form.patientName} onChange={handleChange}
                    placeholder="e.g. Ah Chong" />
                </div>
                <div>
                  <FieldLabel required>Nurse Name</FieldLabel>
                  <TextInput name="nurseName" value={form.nurseName} onChange={handleChange}
                    placeholder="e.g. Nurse Amy" error={errors.nurseName} />
                </div>
              </div>
            </div>

            {/* Row 2 — Vitals */}
            <div className="mb-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Vital Signs
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <FieldLabel>Blood Pressure</FieldLabel>
                  <TextInput name="bloodPressure" value={form.bloodPressure} onChange={handleChange}
                    placeholder="e.g. 120/80" />
                </div>
                <div>
                  <FieldLabel>Pulse (bpm)</FieldLabel>
                  <TextInput name="pulse" value={form.pulse} onChange={handleChange}
                    placeholder="e.g. 72" type="number" error={errors.pulse} />
                </div>
                <div>
                  <FieldLabel>Temperature (°C)</FieldLabel>
                  <TextInput name="temperature" value={form.temperature} onChange={handleChange}
                    placeholder="e.g. 36.8" type="number" error={errors.temperature} />
                </div>
                <div>
                  <FieldLabel>Oxygen (%)</FieldLabel>
                  <TextInput name="oxygen" value={form.oxygen} onChange={handleChange}
                    placeholder="e.g. 97%" />
                </div>
              </div>
            </div>

            {/* Row 3 — Assessment */}
            <div className="mb-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Patient Assessment
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <FieldLabel>Pain Score (0–10)</FieldLabel>
                  <TextInput name="painScore" value={form.painScore} onChange={handleChange}
                    placeholder="e.g. 3" type="number" error={errors.painScore} />
                </div>
                <div>
                  <FieldLabel>Appetite</FieldLabel>
                  <SelectInput name="appetite" value={form.appetite} onChange={handleChange}
                    options={APPETITE_OPTS} />
                </div>
                <div>
                  <FieldLabel>Mood / Consciousness</FieldLabel>
                  <SelectInput name="mood" value={form.mood} onChange={handleChange}
                    options={MOOD_OPTS} />
                </div>
                <div>
                  <FieldLabel>Mobility</FieldLabel>
                  <SelectInput name="mobility" value={form.mobility} onChange={handleChange}
                    options={MOBILITY_OPTS} />
                </div>
                <div>
                  <FieldLabel>Side Turning</FieldLabel>
                  <SelectInput name="sideTurning" value={form.sideTurning} onChange={handleChange}
                    options={SIDE_TURN_OPTS} />
                </div>
                <div>
                  <FieldLabel>Wound Condition</FieldLabel>
                  <SelectInput name="woundCondition" value={form.woundCondition} onChange={handleChange}
                    options={WOUND_OPTS} />
                </div>
              </div>
            </div>

            {/* Row 4 — Notes */}
            <div className="mb-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Clinical Notes
              </h3>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                placeholder="Additional observations, doctor notifications, handover notes…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
              >
                {submitting ? "Saving record…" : "Save Nursing Record"}
              </button>
              <button
                type="button"
                onClick={() => { setForm(EMPTY); setErrors({}); setSuccessMsg(null); setSubmitErr(null) }}
                className="text-sm text-slate-500 hover:text-slate-700 transition"
              >
                Clear form
              </button>
            </div>
          </form>
        </div>

        {/* ── Records list ── */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Nursing Records</h2>
              {!loadingList && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {records.length} record{records.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void fetchList()}
              disabled={loadingList}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition"
            >
              {loadingList ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {loadingList ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500 animate-pulse">
              Loading nursing records…
            </div>
          ) : listErr ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-semibold text-rose-600">⚠️ {listErr}</p>
              <p className="mt-1 text-xs text-slate-500">
                Ensure backend is running on <span className="font-mono">localhost:5000</span>
              </p>
            </div>
          ) : records.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No records yet — save the first one above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Time</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Nurse</th>
                    <th className="px-4 py-3">BP</th>
                    <th className="px-4 py-3">Pulse</th>
                    <th className="px-4 py-3">Temp</th>
                    <th className="px-4 py-3">O₂</th>
                    <th className="px-4 py-3">Pain</th>
                    <th className="px-4 py-3">Mood</th>
                    <th className="px-4 py-3">Mobility</th>
                    <th className="px-4 py-3">Wound</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => <RecordRow key={r.id} rec={r} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Data source: <span className="font-mono">POST/GET /api/v1/nursing/records</span> · mock database active
        </p>
      </div>
    </div>
  )
}
