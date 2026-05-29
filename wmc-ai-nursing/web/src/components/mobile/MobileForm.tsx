"use client"

import Link from "next/link"
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { getNurseName, setNurseName } from "../../lib/roleMode"

export function MobilePage({
  title,
  subtitle,
  accent = "bg-sky-600",
  children,
}: {
  title: string
  subtitle?: string
  accent?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className={`sticky top-0 z-30 ${accent} px-4 py-4 text-white shadow`}>
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Link
            href="/mobile"
            aria-label="Back to menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">{title}</h1>
            {subtitle ? <p className="text-xs text-white/80">{subtitle}</p> : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-5">{children}</main>
    </div>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  inputMode?: "text" | "decimal" | "numeric" | "tel"
  required?: boolean
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none"
      />
    </label>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  required?: boolean
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none"
      />
    </label>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  required?: boolean
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Big tappable choice chips (e.g. position left/right/supine). */
export function ChoiceChips({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  required?: boolean
}) {
  return (
    <div className="mb-4">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`min-h-[52px] rounded-xl border px-2 py-3 text-sm font-semibold active:scale-[0.97] ${
                active
                  ? "border-sky-600 bg-sky-600 text-white shadow"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Room input with debounced auto patient lookup. */
export function RoomPatientFields({
  room,
  setRoom,
  patientName,
  setPatientName,
}: {
  room: string
  setRoom: (v: string) => void
  patientName: string
  setPatientName: (v: string) => void
}) {
  const [looking, setLooking] = useState(false)

  useEffect(() => {
    const value = room.trim()
    if (!value) return
    const timer = window.setTimeout(async () => {
      setLooking(true)
      try {
        const res = await fetch(`/api/patient-by-room?room=${encodeURIComponent(value)}`)
        const json = await res.json().catch(() => null)
        if (json?.ok && json.patientName) setPatientName(json.patientName)
      } catch {
        // ignore lookup errors — nurse can type the name
      } finally {
        setLooking(false)
      }
    }, 500)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  return (
    <>
      <Field label="Room" value={room} onChange={setRoom} placeholder="e.g. 201" inputMode="text" required />
      <Field
        label={looking ? "Patient name (looking up…)" : "Patient name"}
        value={patientName}
        onChange={setPatientName}
        placeholder="Auto-filled from room"
      />
    </>
  )
}

export function NurseNameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field
      label="Nurse name"
      value={value}
      onChange={(v) => {
        onChange(v)
        if (v.trim()) setNurseName(v.trim())
      }}
      placeholder="Your name"
      required
    />
  )
}

export function useNurseName() {
  const [name, setName] = useState("")
  useEffect(() => {
    setName(getNurseName())
  }, [])
  return [name, setName] as const
}

export function SubmitBar({
  onSubmit,
  busy,
  label = "Submit",
}: {
  onSubmit: () => void
  busy: boolean
  label?: string
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
      <div className="mx-auto max-w-xl">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : null}
          {busy ? "Saving…" : label}
        </button>
      </div>
    </div>
  )
}

/** Full-screen success confirmation. */
export function SavedScreen({ onAgain, message = "Saved successfully" }: { onAgain: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-12 text-center">
      <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-600" />
      <p className="text-xl font-bold text-emerald-900">{message}</p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="min-h-[52px] rounded-2xl bg-emerald-600 text-base font-bold text-white active:scale-[0.98]"
        >
          Add another
        </button>
        <Link
          href="/mobile"
          className="min-h-[52px] rounded-2xl border border-slate-300 bg-white py-3.5 text-base font-semibold text-slate-700"
        >
          Back to menu
        </Link>
      </div>
    </div>
  )
}

export function ErrorNote({ error }: { error: string }) {
  if (!error) return null
  return <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
}
