"use client"

import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { analyzePatientNoteRisk, analyzePatientRisk, riskSeverity } from "../../../lib/aiRiskDetection"
import {
  CLINICAL_DATA_UPDATE_EVENT,
  getPatientById,
  PatientFormData,
  type Patient,
  updatePatient,
} from "../../../lib/patientManagement"
import {
  createEscalationFromNote,
  recordEscalationWhatsappTrigger,
  buildEscalationMessage,
  escalationSeverityTone,
  escalationStatusLabel,
  escalationStatusTone,
  listEscalationAuditLog,
  listEscalationsForPatient,
  setEscalationStatus,
  type EscalationAuditLogEntry,
  type EscalationRecord,
  type EscalationStatus,
} from "../../../lib/aiEscalations"
import {
  addNote,
  notesForPatient,
  NursingNote,
  validateNursingNoteInput,
} from "../../../lib/nursingNotes"
import { summarizeNursingNotes } from "../../../lib/nursingNoteAnalyzer"

const inputClass = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
const toastClass = "fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2"

function severityTone(level: "green" | "yellow" | "orange" | "red") {
  if (level === "red") return "bg-rose-100 text-rose-700 border-rose-200"
  if (level === "orange") return "bg-orange-100 text-orange-700 border-orange-200"
  if (level === "yellow") return "bg-amber-100 text-amber-700 border-amber-200"
  return "bg-emerald-100 text-emerald-700 border-emerald-200"
}

function riskTag(level: string) {
  const normalized = level.toLowerCase()
  if (normalized.includes("high") || normalized === "critical") return "bg-rose-100 text-rose-700"
  if (normalized.includes("medium")) return "bg-amber-100 text-amber-700"
  return "bg-emerald-100 text-emerald-700"
}

function trendTag(trend: "improving" | "stable" | "worsening") {
  if (trend === "improving") return "bg-emerald-100 text-emerald-700"
  if (trend === "worsening") return "bg-rose-100 text-rose-700"
  return "bg-slate-100 text-slate-700"
}

function signalSeverityTag(score: number) {
  return severityTone(riskSeverity(score))
}

function rehabilitationProgram(status: string) {
  if (status === "Active rehabilitation") {
    return {
      score: 78,
      statusLabel: "In program",
      milestones: [
        { label: "Transfer training", complete: true, value: 85 },
        { label: "Balance progression", complete: false, value: 72 },
        { label: "Gait support reduction", complete: false, value: 60 },
        { label: "Caregiver handover readiness", complete: false, value: 55 },
      ],
    }
  }

  if (status === "Long-term care") {
    return {
      score: 44,
      statusLabel: "Long-term maintenance",
      milestones: [
        { label: "Mobility-preserving routine", complete: true, value: 70 },
        { label: "Skin integrity rounds", complete: true, value: 90 },
        { label: "Safe transfer reinforcement", complete: false, value: 42 },
        { label: "Discharge planning", complete: false, value: 20 },
      ],
    }
  }

  if (status === "Hospice / comfort care") {
    return {
      score: 30,
      statusLabel: "Comfort-focused care",
      milestones: [
        { label: "Comfort mobility support", complete: true, value: 84 },
        { label: "Pain prevention plan", complete: true, value: 95 },
        { label: "Symptom escalation readiness", complete: true, value: 70 },
      ],
    }
  }

  return {
    score: 52,
    statusLabel: "Observation period",
    milestones: [
      { label: "Functional baseline review", complete: true, value: 70 },
      { label: "Exercise protocol adherence", complete: false, value: 50 },
      { label: "Nutrition recovery target", complete: false, value: 62 },
    ],
  }
}

function sortByDateDesc(left: NursingNote, right: NursingNote) {
  const leftTs = left.recordedAt || left.date
  const rightTs = right.recordedAt || right.date
  return rightTs.localeCompare(leftTs)
}

function toIsoNow() {
  return new Date().toISOString()
}

function formatTimestamp(value?: string) {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

type WorkflowMode = "note" | "vital" | "medication"

type Params = { params: { id: string } }

type NewNoteForm = Omit<NursingNote, "id" | "patientId"> & {
  date: string
  appetite: string
  mood: string
  noteText: string
  mobility: string
  bloodPressure: string
  bloodSugar: string
  urination: string
  bowelMovement: string
  skinCondition: string
  abnormalEvents: string
  nurseRemarks: string
  hydrationWatch: boolean
  painScore: string
  recordedAt: string
  recordedBy: string
}

type VitalForm = {
  date: string
  bloodPressure: string
  bloodSugar: string
  urination: string
  bowelMovement: string
  skinCondition: string
  recordedAt: string
  recordedBy: string
}

type ToastMessage = {
  id: number
  message: string
  type: "success" | "error" | "info"
}

type MedicationAuditForm = {
  recordedBy: string
  recordedAt: string
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function noteFormBase() {
  return {
    date: todayDate(),
    appetite: "",
    mood: "",
    noteText: "",
    mobility: "",
    bloodPressure: "",
    bloodSugar: "",
    urination: "",
    bowelMovement: "",
    skinCondition: "",
    abnormalEvents: "",
    nurseRemarks: "",
    hydrationWatch: false,
    painScore: "",
    recordedAt: toIsoNow(),
    recordedBy: "",
  }
}

function vitalFormBase() {
  return {
    date: todayDate(),
    bloodPressure: "",
    bloodSugar: "",
    urination: "",
    bowelMovement: "",
    skinCondition: "",
    recordedAt: toIsoNow(),
    recordedBy: "",
  }
}

function hasAnyVitalContent(form: VitalForm) {
  return (
    Boolean(form.bloodPressure.trim()) ||
    Boolean(form.bloodSugar.trim()) ||
    Boolean(form.urination.trim()) ||
    Boolean(form.bowelMovement.trim()) ||
    Boolean(form.skinCondition.trim())
  )
}

function toPatientPayload(patient: Patient): PatientFormData {
  return {
    fullName: patient.fullName,
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

function emitProfileToast(setToasts: Dispatch<SetStateAction<ToastMessage[]>>, type: ToastMessage["type"], message: string) {
  const id = Date.now()
  setToasts((previous) => [...previous, { id, message, type }])
  window.setTimeout(() => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id))
  }, 3000)
}

function groupByDate(notes: NursingNote[]) {
  const buckets: Record<string, NursingNote[]> = {}

  for (const note of notes) {
    const key = note.date
    if (!buckets[key]) buckets[key] = []
    buckets[key].push(note)
  }

  return Object.entries(buckets)
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([date, entries]) => ({ date, entries: entries.sort(sortByDateDesc) }))
}

export default function PatientProfilePage({ params }: Params) {
  const [patient, setPatient] = useState<Patient | null>(null)
  const [notes, setNotes] = useState<NursingNote[]>([])
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({})
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode | null>(null)
  const [noteForm, setNoteForm] = useState<NewNoteForm>(noteFormBase())
  const [vitalForm, setVitalForm] = useState<VitalForm>(vitalFormBase())
  const [medicationForm, setMedicationForm] = useState("")
  const [medicationAudit, setMedicationAudit] = useState<MedicationAuditForm>({
    recordedBy: "",
    recordedAt: toIsoNow(),
  })
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({})
  const [vitalErrors, setVitalErrors] = useState<Record<string, string>>({})
  const [vitalError, setVitalError] = useState("")
  const [medicationError, setMedicationError] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [savingVitals, setSavingVitals] = useState(false)
  const [savingMedication, setSavingMedication] = useState(false)
  const [noteError, setNoteError] = useState("")
  const [currentNurseOptions, setCurrentNurseOptions] = useState<string[]>([])
  const [patientEscalations, setPatientEscalations] = useState<EscalationRecord[]>([])
  const [patientEscalationLog, setPatientEscalationLog] = useState<EscalationAuditLogEntry[]>([])
  const [escalationSending, setEscalationSending] = useState<string>("")

  useEffect(() => {
    if (workflowMode) {
      console.log("[workflow] modal opened", workflowMode)
    } else {
      console.log("[workflow] modal closed")
    }
  }, [workflowMode])

  function refreshEscalations(foundPatient?: Patient | null) {
    const targetPatient = foundPatient || patient
    if (!targetPatient) {
      setPatientEscalations([])
      setPatientEscalationLog([])
      return
    }

    const escalations = listEscalationsForPatient(targetPatient.id)
    setPatientEscalations(escalations)
    setPatientEscalationLog(listEscalationAuditLog().filter((item) => item.patientId === targetPatient.id))
    return
  }

  useEffect(() => {
    const foundPatient = getPatientById(params.id)
    setPatient(foundPatient)
    if (foundPatient) {
      setMedicationForm(foundPatient.currentMedications || "")
      const defaultNurse = foundPatient.assignedNurse.trim() || "Unknown nurse"
      setMedicationAudit((previous) => ({
        ...previous,
        recordedBy: defaultNurse,
        recordedAt: toIsoNow(),
      }))
      setCurrentNurseOptions(Array.from(new Set([defaultNurse, "R.N. Patel", "Nurse Kim", "Nurse Lee", "Nurse Chan"])))
      const nextNoteForm = {
        ...noteFormBase(),
        recordedBy: defaultNurse,
        date: todayDate(),
      }
      setNoteForm(nextNoteForm)
      setVitalForm({
        ...vitalFormBase(),
        recordedBy: defaultNurse,
      })
      const latest = notesForPatient(foundPatient.id).sort(sortByDateDesc)
      setNotes(latest)
      refreshEscalations(foundPatient)
      const grouped = groupByDate(latest)
      const defaultExpanded = grouped.slice(0, 2).reduce<Record<string, boolean>>((next, entry) => {
        next[entry.date] = true
        return next
      }, {})
      setExpandedDays(defaultExpanded)
    }
  }, [params.id])

  useEffect(() => {
    const handler = () => {
      const refreshedPatient = getPatientById(params.id)
      if (refreshedPatient) setPatient(refreshedPatient)
      setNotes(notesForPatient(params.id).sort(sortByDateDesc))
      refreshEscalations(refreshedPatient)
    }
    window.addEventListener(CLINICAL_DATA_UPDATE_EVENT, handler)
    return () => window.removeEventListener(CLINICAL_DATA_UPDATE_EVENT, handler)
  }, [params.id])

  function refreshNotesFromStore() {
    if (!patient) return
    setNotes(notesForPatient(patient.id).sort(sortByDateDesc))
    refreshEscalations(patient)
  }

  const risk = useMemo(() => (patient ? analyzePatientRisk(patient) : null), [patient, notes])
  const aiWarningSummary = useMemo(() => {
    if (!risk) return [] as { label: string; action: string; warning: string; severity: ReturnType<typeof riskSeverity> }[]
    return risk.categories.map((category) => ({
      label: category.label,
      action: category.action,
      warning: category.warning,
      severity: riskSeverity(category.score),
    }))
  }, [risk])
  const medications = useMemo(
    () =>
      patient?.currentMedications
        ?.split("\n")[0]
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean) ?? [],
    [patient],
  )
  const rehab = useMemo(() => rehabilitationProgram(patient?.rehabilitationStatus ?? "Not in rehabilitation"), [patient])
  const latestNote = useMemo(() => notes[0], [notes])

  const sortedNotes = useMemo(() => [...notes].sort(sortByDateDesc), [notes])
  const riskHistory = useMemo(
    () => (patient ? sortedNotes.map((note) => analyzePatientNoteRisk(patient, note)) : []),
    [patient, sortedNotes],
  )
  const groupedNotes = useMemo(() => groupByDate(sortedNotes), [sortedNotes])
  const noteAnalysisSummary = useMemo(() => summarizeNursingNotes(sortedNotes, patient), [sortedNotes, patient])
  const latestAiNoteAnalysis = noteAnalysisSummary.entries[0]?.analysis ?? null
  const noteAnalysisById = useMemo(() => {
    const next = new Map<string, typeof latestAiNoteAnalysis>()
    for (const item of noteAnalysisSummary.entries) {
      next.set(item.noteId, item.analysis)
    }
    return next
  }, [noteAnalysisSummary])

  const timeline = riskHistory.slice(0, 8)
  const latestTimestamp = latestNote ? formatTimestamp(latestNote.recordedAt) : "No observations yet"
  const workflowTitle =
    workflowMode === "note"
      ? "Nursing note workflow"
      : workflowMode === "vital"
        ? "Vital signs workflow"
        : "Medication update workflow"

  const vitalRows = [
    { label: "Blood Pressure", value: latestNote?.bloodPressure || "—", unit: "mmHg" },
    { label: "Blood Sugar", value: latestNote?.bloodSugar || "—", unit: "mg/dL" },
    { label: "Appetite", value: latestNote?.appetite || "—", unit: "" },
    { label: "Mood", value: latestNote?.mood || "—", unit: "" },
    { label: "Urination", value: latestNote?.urination || "—", unit: "" },
    { label: "Bowel Movement", value: latestNote?.bowelMovement || "—", unit: "" },
    { label: "Skin Condition", value: latestNote?.skinCondition || "—", unit: "" },
  ]

  if (!patient) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-600">Patient profile was not found.</p>
          <Link href="/patients" className="mt-3 inline-block text-sm font-medium text-sky-700 hover:underline">
            Back to patient list
          </Link>
        </div>
      </main>
    )
  }

  function openWorkflow(mode: WorkflowMode) {
    setWorkflowMode(mode)
    if (!patient) return
    const asOf = toIsoNow()
    if (mode === "note") {
      setNoteForm((previous) => ({
        ...noteFormBase(),
        ...previous,
        date: todayDate(),
        recordedAt: asOf,
        recordedBy: previous.recordedBy || patient.assignedNurse,
      }))
      setNoteErrors({})
      setNoteError("")
    }
    if (mode === "vital") {
      setVitalForm((previous) => ({
        ...previous,
        date: todayDate(),
        recordedAt: asOf,
        recordedBy: previous.recordedBy || patient.assignedNurse,
      }))
      setVitalErrors({})
      setVitalError("")
    }
    if (mode === "medication") {
      setMedicationError("")
      setMedicationAudit((previous) => ({ ...previous, recordedAt: toIsoNow(), recordedBy: patient.assignedNurse || previous.recordedBy }))
    }
  }

  function openBrief(mode: WorkflowMode) {
    console.log("[workflow] openBrief", { mode })
    openWorkflow(mode)
  }

  function closeWorkflow() {
    setWorkflowMode(null)
  }

  function getAssignedNurseName(input: string) {
    const fallback = patient?.assignedNurse?.trim() || "Unknown nurse"
    const cleaned = input.trim()
    return cleaned || fallback
  }

  function toggleDate(date: string) {
    setExpandedDays((previous) => ({ ...previous, [date]: !previous[date] }))
  }

  function setField<K extends keyof NewNoteForm>(key: K, value: NewNoteForm[K]) {
    setNoteForm((previous) => ({ ...previous, [key]: value }))
  }

  function setVitalField<K extends keyof VitalForm>(key: K, value: VitalForm[K]) {
    setVitalForm((previous) => ({ ...previous, [key]: value }))
  }

  async function sendEscalationWhatsappAlert(escalation: EscalationRecord) {
    try {
      const message = buildEscalationMessage({
        patientName: escalation.patientName,
        room: escalation.room,
        riskScore: escalation.riskScore,
        severity: escalation.severity,
        reason: escalation.reason,
        triggerTerms: escalation.triggerTerms,
        noteText: escalation.noteText,
      })
      const response = await fetch("/api/integrations/wati/send-alert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: "nurse-supervisor",
          patientId: escalation.patientId,
          phoneNumber: "",
          patientName: escalation.patientName,
          room: escalation.room,
          riskType: "AI escalation",
          severity: escalation.severity,
          observation: escalation.noteText,
          recommendedAction: "Escalate for nurse + supervisor review and bedside reassessment.",
          nurseName: patient?.assignedNurse || "Unknown nurse",
          message,
          simulated: true,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || "Failed to send escalation message.")
      recordEscalationWhatsappTrigger(escalation.id, "AI Engine", true, `Simulation sent: ${payload.message?.slice(0, 120) || "ok"}`)
      return payload
    } catch (error) {
      recordEscalationWhatsappTrigger(escalation.id, "AI Engine", false, error instanceof Error ? error.message : "Escalation alert failed.")
      throw error
    }
  }

  async function escalateByRecord(escalation: EscalationRecord) {
    if (escalationSending === escalation.id) return
    setEscalationSending(escalation.id)
    try {
      const next = setEscalationStatus({
        id: escalation.id,
        status: "escalated",
        actor: patient?.assignedNurse || "AI Engine",
        note: "Automatic simulation trigger started.",
      })
      if (next) {
        await sendEscalationWhatsappAlert(next)
        emitProfileToast(setToasts, "success", `Simulation escalation message sent for ${next.patientName}.`)
        refreshEscalations(patient)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send simulated escalation message."
      emitProfileToast(setToasts, "error", message)
      refreshEscalations(patient)
    } finally {
      setEscalationSending("")
    }
  }

  function onEscalationStatusChange(escalation: EscalationRecord, nextStatus: EscalationStatus) {
    const updated = setEscalationStatus({
      id: escalation.id,
      status: nextStatus,
      actor: patient?.assignedNurse || "Nurse",
      note: `Status updated to ${escalationStatusLabel(nextStatus)} by ${patient?.assignedNurse || "Nurse"}.`,
    })
    if (!updated) return
    refreshEscalations(patient)
    emitProfileToast(setToasts, "success", "Escalation status updated.")
  }

  function handleAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingNote(true)
    setNoteError("")
    emitProfileToast(setToasts, "info", "Submitting nursing note...")
    setNoteErrors({})

    try {
      if (!patient) {
        setNoteError("Patient context lost. Reload the page and try again.")
        return
      }
      const recordedBy = getAssignedNurseName(noteForm.recordedBy)
      const payload: Omit<NursingNote, "id"> = {
        ...noteForm,
        patientId: patient.id,
        recordedAt: noteForm.recordedAt || toIsoNow(),
        recordedBy,
      }
      const nextErrors = validateNursingNoteInput(payload, { requirePatientId: true })
      if (Object.keys(nextErrors).length > 0) {
        setNoteErrors(nextErrors)
        return
      }
      const notes = addNote(payload)
      const savedNote = notes[0]
      refreshNotesFromStore()
      const noteRisk = analyzePatientNoteRisk(patient, payload)
      const escalation = createEscalationFromNote({
        patientId: patient.id,
        patientName: patient.fullName,
        room: patient.roomNumber || "—",
        note: savedNote,
        riskScore: noteRisk.totalScore,
      })
      if (escalation) {
        emitProfileToast(setToasts, "success", "AI escalation created. Simulation alert triggered.")
        void escalateByRecord(escalation)
      }
      if (noteRisk.categories.some((item) => item.label === "Fall risk" && item.score >= 45)) {
        emitProfileToast(setToasts, "success", "AI detected elevated fall risk")
      }
      console.log("[workflow] note saved", { patientId: patient.id, mode: "note", timestamp: payload.recordedAt })
      setNoteForm({ ...noteFormBase(), date: todayDate(), recordedBy: patient.assignedNurse })
      setNoteErrors({})
      closeWorkflow()
      emitProfileToast(setToasts, "success", "Nursing note submitted and risk profile refreshed.")
    } catch {
      setNoteError("Unable to save the nursing note. Try again.")
      emitProfileToast(setToasts, "error", "Unable to save nursing note. Try again.")
    } finally {
      setSavingNote(false)
    }
  }

  function handleAddVitals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patient) {
      setSavingVitals(false)
      return
    }
    setSavingVitals(true)
    setVitalError("")
    setVitalErrors({})

    try {
      emitProfileToast(setToasts, "info", "Submitting vital signs...")
      if (!hasAnyVitalContent(vitalForm)) {
        setVitalErrors({ content: "At least one vital sign entry is required." })
        return
      }
      const recordedBy = getAssignedNurseName(vitalForm.recordedBy)
      const payload: Omit<NursingNote, "id"> = {
        ...noteFormBase(),
        patientId: patient.id,
        date: vitalForm.date || todayDate(),
        recordedBy,
        recordedAt: vitalForm.recordedAt || toIsoNow(),
        bloodPressure: vitalForm.bloodPressure,
        bloodSugar: vitalForm.bloodSugar,
        urination: vitalForm.urination,
        bowelMovement: vitalForm.bowelMovement,
        skinCondition: vitalForm.skinCondition,
        nurseRemarks: "Vital signs update",
      }
      const nextErrors = validateNursingNoteInput(payload, { requirePatientId: true })
      if (Object.keys(nextErrors).length > 0) {
        setVitalErrors(nextErrors)
        return
      }
      const notes = addNote(payload)
      const savedNote = notes[0]
      refreshNotesFromStore()
      const noteRisk = analyzePatientNoteRisk(patient, payload)
      const escalation = createEscalationFromNote({
        patientId: patient.id,
        patientName: patient.fullName,
        room: patient.roomNumber || "—",
        note: savedNote,
        riskScore: noteRisk.totalScore,
      })
      if (escalation) {
        emitProfileToast(setToasts, "success", "AI escalation created from vital update. Simulation alert triggered.")
        void escalateByRecord(escalation)
      }
      console.log("[workflow] vitals saved", { patientId: patient.id, mode: "vital", timestamp: payload.recordedAt })
      setVitalForm({ ...vitalFormBase(), date: todayDate(), recordedBy: patient.assignedNurse, recordedAt: toIsoNow() })
      setVitalError("")
      closeWorkflow()
      emitProfileToast(setToasts, "success", "Vital signs captured and linked to latest AI risk review.")
    } catch {
      setVitalError("Unable to save vital signs. Try again.")
      emitProfileToast(setToasts, "error", "Unable to save vital signs. Try again.")
    } finally {
      setSavingVitals(false)
    }
  }

  async function handleSaveMedication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patient) {
      setSavingMedication(false)
      return
    }
    setSavingMedication(true)
    setMedicationError("")
    const payload = {
      ...toPatientPayload(patient),
      currentMedications: medicationForm.trim(),
    }
    const recordedBy = getAssignedNurseName(medicationAudit.recordedBy)
    const recordedAt = medicationAudit.recordedAt || toIsoNow()
    const cleanMedicationText = medicationForm.trim()
    const medicationAuditLine = `Medication update by ${recordedBy} at ${formatTimestamp(recordedAt)}`
    const medicationAuditPayload = cleanMedicationText ? `${cleanMedicationText}\n${medicationAuditLine}` : medicationAuditLine
    try {
      payload.currentMedications = medicationAuditPayload
      const updated = updatePatient(patient.id, payload)
      if (!updated) throw new Error("Patient not found")
      setPatient(updated)
      setMedicationForm(updated.currentMedications)
      const noteRecordAt = toIsoNow()
      const notes = addNote({
        patientId: patient.id,
        recordedBy,
        painScore: "",
        noteText: medicationAuditPayload,
        mobility: "No change in mobility status",
        date: medicationAudit.recordedAt ? medicationAudit.recordedAt.slice(0, 10) : todayDate(),
        recordedAt: noteRecordAt,
        appetite: "",
        mood: "",
        bloodPressure: "",
        bloodSugar: "",
        urination: "",
        bowelMovement: "",
        skinCondition: "",
        abnormalEvents: medicationAuditPayload,
        nurseRemarks: medicationAuditLine,
        hydrationWatch: false,
      })
      const savedNote = notes[0]
      const noteRisk = analyzePatientNoteRisk(patient, savedNote)
      const escalation = createEscalationFromNote({
        patientId: patient.id,
        patientName: patient.fullName,
        room: patient.roomNumber || "—",
        note: savedNote,
        riskScore: noteRisk.totalScore,
      })
      if (escalation) {
        emitProfileToast(setToasts, "success", "AI escalation created from medication update. Simulation alert triggered.")
        void escalateByRecord(escalation)
      }
      refreshNotesFromStore()
      setMedicationAudit((previous) => ({ ...previous, recordedBy, recordedAt }))
      emitProfileToast(setToasts, "success", "Medication profile updated successfully.")
      emitProfileToast(setToasts, "success", "Medication changes recorded for audit-ready workflow.")
      closeWorkflow()
    } catch {
      setMedicationError("Unable to save medication updates. Try again.")
      emitProfileToast(setToasts, "error", "Unable to save medication updates.")
    } finally {
      setSavingMedication(false)
    }
  }

  const riskHeader = risk ? severityTone(risk.severity) : severityTone("green")

  return (
    <main className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6">
      {toasts.length ? (
        <div className={toastClass} role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-lg border px-3 py-2 text-sm shadow ${
                toast.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : toast.type === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}
      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Patient Profile</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{patient.fullName}</h1>
            <p className="mt-1 text-slate-500">
              {patient.age} y/o • {patient.gender} • Admission: {patient.admissionDate} • Room {patient.roomNumber || "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/patients"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back to patients
            </Link>
            <span className={`rounded-full border px-3 py-2 text-sm font-semibold ${riskHeader}`}>AI risk: {risk?.severity ?? "green"}</span>
            <Link href={`/patients/${patient.id}/edit`} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Edit patient
            </Link>
            <button
              type="button"
              onClick={() => openWorkflow("note")}
              className="rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"
            >
              + New Nursing Note
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Diagnosis</p>
            <p className="mt-2 text-sm text-slate-800">{patient.diagnosis}</p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Assigned nurse</p>
            <p className="mt-2 text-sm text-slate-800">{patient.assignedNurse}</p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Mobility</p>
            <p className="mt-2 text-sm text-slate-800">{patient.mobilityStatus}</p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Family contact</p>
            <p className="mt-2 text-sm text-slate-800">{patient.familyContact}</p>
          </section>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Vital signs tracking</h2>
            <span className="text-xs text-slate-500">{latestNote ? `Latest note: ${formatTimestamp(latestNote.recordedAt)}` : "No notes yet"}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {vitalRows.map((row) => (
              <div key={row.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{row.label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{row.value}</p>
                {row.unit ? <p className="text-[11px] text-slate-500">{row.unit}</p> : null}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Hydration watch:
            <span
              className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs ${latestNote?.hydrationWatch ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}
            >
              {latestNote?.hydrationWatch ? "Active" : "Stable"}
            </span>
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Medications</h2>
          <div className="space-y-2">
            {medications.length === 0 ? (
              <p className="text-sm text-slate-500">No medications recorded.</p>
            ) : (
              medications.map((medicine) => (
                <div key={medicine} className="rounded-lg border border-slate-200 p-2 text-sm text-slate-700">
                  {medicine}
                </div>
              ))
            )}
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Feeding status</p>
            <p className="mt-1 text-sm text-slate-900">{patient.feedingStatus}</p>
          </div>
          <div className="mt-2 rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Toilet support</p>
            <p className="mt-1 text-sm text-slate-900">{patient.toiletAssistance}</p>
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Rehabilitation progress</h2>
              <p className="text-sm text-slate-500">Status: {patient.rehabilitationStatus}</p>
            </div>
            <span className="text-sm font-semibold text-slate-700">{rehab.score}% complete</span>
          </div>
          <p className="text-sm text-slate-600">{rehab.statusLabel}</p>
          <div className="mt-4 space-y-3">
            {rehab.milestones.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-700">{item.label}</span>
                  <span className={`rounded-full px-2 py-1 text-xs ${item.complete ? riskTag("good") : riskTag("medium")}`}>{item.value}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-sky-500" style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">AI risk history</h2>
          <p className="mb-3 text-sm text-slate-500">Risk trend from each nursing note entry.</p>
          <div className="space-y-2">
            {timeline.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No AI risk history yet. Add notes to start tracking.</p>
            ) : null}
            {timeline.map((item) => (
              <article key={`${item.noteId}-${item.at}`} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{item.at}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${riskTag(item.riskBadge)}`}>{item.riskBadge.toUpperCase()}</span>
                </div>
                <p className="text-sm text-slate-700">Score: {item.totalScore}</p>
                <p className="text-xs text-slate-500">Top signal: {(item.categories[0]?.label ?? "No signal")}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">AI note analysis</h2>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${trendTag(noteAnalysisSummary.trend)}`}>
              {noteAnalysisSummary.trend}
            </span>
          </div>
          {latestAiNoteAnalysis ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                Latest score: <span className="font-semibold text-slate-900">{latestAiNoteAnalysis.riskScore}</span> / Escalations{" "}
                <span className="font-semibold text-slate-900">{noteAnalysisSummary.escalationCount}</span> of{" "}
                <span className="font-semibold text-slate-900">{noteAnalysisSummary.count}</span>
              </p>
              <p className="text-sm text-slate-700">
                Highest score in history:{" "}
                <span className="font-semibold text-slate-900">{noteAnalysisSummary.highestScore}</span> • Average score:{" "}
                <span className="font-semibold text-slate-900">{noteAnalysisSummary.averageScore}</span>
              </p>
              <div className="rounded-xl border border-slate-100 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Top AI signals (latest note)</p>
                {latestAiNoteAnalysis.signals.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600">No high-risk signal detected in latest note.</p>
                ) : (
                  latestAiNoteAnalysis.signals.slice(0, 3).map((signal) => (
                    <div key={signal.label} className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-slate-900">{signal.label}</p>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{signal.escalation}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">Score: {signal.score}</p>
                      <p className="text-xs text-slate-600">{signal.reason}</p>
                    </div>
                  ))
                )}
              </div>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Recommended actions</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {latestAiNoteAnalysis.actions.slice(0, 4).map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No note analysis available. Add a note first.</p>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Clinical workflow actions</h2>
            <p className="text-sm text-slate-500">Use modal workflows for note, vitals, and medication updates.</p>
          </div>
          <p className="text-xs text-slate-500">Last observation: {latestTimestamp}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => openWorkflow("note")}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-900"
          >
            New nursing note
          </button>
          <button
            type="button"
            onClick={() => openWorkflow("vital")}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-900"
          >
            Add vital signs
          </button>
          <button
            type="button"
            onClick={() => openWorkflow("medication")}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-900"
          >
            Update medications
          </button>
        </div>
      </section>

      {workflowMode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45"
            aria-label="Close workflow modal"
            onClick={closeWorkflow}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{workflowTitle}</h2>
              <button type="button" onClick={closeWorkflow} className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700">
                Close
              </button>
            </div>

            {workflowMode === "note" ? (
              <form onSubmit={handleAddNote} className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-sm text-slate-600">
                    Note date
                    <input
                      type="date"
                      className={`${inputClass} mt-1 w-full ${noteErrors.date ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
                      value={noteForm.date}
                      onChange={(event) => setField("date", event.target.value)}
                    />
                  </label>
                  <label className="block text-sm text-slate-600">
                    Recorded at
                    <input
                      type="datetime-local"
                      className={`${inputClass} mt-1 w-full`}
                      value={noteForm.recordedAt.slice(0, 16)}
                      onChange={(event) => setField("recordedAt", `${event.target.value}:00.000Z`)}
                    />
                  </label>
                  <label className="block text-sm text-slate-600 md:col-span-2">
                    Nurse name
                    <input
                      className={`${inputClass} mt-1 w-full`}
                      value={noteForm.recordedBy}
                      list="workflow-nurse-list"
                      onChange={(event) => setField("recordedBy", event.target.value)}
                    />
                  </label>
                </div>
                {noteErrors.date ? <p className="text-xs text-rose-600">{noteErrors.date}</p> : null}
                <label className="block text-sm text-slate-600">
                  Note text
                  <textarea
                    rows={4}
                    className={`${inputClass} mt-1 w-full`}
                    value={noteForm.noteText}
                    onChange={(event) => setField("noteText", event.target.value)}
                    placeholder="Clinical note text for this observation"
                  />
                </label>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-sm text-slate-600">
                    Mood
                    <input className={`${inputClass} mt-1 w-full`} value={noteForm.mood} onChange={(event) => setField("mood", event.target.value)} />
                  </label>
                  <label className="text-sm text-slate-600">
                    Appetite
                    <input className={`${inputClass} mt-1 w-full`} value={noteForm.appetite} onChange={(event) => setField("appetite", event.target.value)} />
                  </label>
                  <label className="text-sm text-slate-600">
                    Mobility
                    <input className={`${inputClass} mt-1 w-full`} value={noteForm.mobility} onChange={(event) => setField("mobility", event.target.value)} />
                  </label>
                  <label className="text-sm text-slate-600">
                    Bowel movement
                    <input className={`${inputClass} mt-1 w-full`} value={noteForm.bowelMovement} onChange={(event) => setField("bowelMovement", event.target.value)} />
                  </label>
                  <label className="text-sm text-slate-600">
                    Urination
                    <input className={`${inputClass} mt-1 w-full`} value={noteForm.urination} onChange={(event) => setField("urination", event.target.value)} />
                  </label>
                  <label className="text-sm text-slate-600">
                    Pain score (0-10)
                    <input
                      type="number"
                      min={0}
                      max={10}
                      className={`${inputClass} mt-1 w-full`}
                      value={noteForm.painScore}
                      onChange={(event) => setField("painScore", event.target.value)}
                    />
                  </label>
                </div>
                {noteErrors.content ? <p className="text-xs text-rose-600">{noteErrors.content}</p> : null}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={closeWorkflow} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingNote} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {savingNote ? "Saving note..." : "Save nursing note"}
                  </button>
                </div>
                {noteError ? <p className="text-sm text-rose-600">{noteError}</p> : null}
              </form>
            ) : workflowMode === "vital" ? (
              <form onSubmit={handleAddVitals} className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-sm text-slate-600">
                    Vitals date
                    <input
                      type="date"
                      className={`${inputClass} mt-1 w-full ${vitalErrors.date ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
                      value={vitalForm.date}
                      onChange={(event) => setVitalField("date", event.target.value)}
                    />
                  </label>
                  <label className="block text-sm text-slate-600">
                    Recorded at
                    <input
                      type="datetime-local"
                      className={`${inputClass} mt-1 w-full`}
                      value={vitalForm.recordedAt.slice(0, 16)}
                      onChange={(event) => setVitalField("recordedAt", `${event.target.value}:00.000Z`)}
                    />
                  </label>
                  <label className="block text-sm text-slate-600 md:col-span-2">
                    Recorded by
                    <input className={`${inputClass} mt-1 w-full`} value={vitalForm.recordedBy} list="workflow-nurse-list" onChange={(event) => setVitalField("recordedBy", event.target.value)} />
                  </label>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-sm text-slate-600">
                    Blood pressure
                    <input className={`${inputClass} mt-1 w-full`} value={vitalForm.bloodPressure} onChange={(event) => setVitalField("bloodPressure", event.target.value)} placeholder="120/80" />
                  </label>
                  <label className="text-sm text-slate-600">
                    Blood sugar
                    <input className={`${inputClass} mt-1 w-full`} value={vitalForm.bloodSugar} onChange={(event) => setVitalField("bloodSugar", event.target.value)} placeholder="110" />
                  </label>
                  <label className="text-sm text-slate-600">
                    Urination
                    <input className={`${inputClass} mt-1 w-full`} value={vitalForm.urination} onChange={(event) => setVitalField("urination", event.target.value)} placeholder="clear/amber" />
                  </label>
                  <label className="text-sm text-slate-600">
                    Bowel movement
                    <input className={`${inputClass} mt-1 w-full`} value={vitalForm.bowelMovement} onChange={(event) => setVitalField("bowelMovement", event.target.value)} placeholder="regular" />
                  </label>
                  <label className="text-sm text-slate-600 md:col-span-2">
                    Skin condition
                    <input className={`${inputClass} mt-1 w-full`} value={vitalForm.skinCondition} onChange={(event) => setVitalField("skinCondition", event.target.value)} />
                  </label>
                </div>
                {vitalErrors.content ? <p className="text-xs text-rose-600">{vitalErrors.content}</p> : null}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={closeWorkflow} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingVitals} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {savingVitals ? "Saving vitals..." : "Save vital signs"}
                  </button>
                </div>
                {vitalError ? <p className="text-sm text-rose-600">{vitalError}</p> : null}
              </form>
            ) : null}

            {workflowMode === "medication" ? (
              <form onSubmit={handleSaveMedication} className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-slate-600 md:col-span-2">
                    Current medications (comma separated)
                    <textarea
                      rows={6}
                      className={`${inputClass} mt-1 w-full`}
                      value={medicationForm}
                      onChange={(event) => setMedicationForm(event.target.value)}
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Recorded at
                    <input
                      type="datetime-local"
                      className={`${inputClass} mt-1 w-full`}
                      value={medicationAudit.recordedAt.slice(0, 16)}
                      onChange={(event) =>
                        setMedicationAudit((previous) => ({
                          ...previous,
                          recordedAt: `${event.target.value}:00.000Z`,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Recorded by
                    <input
                      className={`${inputClass} mt-1 w-full`}
                      value={medicationAudit.recordedBy}
                      list="workflow-nurse-list"
                      onChange={(event) =>
                        setMedicationAudit((previous) => ({
                          ...previous,
                          recordedBy: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                {medicationError ? <p className="text-xs text-rose-600">{medicationError}</p> : null}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={closeWorkflow} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingMedication} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {savingMedication ? "Updating medications..." : "Update medication profile"}
                  </button>
                </div>
              </form>
            ) : null}

            <datalist id="workflow-nurse-list">
              {currentNurseOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        </div>
      ) : null}

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Nursing notes & timeline</h2>
          <button
            type="button"
            onClick={() => openBrief("note")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
          >
            + Add nursing note
          </button>
        </div>
        <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
          {groupedNotes.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No nursing notes recorded yet.</p>
          ) : null}
          {groupedNotes.map((group) => (
            <article key={group.date} className="rounded-xl border border-slate-200">
              <button
                type="button"
                className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-900"
                onClick={() => toggleDate(group.date)}
              >
                <span>{group.date}</span>
                <span className="text-xs text-slate-500">{group.entries.length} note(s)</span>
              </button>
              {expandedDays[group.date] ? (
                <div className="space-y-2 p-3">
                  {group.entries.map((note) => {
                    const noteAnalysis = noteAnalysisById.get(note.id)
                    return (
                      <div key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                        <p className="mb-1 text-slate-900 font-semibold">{note.noteText || "No note text provided"}</p>
                        <p className="text-xs text-slate-600">
                          Mood: {note.mood || "—"} • Appetite: {note.appetite || "—"} • Pain score: {note.painScore || "—"}
                        </p>
                        <p className="text-xs text-slate-600">Mobility: {note.mobility || "—"} • Urination: {note.urination || "—"} • Bowel movement: {note.bowelMovement || "—"}</p>
                        <p className="text-xs text-slate-600">
                          Recorded by {note.recordedBy || "Unknown nurse"} at {formatTimestamp(note.recordedAt)}
                        </p>
                        <p className="mt-2 text-xs text-slate-600">
                          AI note score: {noteAnalysis ? noteAnalysis.riskScore : "—"}{" "}
                          {noteAnalysis ? <span className={`rounded-full px-2 py-0.5 ${signalSeverityTag(noteAnalysis.riskScore)}`}>{riskSeverity(noteAnalysis.riskScore)}</span> : null} •
                          Escalate: {noteAnalysis?.escalate ? "Yes" : "No"}
                        </p>
                        <p className="text-xs text-slate-500">
                          Top signal: {noteAnalysis?.signals[0]?.label ?? "No signals flagged"}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">AI escalation timeline</h2>
          <span className="text-xs text-slate-500">Status workflow and simulation events</span>
        </div>
        {patientEscalations.length === 0 ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">No escalation workflow items for this patient yet.</p>
        ) : null}
        <div className="space-y-3">
          {patientEscalations.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {entry.patientName} • Score {entry.riskScore} • {entry.severity.toUpperCase()}
                  </p>
                  <p className="text-xs text-slate-600">Room {entry.room}</p>
                  <p className="mt-1 text-xs text-slate-600">{entry.reason}</p>
                  {entry.triggerTerms.length > 0 ? <p className="text-xs text-slate-500">Triggers: {entry.triggerTerms.join(", ")}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-1 text-xs ${escalationStatusTone(entry.status)}`}>{escalationStatusLabel(entry.status)}</span>
                  <span className={`rounded-full border px-2 py-1 text-xs ${escalationSeverityTone(entry.severity)}`}>severity {entry.severity}</span>
                  <button
                    type="button"
                    onClick={() => onEscalationStatusChange(entry, "nurse_review")}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    Nurse review
                  </button>
                  <button
                    type="button"
                    onClick={() => onEscalationStatusChange(entry, "supervisor_review")}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    Supervisor review
                  </button>
                  <button
                    type="button"
                    onClick={() => onEscalationStatusChange(entry, "resolved")}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => void escalateByRecord(entry)}
                    disabled={escalationSending === entry.id}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 disabled:opacity-60"
                  >
                    {escalationSending === entry.id ? "Sending..." : "Simulate WhatsApp"}
                  </button>
                </div>
              </div>
              <div className="mt-2 rounded-lg border border-slate-100 bg-white p-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-900">Timeline</p>
                {entry.timeline.length === 0 ? (
                  <p className="text-slate-500">No timeline entries yet.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {entry.timeline.map((timelineItem) => (
                      <li key={`${timelineItem.at}-${timelineItem.status}`} className="text-slate-600">
                        {formatTimestamp(timelineItem.at)} • {escalationStatusLabel(timelineItem.status)} by {timelineItem.actor} • {timelineItem.note}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Escalation audit log</h2>
        {patientEscalationLog.length === 0 ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">No audit entries yet.</p>
        ) : null}
        <ul className="space-y-2 text-sm">
          {patientEscalationLog.slice(0, 12).map((entry) => (
            <li key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-slate-700">
              <p className="font-semibold">{entry.patientName}</p>
              <p className="text-xs text-slate-600">
                {formatTimestamp(entry.timestamp)} • {entry.action} • {entry.actionDetail.type}
                {entry.actionDetail.type === "status-changed"
                  ? ` (${entry.actionDetail.previousStatus} → ${entry.actionDetail.nextStatus})`
                  : null}
              </p>
              <p className="text-xs text-slate-600">Actor: {entry.actionDetail.actor}</p>
              {entry.actionDetail.type === "whatsapp-trigger" ? <p className="text-xs text-slate-600">Result: {entry.actionDetail.success ? "success" : "failed"}</p> : null}
              {entry.actionDetail.details ? <p className="text-xs text-slate-600">Details: {entry.actionDetail.details}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">AI risk analysis (current)</h2>
        {risk ? (
          <article className={`rounded-xl border p-3 ${riskHeader}`}>
            <p className="text-xs uppercase tracking-wide">Overall Risk Score</p>
            <p className="mt-1 text-2xl font-bold">{risk.totalScore}</p>
              <p className="mt-1 text-sm">Escalation policy: {risk.riskBadge === "high" ? "Immediate review" : "Routine rounding + monitor"}</p>
          </article>
        ) : null}
      </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">AI warning summary</h2>
          {aiWarningSummary.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No warnings generated from current note history.</p>
          ) : (
            <div className="space-y-2">
              {aiWarningSummary.slice(0, 4).map((item) => (
                <div key={`${item.label}-${item.warning}`} className={`rounded-lg border p-3 ${severityTone(item.severity)}`}>
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-700">Signal: {item.warning}</p>
                  <p className="text-xs text-slate-700">Action: {item.action}</p>
                </div>
              ))}
            </div>
          )}
        </section>
    </main>
  )
}