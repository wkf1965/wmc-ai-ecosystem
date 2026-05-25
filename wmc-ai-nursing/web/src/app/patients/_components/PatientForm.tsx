"use client"

import { FormEvent, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  createPatient,
  emptyPatientForm,
  FALL_RISK_OPTIONS,
  GENDER_OPTIONS,
  getPatientById,
  listAvailableRooms,
  PRESSURE_SORE_RISK_OPTIONS,
  REHAB_STATUS_OPTIONS,
  updatePatient,
  validatePatientForm,
} from "../../../lib/patientManagement"

type PatientFormFields = {
  fullName: string
  roomNumber: string
  age: string
  gender: string
  diagnosis: string
  admissionDate: string
  mobilityStatus: string
  feedingStatus: string
  toiletAssistance: string
  fallRisk: string
  pressureSoreRisk: string
  mentalStatus: string
  currentMedications: string
  familyContact: string
  assignedNurse: string
  rehabilitationStatus: string
}

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
const labelClass = "text-xs font-semibold uppercase tracking-wide text-slate-600"

export default function PatientForm({ patientId, mode }: { patientId?: string; mode: "create" | "edit" }) {
  const router = useRouter()
  const [form, setForm] = useState<PatientFormFields>(() => {
    if (mode === "edit" && patientId) {
      const patient = getPatientById(patientId)
      if (!patient) return emptyPatientForm()
      return {
        fullName: patient.fullName,
        roomNumber: patient.roomNumber || "",
        age: String(patient.age),
        gender: patient.gender,
        diagnosis: patient.diagnosis,
        admissionDate: patient.admissionDate,
        mobilityStatus: patient.mobilityStatus,
        feedingStatus: patient.feedingStatus,
        toiletAssistance: patient.toiletAssistance,
        fallRisk: patient.fallRisk as string,
        pressureSoreRisk: patient.pressureSoreRisk as string,
        mentalStatus: patient.mentalStatus,
        currentMedications: patient.currentMedications,
        familyContact: patient.familyContact,
        assignedNurse: patient.assignedNurse,
        rehabilitationStatus: patient.rehabilitationStatus,
      }
    }

    return emptyPatientForm()
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [roomEntryMode, setRoomEntryMode] = useState<"select" | "manual">("select")

  const patientMissing = useMemo(() => {
    if (mode === "create") return false
    if (!patientId) return true
    return !getPatientById(patientId)
  }, [mode, patientId])

  const availableRoomOptions = useMemo(() => {
    const list = listAvailableRooms(mode === "edit" ? patientId : undefined)
    const current = String(form.roomNumber || "").trim().toUpperCase()
    if (current && !list.includes(current)) {
      return [current, ...list]
    }
    return list
  }, [form.roomNumber, mode, patientId])

  const availableRoomsByWing = useMemo(() => {
    const groups: Record<string, string[]> = {}
    for (const room of availableRoomOptions) {
      const [wing] = room.split("-")
      const key = wing || "Other"
      if (!groups[key]) groups[key] = []
      groups[key].push(room)
    }
    return Object.entries(groups).sort(([left], [right]) => left.localeCompare(right))
  }, [availableRoomOptions])

  const shouldShowManualRoomInput = roomEntryMode === "manual" || availableRoomOptions.length === 0

  if (patientMissing) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Patient not found.</p>
        <Link href="/patients" className="mt-3 inline-block text-sm font-medium text-sky-700 hover:underline">
          Back to patients
        </Link>
      </div>
    )
  }

  function setField<K extends keyof PatientFormFields>(key: K, value: PatientFormFields[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => {
      if (!previous[key as string]) return previous
      const next = { ...previous }
      delete next[key as string]
      return next
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validatePatientForm(form, mode === "edit" ? patientId : undefined)
    setErrors(nextErrors)
    setSubmitError("")
    if (Object.keys(nextErrors).length > 0) return

    try {
      setIsSaving(true)
      if (mode === "create") {
        createPatient(form)
      } else if (patientId) {
        updatePatient(patientId, form)
      }
      setIsSaving(false)
      router.push("/patients")
    } catch {
      setIsSaving(false)
      setSubmitError("Unable to save patient. Please try again.")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Full name</label>
          <input
            className={`${inputClass} ${errors.fullName ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            value={form.fullName}
            onChange={(event) => setField("fullName", event.target.value)}
          />
          {errors.fullName ? <p className="mt-1 text-xs text-red-600">{errors.fullName}</p> : null}
        </div>
        <div>
          <label className={labelClass}>Room number</label>
          {!shouldShowManualRoomInput ? (
            <select
              className={`${inputClass} ${errors.roomNumber ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
              value={form.roomNumber}
              onChange={(event) => setField("roomNumber", event.target.value)}
            >
              <option value="" disabled>
                Total vacant rooms: {availableRoomOptions.length}
              </option>
              <option value="">Select vacant room</option>
              {availableRoomsByWing.map(([wing, rooms]) => (
                <optgroup key={wing} label={`Wing ${wing} (${rooms.length} available)`}>
                  {rooms.map((room) => (
                    <option key={room} value={room}>
                      {room}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : (
            <input
              className={`${inputClass} ${errors.roomNumber ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
              value={form.roomNumber}
              onChange={(event) => setField("roomNumber", event.target.value)}
              placeholder="e.g. A-201"
            />
          )}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setRoomEntryMode((previous) => (previous === "select" ? "manual" : "select"))}
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              {shouldShowManualRoomInput ? "Choose from vacant rooms" : "Enter room manually"}
            </button>
          </div>
          {errors.roomNumber ? <p className="mt-1 text-xs text-red-600">{errors.roomNumber}</p> : null}
        </div>
        <div>
          <label className={labelClass}>Age</label>
          <input
            className={`${inputClass} ${errors.age ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            type="number"
            min={0}
            value={form.age}
            onChange={(event) => setField("age", event.target.value)}
          />
          {errors.age ? <p className="mt-1 text-xs text-red-600">{errors.age}</p> : null}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Gender</label>
          <select
            className={`${inputClass} ${errors.gender ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            value={form.gender}
            onChange={(event) => setField("gender", event.target.value)}
          >
            <option value="">Select</option>
            {GENDER_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {errors.gender ? <p className="mt-1 text-xs text-red-600">{errors.gender}</p> : null}
        </div>
        <div>
          <label className={labelClass}>Admission date</label>
          <input
            className={`${inputClass} ${errors.admissionDate ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            type="date"
            value={form.admissionDate}
            onChange={(event) => setField("admissionDate", event.target.value)}
          />
          {errors.admissionDate ? <p className="mt-1 text-xs text-red-600">{errors.admissionDate}</p> : null}
        </div>
      </div>
      <div>
        <label className={labelClass}>Diagnosis</label>
        <input
          className={`${inputClass} ${errors.diagnosis ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
          value={form.diagnosis}
          onChange={(event) => setField("diagnosis", event.target.value)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Mobility status</label>
          <input
            className={`${inputClass} ${errors.mobilityStatus ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            value={form.mobilityStatus}
            onChange={(event) => setField("mobilityStatus", event.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Feeding status</label>
          <input
            className={`${inputClass} ${errors.feedingStatus ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            value={form.feedingStatus}
            onChange={(event) => setField("feedingStatus", event.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Toilet assistance</label>
          <input
            className={`${inputClass} ${errors.toiletAssistance ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            value={form.toiletAssistance}
            onChange={(event) => setField("toiletAssistance", event.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Mental status</label>
          <input
            className={`${inputClass} ${errors.mentalStatus ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            value={form.mentalStatus}
            onChange={(event) => setField("mentalStatus", event.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Fall risk</label>
          <select
            className={`${inputClass} ${errors.fallRisk ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            value={form.fallRisk}
            onChange={(event) => setField("fallRisk", event.target.value)}
          >
            {FALL_RISK_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Pressure sore risk</label>
          <select
            className={`${inputClass} ${errors.pressureSoreRisk ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            value={form.pressureSoreRisk}
            onChange={(event) => setField("pressureSoreRisk", event.target.value)}
          >
            {PRESSURE_SORE_RISK_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass}>Current medications</label>
        <textarea
          className={`${inputClass} ${errors.currentMedications ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
          rows={3}
          value={form.currentMedications}
          onChange={(event) => setField("currentMedications", event.target.value)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Family contact</label>
        <input
          className={`${inputClass} ${errors.familyContact ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
          value={form.familyContact}
          onChange={(event) => setField("familyContact", event.target.value)}
        />
        </div>
        <div>
          <label className={labelClass}>Assigned nurse</label>
          <input
            className={`${inputClass} ${errors.assignedNurse ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
            value={form.assignedNurse}
            onChange={(event) => setField("assignedNurse", event.target.value)}
          />
          {errors.assignedNurse ? <p className="mt-1 text-xs text-red-600">{errors.assignedNurse}</p> : null}
        </div>
      </div>
      <div>
        <label className={labelClass}>Rehabilitation status</label>
        <select
          className={`${inputClass} ${errors.rehabilitationStatus ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
          value={form.rehabilitationStatus}
          onChange={(event) => setField("rehabilitationStatus", event.target.value)}
        >
          {REHAB_STATUS_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
      <div className="flex items-center justify-between">
        <Link href="/patients" className="text-sm font-medium text-slate-700 hover:underline">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSaving ? "Saving..." : mode === "create" ? "Create patient" : "Save changes"}
        </button>
      </div>
    </form>
  )
}
