"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPatient, listPatients, type PatientRecord } from "@/lib/api/central-backend.client"

// ── Options ───────────────────────────────────────────────────────────────────

const GENDER_OPTS    = ["male", "female", "other"] as const
const RISK_OPTS      = ["low", "medium", "high"] as const

const RISK_STYLE: Record<string, string> = {
  low:    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  medium: "bg-amber-50  text-amber-700  ring-1 ring-amber-200",
  high:   "bg-rose-50   text-rose-700   ring-1 ring-rose-200",
}

const RISK_DOT: Record<string, string> = {
  low:    "bg-emerald-500",
  medium: "bg-amber-500",
  high:   "bg-rose-500",
}

// ── Empty form ────────────────────────────────────────────────────────────────

type PatientForm = {
  fullName:      string
  age:           string
  gender:        string
  diagnosis:     string
  fallRiskLevel: string
  roomNumber:    string
}

const EMPTY: PatientForm = {
  fullName:      "",
  age:           "",
  gender:        "male",
  diagnosis:     "",
  fallRiskLevel: "low",
  roomNumber:    "",
}

type FieldErrors = Partial<Record<keyof PatientForm, string>>

// ── Patient card ──────────────────────────────────────────────────────────────

function PatientCard({ patient, isNew }: { patient: PatientRecord; isNew: boolean }) {
  const risk = patient.fallRiskLevel ?? "low"
  return (
    <div
      className={`relative rounded-2xl border bg-white p-4 shadow-sm transition-all ${
        isNew ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200"
      }`}
    >
      {isNew && (
        <span className="absolute right-3 top-3 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          New
        </span>
      )}

      {/* Name + room */}
      <div className="mb-3 pr-12">
        <p className="text-sm font-bold text-slate-900 leading-tight">{patient.fullName}</p>
        <p className="mt-0.5 font-mono text-xs text-slate-400">{patient.mrn ?? "—"}</p>
      </div>

      {/* Risk badge */}
      <span
        className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${RISK_STYLE[risk] ?? RISK_STYLE.low}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${RISK_DOT[risk] ?? RISK_DOT.low}`} />
        {risk.charAt(0).toUpperCase() + risk.slice(1)} risk
      </span>

      {/* Fields grid */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <span className="text-slate-400">Gender</span>
          <p className="font-medium capitalize text-slate-700">{patient.gender}</p>
        </div>
        <div>
          <span className="text-slate-400">Age</span>
          <p className="font-medium text-slate-700">{patient.age ?? "—"}</p>
        </div>
        <div>
          <span className="text-slate-400">Room</span>
          <p className="font-medium text-slate-700">{patient.roomNumber ?? "—"}</p>
        </div>
        <div>
          <span className="text-slate-400">Status</span>
          <p className={`font-medium ${patient.status === "active" ? "text-emerald-600" : "text-slate-500"}`}>
            {patient.status}
          </p>
        </div>
        {patient.diagnosis && (
          <div className="col-span-2">
            <span className="text-slate-400">Diagnosis</span>
            <p className="font-medium text-slate-700 leading-snug line-clamp-2">{patient.diagnosis}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  /** Called after a patient is successfully created — lets parent refresh metrics */
  onPatientCreated?: () => void
}

export function PatientInputSection({ onPatientCreated }: Props) {
  const [form, setForm]             = useState<PatientForm>(EMPTY)
  const [errors, setErrors]         = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [submitErr, setSubmitErr]   = useState<string | null>(null)
  const [showForm, setShowForm]     = useState(false)

  const [patients, setPatients]     = useState<PatientRecord[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [newId, setNewId]           = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    setLoadingList(true)
    try {
      const result = await listPatients()
      if (result) setPatients(result.patients)
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { void fetchList() }, [fetchList])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm((p) => ({ ...p, [name]: value }))
    if (errors[name as keyof PatientForm]) setErrors((p) => ({ ...p, [name]: undefined }))
  }

  function validate(): boolean {
    const next: FieldErrors = {}
    if (!form.fullName.trim())          next.fullName  = "Name is required"
    if (!form.age || isNaN(Number(form.age)) || Number(form.age) <= 0)
      next.age = "Valid age required"
    if (!form.diagnosis.trim())         next.diagnosis = "Diagnosis is required"
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
      const result = await createPatient({
        fullName:       form.fullName.trim(),
        age:            Number(form.age),
        gender:         form.gender,
        diagnosis:      form.diagnosis.trim(),
        fallRiskLevel:  form.fallRiskLevel,
        roomNumber:     form.roomNumber.trim() || "",
        mobilityStatus: "unknown",
      })

      if (!result.ok) { setSubmitErr(result.error); return }

      const created = result.data.patient
      setNewId(created.id)
      setSuccessMsg(`✅ ${created.fullName} added to patient records`)
      setForm(EMPTY)
      setErrors({})
      setShowForm(false)

      // Refresh list + tell parent to refresh metrics
      await fetchList()
      onPatientCreated?.()

      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { setSuccessMsg(null); setNewId(null) }, 6000)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <section className="mt-10">

      {/* Section header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Patients
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {loadingList ? "Loading…" : `${patients.length} patient${patients.length !== 1 ? "s" : ""} on record`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchList()}
            disabled={loadingList}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            {loadingList ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => { setShowForm((v) => !v); setSuccessMsg(null); setSubmitErr(null) }}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              showForm
                ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
          >
            {showForm ? "Cancel" : "+ Add Patient"}
          </button>
        </div>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>✅</span>
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error banner */}
      {submitErr && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>⚠️</span>
          <span>Error: {submitErr}</span>
        </div>
      )}

      {/* ── Inline form (collapsible) ── */}
      {showForm && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">New Patient</h3>
          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

              {/* Full name */}
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Patient Name <span className="text-rose-500">*</span>
                </label>
                <input
                  name="fullName" value={form.fullName} onChange={handleChange}
                  placeholder="e.g. Ahmad bin Ali"
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                    errors.fullName ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white"
                  }`}
                />
                {errors.fullName && <p className="mt-1 text-xs text-rose-600">{errors.fullName}</p>}
              </div>

              {/* Age */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Age <span className="text-rose-500">*</span>
                </label>
                <input
                  name="age" value={form.age} onChange={handleChange}
                  type="number" min={1} max={130} placeholder="e.g. 72"
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                    errors.age ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white"
                  }`}
                />
                {errors.age && <p className="mt-1 text-xs text-rose-600">{errors.age}</p>}
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</label>
                <select name="gender" value={form.gender} onChange={handleChange}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {GENDER_OPTS.map((o) => (
                    <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Risk level */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Risk Level</label>
                <select name="fallRiskLevel" value={form.fallRiskLevel} onChange={handleChange}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {RISK_OPTS.map((o) => (
                    <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Room */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Room</label>
                <input
                  name="roomNumber" value={form.roomNumber} onChange={handleChange}
                  placeholder="e.g. B-204"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>

              {/* Diagnosis — full width */}
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Diagnosis <span className="text-rose-500">*</span>
                </label>
                <input
                  name="diagnosis" value={form.diagnosis} onChange={handleChange}
                  placeholder="e.g. Type 2 diabetes, hypertension, fall risk"
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                    errors.diagnosis ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white"
                  }`}
                />
                {errors.diagnosis && <p className="mt-1 text-xs text-rose-600">{errors.diagnosis}</p>}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit" disabled={submitting}
                className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition"
              >
                {submitting ? "Saving…" : "Create Patient"}
              </button>
              <button
                type="button"
                onClick={() => { setForm(EMPTY); setErrors({}) }}
                className="text-sm text-slate-400 hover:text-slate-600 transition"
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Patient cards grid ── */}
      {loadingList ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : patients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <p className="text-sm text-slate-500">No patients yet</p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            + Add first patient
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {patients.map((p) => (
            <PatientCard key={p.id} patient={p} isNew={p.id === newId} />
          ))}
        </div>
      )}
    </section>
  )
}
