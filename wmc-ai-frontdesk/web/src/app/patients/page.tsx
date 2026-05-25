"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  createPatient,
  listPatients,
  type CreatePatientInput,
  type PatientRecord,
} from "@/lib/api/central-backend.client"

// ── Field option lists ────────────────────────────────────────────────────────

const GENDER_OPTIONS   = ["male", "female", "other"] as const
const MOBILITY_OPTIONS = ["independent", "assisted", "dependent", "bed-bound"] as const
const FALL_RISK_OPTIONS = ["low", "medium", "high"] as const

const FALL_RISK_COLORS: Record<string, string> = {
  low:    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  medium: "bg-amber-50  text-amber-700  ring-1 ring-amber-200",
  high:   "bg-rose-50   text-rose-700   ring-1 ring-rose-200",
}

// ── Empty form shape ──────────────────────────────────────────────────────────

const EMPTY_FORM: CreatePatientInput = {
  mrn:            "",
  fullName:       "",
  gender:         "male",
  age:            0,
  diagnosis:      "",
  roomNumber:     "",
  mobilityStatus: "independent",
  fallRiskLevel:  "low",
  phone:          "",
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </label>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const { error, className, ...rest } = props
  return (
    <>
      <input
        {...rest}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-400 ${
          error ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white"
        } ${className ?? ""}`}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </>
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { options: readonly string[] }) {
  const { options, className, ...rest } = props
  return (
    <select
      {...rest}
      className={`mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${className ?? ""}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.charAt(0).toUpperCase() + o.slice(1).replace("-", " ")}
        </option>
      ))}
    </select>
  )
}

// ── Patient list row ──────────────────────────────────────────────────────────

function PatientRow({ patient }: { patient: PatientRecord }) {
  const riskClass = FALL_RISK_COLORS[patient.fallRiskLevel ?? "low"] ?? FALL_RISK_COLORS.low
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 text-xs font-mono text-slate-500">{patient.mrn ?? "—"}</td>
      <td className="px-4 py-3 text-sm font-semibold text-slate-800">{patient.fullName}</td>
      <td className="px-4 py-3 text-sm text-slate-600 capitalize">{patient.gender}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{patient.age ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{patient.roomNumber ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{patient.diagnosis ?? "—"}</td>
      <td className="px-4 py-3 text-sm capitalize text-slate-600">
        {(patient.mobilityStatus ?? "—").replace("-", " ")}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${riskClass}`}>
          {(patient.fallRiskLevel ?? "low").charAt(0).toUpperCase() + (patient.fallRiskLevel ?? "low").slice(1)}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
          patient.status === "active"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-500"
        }`}>
          {patient.status}
        </span>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PatientsPage() {
  const [form, setForm]           = useState<CreatePatientInput>(EMPTY_FORM)
  const [errors, setErrors]       = useState<Partial<Record<keyof CreatePatientInput, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [patients, setPatients]   = useState<PatientRecord[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch patient list ──────────────────────────────────────────────────────
  const fetchPatients = useCallback(async () => {
    setLoadingList(true)
    setListError(null)
    try {
      const result = await listPatients()
      if (!result) throw new Error("Backend offline — could not load patients")
      setPatients(result.patients)
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load patients")
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    void fetchPatients()
  }, [fetchPatients])

  // ── Field change ────────────────────────────────────────────────────────────
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name as keyof CreatePatientInput]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const next: typeof errors = {}

    if (!form.fullName.trim()) next.fullName = "Full name is required"
    if (!form.age || isNaN(Number(form.age)) || Number(form.age) <= 0)
      next.age = "Age must be a positive number" as unknown as never
    if (Number(form.age) > 130) next.age = "Age seems unrealistic" as unknown as never
    if (!form.diagnosis?.trim()) next.diagnosis = "Diagnosis is required"

    setErrors(next)
    return Object.keys(next).length === 0
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSuccessMsg(null)
    setSubmitError(null)

    if (!validate()) return

    setSubmitting(true)
    try {
      const result = await createPatient({
        ...form,
        age: Number(form.age),
        mrn: form.mrn?.trim() || undefined,
      })

      if (!result.ok) {
        setSubmitError(result.error)
        return
      }

      const name = result.data.patient.fullName
      setSuccessMsg(`✅ Patient "${name}" created successfully (${result.data.source === "mock" ? "mock DB" : "database"})`)

      // Reset form
      setForm(EMPTY_FORM)
      setErrors({})

      // Refresh list
      await fetchPatients()

      // Auto-dismiss success after 5s
      if (successTimer.current) clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => setSuccessMsg(null), 5000)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">

        {/* ── Page header ── */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Patient Records</h1>
            <p className="mt-1 text-sm text-slate-500">
              Create and manage patient admissions · backend:{" "}
              <span className="font-mono text-xs">localhost:5000</span>
            </p>
          </div>
          <a
            href="/dashboard"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            ← Dashboard
          </a>
        </div>

        {/* ── Create patient form ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-slate-800">
            Create New Patient
          </h2>

          {/* Success / error banners */}
          {successMsg && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="shrink-0 text-base">✅</span>
              <span>{successMsg}</span>
            </div>
          )}
          {submitError && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <span className="shrink-0 text-base">⚠️</span>
              <span>Error: {submitError}</span>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

              {/* Patient ID / MRN */}
              <div>
                <Label>Patient ID / MRN</Label>
                <Input
                  name="mrn"
                  value={form.mrn ?? ""}
                  onChange={handleChange}
                  placeholder="Auto-generated if blank"
                />
              </div>

              {/* Full Name */}
              <div>
                <Label>Full Name <span className="text-rose-500">*</span></Label>
                <Input
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="e.g. Ahmad bin Ali"
                  error={errors.fullName}
                />
              </div>

              {/* Gender */}
              <div>
                <Label>Gender</Label>
                <Select
                  name="gender"
                  value={form.gender}
                  onChange={handleChange}
                  options={GENDER_OPTIONS}
                />
              </div>

              {/* Age */}
              <div>
                <Label>Age <span className="text-rose-500">*</span></Label>
                <Input
                  name="age"
                  type="number"
                  min={1}
                  max={130}
                  value={form.age || ""}
                  onChange={handleChange}
                  placeholder="e.g. 72"
                  error={errors.age}
                />
              </div>

              {/* Room Number */}
              <div>
                <Label>Room Number</Label>
                <Input
                  name="roomNumber"
                  value={form.roomNumber ?? ""}
                  onChange={handleChange}
                  placeholder="e.g. B-204"
                />
              </div>

              {/* Phone */}
              <div>
                <Label>Phone</Label>
                <Input
                  name="phone"
                  value={form.phone ?? ""}
                  onChange={handleChange}
                  placeholder="+60123456789"
                />
              </div>

              {/* Mobility Status */}
              <div>
                <Label>Mobility Status</Label>
                <Select
                  name="mobilityStatus"
                  value={form.mobilityStatus}
                  onChange={handleChange}
                  options={MOBILITY_OPTIONS}
                />
              </div>

              {/* Fall Risk Level */}
              <div>
                <Label>Fall Risk Level</Label>
                <Select
                  name="fallRiskLevel"
                  value={form.fallRiskLevel}
                  onChange={handleChange}
                  options={FALL_RISK_OPTIONS}
                />
              </div>

              {/* Diagnosis — full width */}
              <div className="sm:col-span-2 lg:col-span-3">
                <Label>Diagnosis <span className="text-rose-500">*</span></Label>
                <textarea
                  name="diagnosis"
                  value={form.diagnosis ?? ""}
                  onChange={handleChange}
                  rows={2}
                  placeholder="e.g. Hypertension, Type 2 diabetes, post-stroke rehab"
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none ${
                    errors.diagnosis
                      ? "border-rose-400 bg-rose-50"
                      : "border-slate-200 bg-white"
                  }`}
                />
                {errors.diagnosis && (
                  <p className="mt-1 text-xs text-rose-600">{errors.diagnosis}</p>
                )}
              </div>

            </div>

            {/* Submit */}
            <div className="mt-6 flex items-center gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
              >
                {submitting ? "Saving patient…" : "Create Patient"}
              </button>
              <button
                type="button"
                onClick={() => { setForm(EMPTY_FORM); setErrors({}); setSuccessMsg(null); setSubmitError(null) }}
                className="text-sm text-slate-500 hover:text-slate-700 transition"
              >
                Clear form
              </button>
            </div>
          </form>
        </div>

        {/* ── Patient list ── */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Patient List</h2>
              {!loadingList && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {patients.length} patient{patients.length !== 1 ? "s" : ""} on record
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void fetchPatients()}
              disabled={loadingList}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition"
            >
              {loadingList ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {loadingList ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500 animate-pulse">
              Loading patients…
            </div>
          ) : listError ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-semibold text-rose-600">⚠️ {listError}</p>
              <p className="mt-1 text-xs text-slate-500">
                Make sure the backend is running on{" "}
                <span className="font-mono">localhost:5000</span>
              </p>
            </div>
          ) : patients.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No patients yet — create the first one above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">MRN</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Gender</th>
                    <th className="px-4 py-3">Age</th>
                    <th className="px-4 py-3">Room</th>
                    <th className="px-4 py-3">Diagnosis</th>
                    <th className="px-4 py-3">Mobility</th>
                    <th className="px-4 py-3">Fall Risk</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <PatientRow key={p.id} patient={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Data source: <span className="font-mono">POST/GET /api/v1/patients</span> ·{" "}
          mock database active
        </p>
      </div>
    </div>
  )
}
