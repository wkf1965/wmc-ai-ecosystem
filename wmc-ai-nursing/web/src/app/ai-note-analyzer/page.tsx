"use client"

import { FormEvent, useMemo, useState } from "react"
import Link from "next/link"
import { listPatients, type Patient } from "../../lib/patientManagement"
import { addNote, validateNursingNoteInput } from "../../lib/nursingNotes"
import { NursingNoteAnalysis } from "../../lib/nursingNoteAnalyzer"

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
const sectionClass = "rounded-2xl border border-slate-200 bg-white p-5"

const baseNote = {
  date: new Date().toISOString().slice(0, 10),
  recordedAt: new Date().toISOString(),
  recordedBy: "",
  appetite: "",
  mood: "",
  noteText: "",
  mobility: "",
  bloodPressure: "",
  bloodSugar: "",
  urination: "",
  bowelMovement: "",
  skinCondition: "",
  painScore: "",
  abnormalEvents: "",
  nurseRemarks: "",
  hydrationWatch: false,
}

const toneClass = (tone: NursingNoteAnalysis["tone"]) => {
  if (tone === "high") return "bg-rose-100 text-rose-700 border-rose-200"
  if (tone === "medium") return "bg-amber-100 text-amber-700 border-amber-200"
  return "bg-emerald-100 text-emerald-700 border-emerald-200"
}

const escalationClass = (level: string) => {
  if (level === "escalate-now") return "bg-rose-100 text-rose-700"
  if (level === "monitor") return "bg-amber-100 text-amber-700"
  return "bg-slate-100 text-slate-700"
}

export default function AINursingNoteAnalyzerPage() {
  const patients: Patient[] = useMemo(() => listPatients(), [])
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "")
  const [form, setForm] = useState({ ...baseNote })
  const [hydrationWatch, setHydrationWatch] = useState(false)
  const [analysis, setAnalysis] = useState<NursingNoteAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

function clearForm() {
  setForm({
    date: new Date().toISOString().slice(0, 10),
    recordedAt: new Date().toISOString(),
    recordedBy: "",
    appetite: "",
    mood: "",
    noteText: "",
    mobility: "",
    bloodPressure: "",
    bloodSugar: "",
    urination: "",
    bowelMovement: "",
    skinCondition: "",
    painScore: "",
    abnormalEvents: "",
    nurseRemarks: "",
    hydrationWatch: false,
  })
  setHydrationWatch(false)
}

async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")
    setFormErrors({})
    setSaved("")
    const notePayload = { ...form, patientId, date: form.date || new Date().toISOString().slice(0, 10), hydrationWatch }
    const nextErrors = validateNursingNoteInput({ ...notePayload }, { requirePatientId: true })

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors)
      setLoading(false)
      return
    }

    try {
      const response = await fetch("/api/analyze-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patientId || undefined,
          note: {
            ...form,
            hydrationWatch,
          },
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error || "Unable to analyze note")
      }

      const payload = await response.json()
      setAnalysis(payload.result)
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Unexpected error while analyzing")
      setAnalysis(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveNote() {
    setSaving(true)
    setFormErrors({})
    setSaved("")
    setError("")

    const notePayload = { ...form, patientId, date: form.date || new Date().toISOString().slice(0, 10), hydrationWatch }
    const nextErrors = validateNursingNoteInput({ ...notePayload }, { requirePatientId: true })

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors)
      setSaving(false)
      return
    }

    try {
      addNote({
        ...notePayload,
        patientId,
        hydrationWatch,
      })
      setSaved("Note saved successfully.")
      clearForm()
    } catch {
      setError("Unable to save the nursing note.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">AI Tools</p>
          <h1 className="text-2xl font-bold text-slate-900">AI Nursing Note Analyzer</h1>
          <p className="text-sm text-slate-500">Run real-time risk inference from nursing note input fields.</p>
        </div>
        <Link href="/dashboard" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Back to dashboard
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={handleSubmit} className={`${sectionClass} xl:col-span-2`}>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Build note payload</h2>
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Resident</label>
              <select value={patientId} onChange={(event) => setPatientId(event.target.value)} className={inputClass}>
                {patients.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName} ({person.id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Note date</label>
              <input
                type="date"
                className={inputClass}
                value={form.date}
                onChange={(event) => setForm((state) => ({ ...state, date: event.target.value }))}
              />
              {formErrors.date ? <p className="mt-1 text-xs text-rose-600">{formErrors.date}</p> : null}
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="hydration"
                type="checkbox"
                checked={hydrationWatch}
                onChange={(event) => setHydrationWatch(event.target.checked)}
              />
              <label htmlFor="hydration" className="text-sm text-slate-700">
                Hydration watch
              </label>
            </div>
          </div>
          {formErrors.patientId ? <p className="mb-3 text-sm text-rose-600">{formErrors.patientId}</p> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              Appetite
              <input className={inputClass} value={form.appetite} onChange={(event) => setForm((state) => ({ ...state, appetite: event.target.value }))} />
            </label>
            <label className="text-sm">
              Mood
              <input className={inputClass} value={form.mood} onChange={(event) => setForm((state) => ({ ...state, mood: event.target.value }))} />
            </label>
            <label className="text-sm">
              Blood Pressure
              <input className={inputClass} value={form.bloodPressure} onChange={(event) => setForm((state) => ({ ...state, bloodPressure: event.target.value }))} />
            </label>
            <label className="text-sm">
              Blood Sugar
              <input className={inputClass} value={form.bloodSugar} onChange={(event) => setForm((state) => ({ ...state, bloodSugar: event.target.value }))} />
            </label>
            <label className="text-sm">
              Urination
              <input className={inputClass} value={form.urination} onChange={(event) => setForm((state) => ({ ...state, urination: event.target.value }))} />
            </label>
            <label className="text-sm">
              Bowel Movement
              <input className={inputClass} value={form.bowelMovement} onChange={(event) => setForm((state) => ({ ...state, bowelMovement: event.target.value }))} />
            </label>
            <label className="text-sm md:col-span-2">
              Skin Condition
              <textarea rows={2} className={`${inputClass} w-full`} value={form.skinCondition} onChange={(event) => setForm((state) => ({ ...state, skinCondition: event.target.value }))} />
            </label>
            <label className="text-sm md:col-span-2">
              Abnormal Events
              <textarea rows={2} className={`${inputClass} w-full`} value={form.abnormalEvents} onChange={(event) => setForm((state) => ({ ...state, abnormalEvents: event.target.value }))} />
            </label>
            <label className="text-sm md:col-span-2">
              Nurse Remarks
              <textarea rows={3} className={`${inputClass} w-full`} value={form.nurseRemarks} onChange={(event) => setForm((state) => ({ ...state, nurseRemarks: event.target.value }))} />
            </label>
          </div>

          {formErrors.content ? <p className="text-xs text-rose-600">{formErrors.content}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Analyzing..." : "Run AI analysis"}
            </button>
            <button
              type="button"
              onClick={handleSaveNote}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save nursing note"}
            </button>
          </div>
          {saved ? <p className="mt-3 text-sm text-emerald-700">{saved}</p> : null}
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        </form>

        <aside className={`${sectionClass}`}>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Clinical insight</h2>
          {!analysis ? (
            <p className="text-sm text-slate-500">
              Submit note data to generate risk score, signals, and escalation actions.
            </p>
          ) : (
            <div className="space-y-3">
              <div className={`rounded-xl border p-3 ${toneClass(analysis.tone)}`}>
                <p className="text-xs uppercase tracking-wide">Overall risk level</p>
                <p className="mt-1 text-3xl font-bold">{analysis.tone}</p>
                <p className="mt-2 text-sm">Score: {analysis.riskScore}</p>
                <p className="text-xs">{analysis.escalate ? "Immediate escalation recommended" : "Routine monitor pathway"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="mb-2 font-semibold text-slate-900">Top signals</p>
                {analysis.signals.length === 0 ? (
                  <p className="text-slate-500">No high-risk signal identified in this note.</p>
                ) : (
                  analysis.signals.slice(0, 4).map((signal) => (
                    <div key={signal.label} className="mb-2 rounded-lg bg-slate-50 p-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-slate-900">{signal.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${escalationClass(signal.escalation)}`}>{signal.escalation}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">Score: {signal.score}</p>
                      <p className="text-xs text-slate-600">{signal.reason}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="mb-2 font-semibold text-slate-900">Recommended actions</p>
                <ul className="list-disc space-y-1 pl-5 text-slate-700">
                  {analysis.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
