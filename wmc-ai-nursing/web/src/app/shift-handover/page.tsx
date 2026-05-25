"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ClipboardCopy,
  Clock3,
  FlagTriangleRight,
  FileText,
  Send,
  Printer,
  RefreshCw,
} from "lucide-react"
import { analyzePatientRisk, riskSeverity } from "../../lib/aiRiskDetection"
import { CLINICAL_DATA_UPDATE_EVENT, listPatients, Patient } from "../../lib/patientManagement"
import { notesForPatient, type NursingNote } from "../../lib/nursingNotes"
import { listEscalations, type EscalationRecord, escalationStatusTone, escalationSeverityTone } from "../../lib/aiEscalations"

type HandoverSection = "Urgent attention" | "Monitor closely" | "Routine care"
type ShiftWindow = "morning" | "evening" | "night"
type HandoverWorkflowStatus = "pending" | "acknowledged" | "completed"
type FollowUpStatus = "pending" | "acknowledged" | "completed"
type FollowUpAction = {
  id: string
  rowId: string
  patientName: string
  room: string
  text: string
  status: FollowUpStatus
  severity: ReturnType<typeof riskSeverity>
}

type VitalsSnapshot = {
  bloodPressure: string
  bloodSugar: string
  urination: string
  bowelMovement: string
  mobility: string
  noteText: string
  abnormalEvents: string
  hydrationWatch: boolean
  recordedAt: string
}

type HandoverPatient = {
  patient: Patient
  room: string
  risk: ReturnType<typeof analyzePatientRisk>
  severity: ReturnType<typeof riskSeverity>
  section: HandoverSection
  latestAt: string
  vitals: VitalsSnapshot
  categories: string[]
  medicationReminders: string[]
  familyUpdateNeeded: boolean
  needsNightMonitoring: boolean
  shift: ShiftWindow
  aiAlerts: string[]
  escalations: EscalationRecord[]
  hasMoodBehaviorSignal: boolean
  moodBehaviorLines: string[]
  hasFallRisk: boolean
  hasDehydration: boolean
  hasConfusion: boolean
}

type ShiftHandoverSummary = {
  shift: ShiftWindow
  generatedAt: string
  urgent: HandoverPatient[]
  monitor: HandoverPatient[]
  routine: HandoverPatient[]
  highRisk: HandoverPatient[]
  fallRisk: HandoverPatient[]
  dehydration: HandoverPatient[]
  medicationReminders: string[]
  nightMonitoring: HandoverPatient[]
  familyUpdates: HandoverPatient[]
  newEscalations: EscalationRecord[]
  moodBehaviorObservations: string[]
  followUpActions: FollowUpAction[]
  recommendations: string[]
  aiAlerts: string[]
  checklist: string[]
  workflowStatus: HandoverWorkflowStatus
}

const metricCards = [
  {
    title: "Residents on roster",
    tone: "emerald",
    icon: FileText,
  },
  {
    title: "Critical patients",
    tone: "rose",
    icon: AlertTriangle,
  },
  {
    title: "New escalations",
    tone: "amber",
    icon: Clock3,
  },
  {
    title: "Mood/behavior alerts",
    tone: "amber",
    icon: FlagTriangleRight,
  },
]

const toneStyles: Record<string, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  rose: "border-rose-200 bg-rose-50 text-rose-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
}

const shiftOptions: { key: ShiftWindow; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "evening", label: "Evening" },
  { key: "night", label: "Night" },
]

const workflowStyles: Record<FollowUpStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  acknowledged: "bg-sky-100 text-sky-800 border-sky-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
}

const shiftToneByStatus: Record<FollowUpStatus, string> = workflowStyles

const riskToneStyles: Record<ReturnType<typeof riskSeverity>, string> = {
  green: "bg-emerald-100 text-emerald-700",
  yellow: "bg-amber-100 text-amber-700",
  orange: "bg-orange-100 text-orange-700",
  red: "bg-rose-100 text-rose-700",
}

function inShiftWindow(targetIso: string, shift: ShiftWindow) {
  const parsed = new Date(targetIso)
  if (Number.isNaN(parsed.getTime())) return false
  const hour = parsed.getHours()
  if (shift === "morning") return hour >= 6 && hour < 14
  if (shift === "evening") return hour >= 14 && hour < 22
  return hour >= 22 || hour < 6
}

function latestVitalSnapshot(notes: NursingNote[], shift: ShiftWindow) {
  const sorted = notes.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
  const shiftNotes = sorted.filter((note) => inShiftWindow(note.recordedAt, shift))
  const latest = shiftNotes[0] || sorted[0]
  if (!latest) {
    return {
      bloodPressure: "No update",
      bloodSugar: "No update",
      urination: "No update",
      bowelMovement: "No update",
      mobility: "No update",
      noteText: "No recent note",
      abnormalEvents: "None",
      hydrationWatch: false,
      recordedAt: "",
    }
  }
  return {
    bloodPressure: latest.bloodPressure || "Not recorded",
    bloodSugar: latest.bloodSugar || "Not recorded",
    urination: latest.urination || "No update",
    bowelMovement: latest.bowelMovement || "No update",
    mobility: latest.mobility || "Not recorded",
    noteText: latest.noteText || latest.nurseRemarks || "No detailed note",
    abnormalEvents: latest.abnormalEvents || "No acute events",
    hydrationWatch: latest.hydrationWatch || false,
    recordedAt: latest.recordedAt,
  }
}

function medicationItems(rawValue: string) {
  return rawValue
    .split(/,|\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function containsAny(source: string, terms: string[]) {
  const lower = source.toLowerCase()
  return terms.some((term) => lower.includes(term))
}

function collectRows(shift: ShiftWindow) {
  const allEscalations = listEscalations()
  return listPatients().map((patient) => {
    const patientNotes = notesForPatient(patient.id).sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    const risk = analyzePatientRisk(patient)
    const vitals = latestVitalSnapshot(patientNotes, shift)
    const categories = risk.categories.map((item) => item.label)
    const section: HandoverSection =
      risk.severity === "red" || risk.severity === "orange" ? "Urgent attention" : risk.severity === "yellow" ? "Monitor closely" : "Routine care"
    const noteSignalText = `${vitals.noteText} ${vitals.abnormalEvents}`.toLowerCase()
    const lowerCategories = categories.map((item) => item.toLowerCase())
    const hasFallRisk = lowerCategories.includes("fall risk")
    const hasDehydration = lowerCategories.includes("dehydration")
    const hasConfusion = lowerCategories.includes("emotional distress") || containsAny(noteSignalText, ["confusion", "confused", "disoriented"])
    const familyUpdateNeeded =
      risk.severity === "red" ||
      containsAny(noteSignalText, ["family", "confused", "agitated", "tearful", "emotional distress", "anxious"])
    const needsNightMonitoring =
      patient.fallRisk === "High" || containsAny(noteSignalText, ["night", "evening", "disoriented", "confusion", "agitated"])
    const shiftEscalations = allEscalations.filter((entry) => entry.patientId === patient.id && inShiftWindow(entry.createdAt, shift))
    const moodBehaviorLines = [
      ...patientNotes.map((note) => `${note.mood} ${note.nurseRemarks} ${note.abnormalEvents}`),
      `${vitals.noteText}`,
    ]
      .filter(Boolean)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 2)
    const categoryFlags = categories.map((item) => item.toLowerCase())

    return {
      patient,
      room: patient.roomNumber || "—",
      risk,
      severity: risk.severity,
      section,
      latestAt: vitals.recordedAt,
      vitals,
      categories: categoryFlags,
      medicationReminders: medicationItems(patient.currentMedications || ""),
      familyUpdateNeeded,
      needsNightMonitoring,
      shift,
      aiAlerts: categories,
      escalations: shiftEscalations,
      hasMoodBehaviorSignal: moodBehaviorLines.length > 0,
      moodBehaviorLines,
      hasFallRisk,
      hasDehydration,
      hasConfusion,
    }
  })
}

function buildSummary(rows: HandoverPatient[], shift: ShiftWindow): ShiftHandoverSummary {
  const shiftRows = rows.filter((entry) => entry.shift === shift)
  const urgent = shiftRows.filter((entry) => entry.section === "Urgent attention")
  const monitor = shiftRows.filter((entry) => entry.section === "Monitor closely")
  const routine = shiftRows.filter((entry) => entry.section === "Routine care")
  const highRisk = shiftRows.filter((entry) => ["orange", "red"].includes(entry.severity))
  const fallRisk = shiftRows.filter((entry) => entry.categories.includes("fall risk"))
  const dehydration = shiftRows.filter((entry) => entry.categories.includes("dehydration"))
  const nightMonitoring = shiftRows.filter((entry) => entry.needsNightMonitoring)
  const familyUpdates = shiftRows.filter((entry) => entry.familyUpdateNeeded)
  const newEscalations = shiftRows.flatMap((entry) => entry.escalations)
  const moodBehaviorObservations = shiftRows
    .filter((entry) => entry.hasMoodBehaviorSignal)
    .flatMap((entry) => entry.moodBehaviorLines.map((line) => `${entry.patient.fullName} (${entry.room}): ${line}`))

  const followUpActions = shiftRows.flatMap((entry, index) => {
    const actions = [
      ...(!entry.familyUpdateNeeded ? [] : [`Confirm family communication for ${entry.patient.fullName} (${entry.room}).`]),
      ...(!entry.needsNightMonitoring ? [] : [`Assign additional night round for ${entry.patient.fullName} (${entry.room}).`]),
      ...(!entry.hasConfusion ? [] : [`Reassess confusion and orientation for ${entry.patient.fullName} (${entry.room}).`]),
      ...(!entry.hasFallRisk ? [] : [`Escalate fall-prevention and transfer support for ${entry.patient.fullName} (${entry.room}).`]),
      ...(!entry.hasDehydration ? [] : [`Hydration and intake review for ${entry.patient.fullName} (${entry.room}).`]),
      ...(!entry.escalations.length ? [] : [`Track escalation status and close loop for ${entry.patient.fullName} (${entry.room}).`]),
    ]
    return actions.map((action, actionIndex) => ({
      id: `${entry.patient.id}-${index}-${actionIndex}-${new Date(entry.latestAt || Date.now()).toISOString()}`,
      rowId: entry.patient.id,
      patientName: entry.patient.fullName,
      room: entry.room,
      text: action,
      status: "pending" as FollowUpStatus,
      severity: entry.severity,
    }))
  })

  const medicationReminders = shiftRows.flatMap((entry) =>
    entry.medicationReminders.map((reminder) => `${entry.patient.fullName} (${entry.room}) • ${reminder}`),
  )
  const aiAlertSource = shiftRows.flatMap((entry) => entry.aiAlerts.map((alert) => `${entry.patient.fullName} (${entry.room}) • ${alert}`))

  const recommendations = [
    ...highRisk.map((entry) => `Immediate review required for ${entry.patient.fullName} (${entry.room}) with severity ${entry.risk.riskBadge}.`),
    ...fallRisk.map((entry) => `Keep assisted transfer protocol active for ${entry.patient.fullName} (${entry.room}) during this shift.`),
    ...dehydration.map((entry) => `Increase hydration and intake tracking for ${entry.patient.fullName} (${entry.room}).`),
    ...familyUpdates.map((entry) => `Use one-touch family update for ${entry.patient.fullName} (${entry.room}).`),
  ]

  const checklist = [
    ...urgent.map((entry) => `Reassess ${entry.patient.fullName} (${entry.room}) within 15 minutes and confirm transfer safety.`),
    ...dehydration.map((entry) => `Hydration check for ${entry.patient.fullName} (${entry.room}) with intake/output review.`),
    ...nightMonitoring.map((entry) => `Assign one additional night rounding check for ${entry.patient.fullName} (${entry.room}).`),
    ...familyUpdates.map((entry) => `Contact family for ${entry.patient.fullName} handover update before shift end.`),
  ]

  return {
    shift,
    generatedAt: new Date().toLocaleString(),
    urgent,
    monitor,
    routine,
    highRisk,
    fallRisk,
    dehydration,
    medicationReminders,
    nightMonitoring,
    familyUpdates,
    newEscalations,
    moodBehaviorObservations,
    followUpActions,
    recommendations: [...new Set(recommendations)],
    aiAlerts: aiAlertSource,
    checklist: [...new Set(checklist)],
    workflowStatus: "pending",
  }
}

function renderLines(title: string, lines: string[]) {
  return (
    <ul className="mt-2 space-y-1">
      <li className="text-sm font-semibold text-slate-700">{title}</li>
      {lines.length === 0 ? <li className="text-sm text-slate-500">- none</li> : lines.map((line) => <li key={line} className="text-sm text-slate-700">- {line}</li>)}
    </ul>
  )
}

export default function ShiftHandoverPage() {
  const [shift, setShift] = useState<ShiftWindow>("morning")
  const [rows, setRows] = useState<HandoverPatient[]>([])
  const [summary, setSummary] = useState<ShiftHandoverSummary | null>(null)
  const [handoverText, setHandoverText] = useState("")
  const [status, setStatus] = useState("")
  const [supervisorMessage, setSupervisorMessage] = useState("")
  const [workflowStatus, setWorkflowStatus] = useState<HandoverWorkflowStatus>("pending")
  const [followUpActions, setFollowUpActions] = useState<FollowUpAction[]>([])

  const refresh = () => setRows(collectRows(shift))

  const shiftRows = useMemo(() => rows.filter((entry) => entry.shift === shift), [rows, shift])
  const activeSummary = useMemo(() => buildSummary(rows, shift), [rows, shift])

  function reconcileFollowUp(next: FollowUpAction[]) {
    if (!followUpActions.length) return next
    const statusMap = new Map(followUpActions.map((item) => [item.id, item.status]))
    return next.map((item) => ({
      ...item,
      status: statusMap.get(item.id) || item.status,
    }))
  }

  useEffect(() => {
    const next = buildSummary(rows, shift)
    if (summary) {
      const syncedFollowUp = reconcileFollowUp(next.followUpActions)
      setSummary({ ...next, followUpActions: syncedFollowUp, workflowStatus })
      setFollowUpActions(syncedFollowUp)
      if (handoverText) setHandoverText(buildHandoverText({ ...next, followUpActions: syncedFollowUp, workflowStatus }))
      return
    }
    setSummary(next)
    setFollowUpActions(next.followUpActions)
  }, [rows, shift, workflowStatus])

  useEffect(() => {
    refresh()
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("wmc_nursing_")) refresh()
    }
    const onUpdate = () => refresh()
    window.addEventListener("storage", onStorage)
    window.addEventListener(CLINICAL_DATA_UPDATE_EVENT, onUpdate)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(CLINICAL_DATA_UPDATE_EVENT, onUpdate)
    }
  }, [shift])

  function updateWorkflowStatus(next: HandoverWorkflowStatus) {
    setWorkflowStatus(next)
    if (!summary) return
    const updated: ShiftHandoverSummary = { ...summary, workflowStatus: next }
    setSummary(updated)
    setStatus(`Handover status updated to ${next}.`)
    setHandoverText(buildHandoverText(updated))
    if (next === "completed") setSupervisorMessage(`Handover completed at ${new Date().toLocaleString()}`)
  }

  function updateFollowUpStatus(actionId: string, next: FollowUpStatus) {
    setFollowUpActions((current) => {
      const nextState = current.map((entry) => (entry.id === actionId ? { ...entry, status: next } : entry))
      if (!summary) return nextState
      const nextSummary: ShiftHandoverSummary = {
        ...summary,
        followUpActions: nextState,
      }
      setSummary(nextSummary)
      setHandoverText(buildHandoverText(nextSummary))
      return nextState
    })
  }

  const criticalRows = shiftRows.filter((entry) => ["orange", "red"].includes(entry.severity))
  const escalationRows = activeSummary.newEscalations
  const moodCount = shiftRows.filter((entry) => entry.hasConfusion).length

  const cards = useMemo(() => {
    return [
      {
        ...metricCards[0],
        value: shiftRows.length,
      },
      {
        ...metricCards[1],
        value: criticalRows.length,
      },
      {
        ...metricCards[2],
        value: escalationRows.length,
      },
      {
        ...metricCards[3],
        value: moodCount,
      },
    ]
  }, [criticalRows.length, escalationRows.length, moodCount, shiftRows.length, shiftRows])

  function buildHandoverText(data: ShiftHandoverSummary) {
    const pendingFollowUp = data.followUpActions.filter((entry) => entry.status !== "completed")
    return [
      "AI Shift Handover Summary",
      `Shift: ${shift.toUpperCase()}`,
      `Generated: ${data.generatedAt}`,
      `Overall workflow status: ${data.workflowStatus}`,
      "",
      `Critical patients: ${data.highRisk.length}`,
      ...data.highRisk.map((entry) => `${entry.patient.fullName} (${entry.room}) - score ${entry.risk.totalScore} / ${entry.risk.riskBadge}`),
      "",
      `New escalations: ${data.newEscalations.length}`,
      ...data.newEscalations.map((item) => `${item.patientName} (${item.room}) - ${item.status} - ${item.severity}`),
      "",
      "Medication reminders:",
      ...data.medicationReminders.map((line) => `- ${line}`),
      "",
      `Fall risk patients: ${data.fallRisk.length}`,
      ...data.fallRisk.map((entry) => `${entry.patient.fullName} (${entry.room})`),
      "",
      "Mood/behavior observations:",
      ...(data.moodBehaviorObservations.length
        ? data.moodBehaviorObservations.map((line) => `- ${line}`)
        : ["- none"]),
      "",
      "AI alerts:",
      ...(data.aiAlerts.length ? data.aiAlerts.map((entry) => `- ${entry}`) : ["- none"]),
      "",
      "AI recommendations:",
      ...(data.recommendations.length ? data.recommendations.map((entry) => `- ${entry}`) : ["- none"]),
      "",
      "Pending follow-up actions:",
      ...(pendingFollowUp.length ? pendingFollowUp.map((item) => `- ${item.text}`) : ["- no pending actions"]),
      "",
      "Nurse action checklist:",
      ...data.checklist.map((line) => `- ${line}`),
    ].join("\n")
  }

  function generateSummary() {
    const generated = buildSummary(rows, shift)
    const withWorkflow: ShiftHandoverSummary = { ...generated, workflowStatus }
    const reconciledFollowUp = reconcileFollowUp(withWorkflow.followUpActions)
    const reconciled: ShiftHandoverSummary = {
      ...withWorkflow,
      followUpActions: reconciledFollowUp,
    }
    setSummary(reconciled)
    setFollowUpActions(reconciled.followUpActions)
    setHandoverText(buildHandoverText(reconciled))
    setStatus("AI handover summary generated.")
  }

  async function copyOutput() {
    if (!handoverText) return
    await navigator.clipboard.writeText(handoverText)
    setStatus("Handover copied.")
  }

  function exportOutput() {
    if (!handoverText) return
    const blob = new Blob([handoverText], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `shift-handover-${shift}-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setStatus("Handover exported.")
  }

  function printOutput() {
    if (!handoverText) return
    window.print()
  }

  async function sendSupervisorWhatsapp() {
    if (!summary || !handoverText) {
      setStatus("Generate the AI summary before sending supervisor report.")
      return
    }

    try {
      const response = await fetch("/api/integrations/wati/send-alert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: "shift-supervisor",
          patientId: `shift-${shift}`,
          patientName: `Shift Supervisor Handover`,
          room: `Control-${shift}`,
          riskType: "Shift Handover",
          severity: (summary?.highRisk?.length ?? 0) ? "red" : (summary?.moodBehaviorObservations?.length ?? 0) ? "orange" : "yellow",
          observation: handoverText,
          recommendedAction: "Run simulated handover briefing and complete critical follow-ups.",
          nurseName: "Shift Coordinator",
          message: handoverText,
          simulated: true,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setStatus(`Supervisor simulation failed${payload?.error ? `: ${payload.error}` : ""}`)
        return
      }

      setSupervisorMessage(payload?.message || handoverText)
      setStatus("Simulated WhatsApp supervisor summary sent.")
      setWorkflowStatus("acknowledged")
    } catch {
      setStatus("Unable to send simulated WhatsApp summary.")
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 pb-8 pt-6 sm:px-6">
      <style jsx>{`
        @media print {
          .screen-only {
            display: none;
          }
          .print-area {
            background: #fff;
            margin: 0;
            box-shadow: none;
          }
          .print-area pre {
            white-space: pre-wrap;
            background: #fff;
            border: 1px solid #e2e8f0;
            padding: 8px;
          }
          .no-print {
            display: none;
          }
        }
      `}</style>

      <section className="mx-auto mb-4 max-w-7xl rounded-3xl border border-white/50 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Shift handover module</p>
            <h1 className="text-3xl font-semibold">AI Shift Handover</h1>
            <p className="mt-1 text-sm text-slate-200">
              Morning, evening, and night handover summaries generated from nursing notes, AI alerts, escalations, vital trends, and meds.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/nurse-duty-roster" className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white">
              Open duty roster
            </Link>
            <Link href="/dashboard" className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white">
              Back to dashboard
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {shiftOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setShift(option.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                shift === option.key
                  ? "border-white bg-white text-slate-900"
                  : "border-white/30 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200">
            Workflow: {workflowStatus}
          </span>
        </div>
      </section>

      <section className="mx-auto mb-4 max-w-7xl grid gap-4 sm:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <article key={card.title} className={`rounded-2xl border p-5 ${toneStyles[card.tone]}`}>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-medium">{card.title}</p>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-3xl font-bold">{card.value}</p>
            </article>
          )
        })}
      </section>

      <section className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white p-5 no-print">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generateSummary}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <AlertTriangle className="h-4 w-4" />
            Generate AI Summary
          </button>
          <button
            type="button"
            onClick={copyOutput}
            disabled={!handoverText}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <ClipboardCopy className="h-4 w-4" />
            Copy
          </button>
          <button
            type="button"
            onClick={exportOutput}
            disabled={!handoverText}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            onClick={printOutput}
            disabled={!handoverText}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print report
          </button>
          <button
            type="button"
            onClick={sendSupervisorWhatsapp}
            disabled={!handoverText}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Send WhatsApp supervisor summary (simulation)
          </button>
          <button
            type="button"
            onClick={refresh}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh data
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateWorkflowStatus("pending")}
            className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900"
          >
            Pending
          </button>
          <button
            type="button"
            onClick={() => updateWorkflowStatus("acknowledged")}
            className="rounded-full border border-sky-300 bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-900"
          >
            Acknowledged
          </button>
          <button
            type="button"
            onClick={() => updateWorkflowStatus("completed")}
            className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900"
          >
            Completed
          </button>
          <p className="ml-auto text-sm text-slate-700">{status || "Ready to generate shift handover summary."}</p>
        </div>
      </section>

      {summary ? <p className="mx-auto max-w-7xl text-sm text-emerald-700">{summary.generatedAt ? `Last generated: ${summary.generatedAt}` : ""}</p> : null}

      <section className="mx-auto mt-4 grid gap-6 lg:grid-cols-3">
        <article className="screen-only rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Shift handover summary</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-semibold text-slate-800">Critical patients</p>
            {renderLines("Top watch list", criticalRows.map((entry) => `${entry.patient.fullName} (${entry.room}) · ${entry.risk.totalScore}`))}
            <p className="font-semibold text-slate-800">New escalations</p>
            {renderLines(
              "New escalations",
              escalationRows.map((entry) => `${entry.patientName} (${entry.room}) · ${entry.status} · ${entry.reason}`),
            )}
            <p className="font-semibold text-slate-800">Mood / behavior observations</p>
            {renderLines(
              "Mood / behavior",
              (summary?.moodBehaviorObservations ?? []).map((line) => line),
            )}
            <p className="font-semibold text-slate-800">AI recommendations</p>
            {renderLines(
              "Recommendations",
              (summary?.recommendations ?? []).map((line) => line),
            )}
            <p className="font-semibold text-slate-800">Pending follow-up actions</p>
            {renderLines(
              "Pending follow-up actions",
              followUpActions
                .filter((action) => action.status !== "completed")
                .map((action) => `${action.patientName} (${action.room}): ${action.text}`),
            )}
          </div>
        </article>

        <article className="screen-only rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Clinical flags</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-semibold text-slate-800">AI alerts detected</p>
            <p className="text-slate-600">{activeSummary.aiAlerts.length}</p>
            <p className="font-semibold text-slate-800">Medication reminders</p>
            <p className="text-slate-600">{activeSummary.medicationReminders.length}</p>
            <p className="font-semibold text-slate-800">Follow-up actions pending</p>
            <p className="text-slate-600">{followUpActions.filter((item) => item.status !== "completed").length}</p>
            <p className="mt-2 text-xs text-slate-500">Simulation mode: WATI delivery is mocked and not sent live.</p>
          </div>
        </article>
      </section>

      <section className="mx-auto mt-4 grid gap-6 lg:grid-cols-3 print-area">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Generated report</h2>
          <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
            {handoverText || "Click 'Generate AI Summary' to generate shift handover text for print and export."}
          </pre>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Handover workflow actions</h2>
          <div className="mt-3 space-y-3 text-sm">
            {followUpActions.length === 0 ? <p className="text-slate-500">No follow-up action items.</p> : null}
            {followUpActions.map((action) => (
              <div key={action.id} className={`rounded-xl border p-3 ${workflowStyles[action.status]}`}>
                <p className="font-semibold">{action.patientName}</p>
                <p className="text-xs text-slate-700">Room {action.room}</p>
                <p className="mt-1 text-xs text-slate-800">{action.text}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["pending", "acknowledged", "completed"] as FollowUpStatus[]).map((statusValue) => (
                    <button
                      key={`${action.id}-${statusValue}`}
                      type="button"
                      onClick={() => updateFollowUpStatus(action.id, statusValue)}
                      className={`rounded-full border px-2 py-1 text-xs font-semibold ${shiftToneByStatus[statusValue]}`}
                    >
                      {statusValue}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mx-auto mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Latest clinical snapshot cards</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shiftRows.map((entry) => {
            const riskLine = `${entry.risk.totalScore} / ${entry.risk.riskBadge.toUpperCase()}`
            return (
              <article key={entry.patient.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{entry.patient.fullName}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${riskToneStyles[entry.severity]}`}>{entry.severity}</span>
                </div>
                <p className="text-xs text-slate-500">{entry.room}</p>
                <p className="mt-2 text-sm text-slate-700">{entry.vitals.noteText}</p>
                <p className="mt-2 text-xs text-slate-600">AI risk score: {riskLine}</p>
                <p className="text-xs text-slate-600">Vitals: BP {entry.vitals.bloodPressure}, BS {entry.vitals.bloodSugar}</p>
                <p className="text-xs text-slate-600">Urination: {entry.vitals.urination} | Bowel: {entry.vitals.bowelMovement}</p>
                <p className="mt-2 text-xs text-slate-500">Medication reminders: {entry.medicationReminders.join(", ") || "No active medication list."}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full border border-rose-200 bg-rose-100 px-2 py-1 text-xs text-rose-700">AI alerts: {entry.aiAlerts.length}</span>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    Escalations: {entry.escalations.length}
                  </span>
                </div>
                <div className="mt-2 space-x-2 text-xs">
                  {entry.escalations.slice(0, 1).map((escalation) => (
                    <span key={escalation.id} className={`rounded-full border px-2 py-1 ${escalationStatusTone(escalation.status)}`}>
                      {escalation.status}
                    </span>
                  ))}
                </div>
                {entry.escalations.slice(0, 1).map((escalation) => (
                  <p key={escalation.id} className="mt-2 text-xs text-slate-600">
                    Escalation severity: {escalationSeverityTone(escalation.severity)}
                  </p>
                ))}
              </article>
            )
          })}
        </div>
      </section>
      {supervisorMessage ? (
        <section className="mx-auto mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 screen-only">
          <h2 className="text-lg font-semibold text-slate-900">Simulated WhatsApp payload preview</h2>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-700 whitespace-pre-wrap">{supervisorMessage}</pre>
        </section>
      ) : null}
    </main>
  )
}