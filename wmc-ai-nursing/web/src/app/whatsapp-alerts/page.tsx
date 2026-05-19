"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, BellRing, ClipboardCopy, SendHorizonal, UserRound } from "lucide-react"
import { analyzePatientRisk, riskSeverity } from "../../lib/aiRiskDetection"
import { CLINICAL_DATA_UPDATE_EVENT, listPatients } from "../../lib/patientManagement"
import { notesForPatient } from "../../lib/nursingNotes"

type RecipientId = "nurse-supervisor" | "doctor" | "family"

function normalizePhoneNumber(value: string) {
  return String(value || "").replace(/[^\d+]/g, "")
}

function extractPhoneFromContact(contact = "") {
  const match = String(contact).match(/[\+]?[\d][\d\s().-]{6,}/)
  return match ? normalizePhoneNumber(match[0]) : ""
}

type WhatsAppAlert = {
  id: string
  patientId: string
  patientName: string
  room: string
  riskType: string
  severity: ReturnType<typeof riskSeverity>
  latestObservation: string
  recommendedAction: string
  time: string
  nurseInCharge: string
  familyPhone: string
  includeFamily: boolean
  message: string
  recipients: RecipientId[]
  status: "draft" | "sent" | "escalated"
}

const SIMULATION_MODE = true

function getSimulationTimestamp() {
  return new Date().toLocaleString()
}

const simulatedTestPatients: Array<{
  patientName: string
  room: string
  riskType: string
  severity: ReturnType<typeof riskSeverity>
  latestObservation: string
  recommendedAction: string
  nurseInCharge: string
  time: string
  familyPhone: string
  recipients: RecipientId[]
}> = [
  {
    patientName: "M. Chen (Demo)",
    room: "SIM-01",
    riskType: "Confusion",
    severity: "orange",
    latestObservation: "Patient called for assistance multiple times overnight and appeared disoriented to time.",
    recommendedAction: "Assign bedside reorientation checks every 30 minutes and increase observation rounds.",
    nurseInCharge: "R.N. Patel",
    time: getSimulationTimestamp(),
    familyPhone: "+12025550133",
    recipients: ["nurse-supervisor", "family"],
  },
  {
    patientName: "S. Rivera (Demo)",
    room: "SIM-02",
    riskType: "Dehydration",
    severity: "red",
    latestObservation: "Reduced oral intake over 12 hours with dark urine and dry lips.",
    recommendedAction: "Reinforce oral hydration plan, monitor fluid balance, and notify physician if no improvement by shift end.",
    nurseInCharge: "Nurse Kim",
    time: getSimulationTimestamp(),
    familyPhone: "+12025550134",
    recipients: ["nurse-supervisor", "doctor", "family"],
  },
]

const recipientLabel: Record<RecipientId, string> = {
  "nurse-supervisor": "Nurse supervisor",
  doctor: "Doctor / physician",
  family: "Family member",
}

const recipientTone: Record<RecipientId, string> = {
  "nurse-supervisor": "bg-slate-100 text-slate-800 border-slate-200",
  doctor: "bg-blue-100 text-blue-800 border-blue-200",
  family: "bg-emerald-100 text-emerald-800 border-emerald-200",
}

const severityTone: Record<ReturnType<typeof riskSeverity>, string> = {
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  yellow: "bg-amber-100 text-amber-700 border-amber-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  red: "bg-rose-100 text-rose-700 border-rose-200",
}

const metricCards = [
  { title: "Patient alerts", tone: "rose", value: (rows: WhatsAppAlert[]) => `${rows.length}` },
  { title: "Not sent", tone: "amber", value: (rows: WhatsAppAlert[]) => `${rows.filter((row) => row.status === "draft").length}` },
  { title: "Sent", tone: "sky", value: (rows: WhatsAppAlert[]) => `${rows.filter((row) => row.status === "sent").length}` },
  { title: "Escalated", tone: "emerald", value: (rows: WhatsAppAlert[]) => `${rows.filter((row) => row.status === "escalated").length}` },
]

const toneStyles: Record<string, string> = {
  rose: "border-rose-200 bg-rose-50 text-rose-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  sky: "border-sky-200 bg-sky-50 text-sky-900",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
}

function toLower(value: string) {
  return String(value || "").toLowerCase()
}

function safeToLocaleCompare(a: string | null | undefined, b: string | null | undefined) {
  const left = String(a || "")
  const right = String(b || "")
  return right.localeCompare(left)
}

function patientRoom(patientId: string) {
  const value = patientId.replace(/\D/g, "")
  const suffix = value.padStart(3, "0")
  const wing = Number.parseInt(suffix, 10) % 4
  return `${["A", "B", "C", "D"][wing]}-2${suffix.slice(-2)}`
}

function latestNoteForPatient(patientId: string) {
  return notesForPatient(patientId).sort((left, right) => safeToLocaleCompare(left?.recordedAt, right?.recordedAt))[0]
}

function collectText(note: {
  noteText?: string
  abnormalEvents?: string
  nurseRemarks?: string
  appetite?: string
  mood?: string
  mobility?: string
  skinCondition?: string
  recordedBy?: string
}) {
  return [note.noteText, note.abnormalEvents, note.nurseRemarks, note.mood, note.appetite, note.mobility, note.skinCondition]
    .map((entry) => toLower(String(entry || "")))
    .filter(Boolean)
    .join(" ")
}

function determineNeedsFamily(alertType: string, severity: ReturnType<typeof riskSeverity>, latestText: string) {
  const lower = toLower(alertType)
  const hasConfusion = toLower(latestText).includes("confusion") || toLower(latestText).includes("confused") || toLower(latestText).includes("disoriented")
  return (
    severity === "red" ||
    lower === "dehydration" ||
    lower === "fall risk" ||
    lower === "emotional distress" ||
    lower === "confusion" ||
    hasConfusion
  )
}

function detectAlertRecipients(row: { severity: ReturnType<typeof riskSeverity>; riskType: string; needsFamily: boolean }) {
  const recipients: RecipientId[] = ["nurse-supervisor"]

  if (row.severity === "orange" || row.severity === "red" || row.riskType === "Emergency escalation") {
    recipients.push("doctor")
  }

  if (row.needsFamily) {
    recipients.push("family")
  }

  return [...new Set(recipients)]
}

function buildAlertMessage(payload: {
  patientName: string
  room: string
  riskType: string
  severity: ReturnType<typeof riskSeverity>
  latestObservation: string
  recommendedAction: string
  time: string
  nurseInCharge: string
}) {
  return [
    "WMC AI WhatsApp Alert",
    "",
    `Patient name: ${payload.patientName}`,
    `Room number: ${payload.room}`,
    `Risk type: ${payload.riskType}`,
    `Severity level: ${payload.severity.toUpperCase()}`,
    `Latest observation: ${payload.latestObservation}`,
    `Recommended action: ${payload.recommendedAction}`,
    `Time: ${payload.time}`,
    `Nurse in charge: ${payload.nurseInCharge}`,
  ].join("\n")
}

function buildAlertRows() {
  return listPatients().flatMap((patient) => {
    const risk = analyzePatientRisk(patient)
    const latest = latestNoteForPatient(patient.id)
    const room = patientRoom(patient.id)
    if (!latest) return []

    const fullText = collectText(latest)
    const labels = risk.categories.map((item) => item.label.toLowerCase())
    const alerts: WhatsAppAlert[] = []

    const makeAlert = (riskType: string, action: string) => {
      const severity = risk.severity
      const includeFamily = determineNeedsFamily(riskType, severity, fullText)
      const latestObservation = latest.noteText || latest.nurseRemarks || "No detailed observation."
      const recipients = detectAlertRecipients({ severity, riskType, needsFamily: includeFamily })
      const message = buildAlertMessage({
        patientName: patient.fullName,
        room,
        riskType,
        severity,
        latestObservation,
        recommendedAction: action,
        time: latest.recordedAt ? new Date(latest.recordedAt).toLocaleString() : "Unknown",
        nurseInCharge: latest.recordedBy || patient.assignedNurse || "Unassigned",
      })

      alerts.push({
        id: `${patient.id}-${riskType.toLowerCase().replace(/\s+/g, "-")}`,
        patientId: patient.id,
        patientName: patient.fullName,
        room,
        riskType,
        severity,
        latestObservation,
        recommendedAction: action,
        time: latest.recordedAt || new Date().toISOString(),
        nurseInCharge: latest.recordedBy || patient.assignedNurse || "Unassigned",
        familyPhone: extractPhoneFromContact(patient.familyContact || ""),
        includeFamily,
        message,
        recipients,
        status: "draft",
      })
    }

    if (labels.includes("fall risk")) makeAlert("Fall risk", "Apply immediate 1:1 transfer support and close supervision.")
    if (labels.includes("dehydration")) makeAlert("Dehydration", "Encourage fluids, monitor I/O hourly, and escalate if urine output remains low.")
    if (labels.includes("emotional distress") || fullText.includes("confusion")) makeAlert("Confusion", "Increase cognitive checks and notify charge nurse for reassessment.")
    if (fullText.includes("missed") || fullText.includes("refused") || fullText.includes("not taken") || fullText.includes("held dose"))
      makeAlert("Medication missed", "Reassess medication administration status and document any missed dose.")
    if (labels.includes("pressure sore risk")) makeAlert("Pressure sore risk", "Reposition and skin check every 2 hours; escalate to wound specialist if worsening.")
    if (risk.severity === "red" || risk.totalScore >= 85) makeAlert("Emergency escalation", "Escalate immediately to clinical lead and place patient on urgent watch list.")

    return alerts
  })
}

function buildSimulatedRows() {
  return simulatedTestPatients.map((entry, index) => ({
    id: `sim-${index + 1}`,
    patientId: `sim-${index + 1}`,
    patientName: entry.patientName,
    room: entry.room,
    riskType: entry.riskType,
    severity: entry.severity,
    latestObservation: entry.latestObservation,
    recommendedAction: entry.recommendedAction,
    time: entry.time || getSimulationTimestamp(),
    nurseInCharge: entry.nurseInCharge,
    familyPhone: entry.familyPhone,
    includeFamily: entry.recipients.includes("family"),
    message: buildAlertMessage({
      patientName: entry.patientName,
      room: entry.room,
      riskType: entry.riskType,
      severity: entry.severity,
      latestObservation: entry.latestObservation,
      recommendedAction: entry.recommendedAction,
      time: entry.time,
      nurseInCharge: entry.nurseInCharge,
    }),
    recipients: entry.recipients,
    status: "draft",
  }))
}

function formatStatus(status: WhatsAppAlert["status"]) {
  if (status === "sent") return "Sent"
  if (status === "escalated") return "Escalated"
  return "Draft"
}

async function sendWatiMessage(payload: WhatsAppAlert, recipient: RecipientId) {
  const phoneNumber =
    recipient === "family"
      ? payload.familyPhone
      : payload.nurseInCharge.includes("+")
        ? normalizePhoneNumber(payload.nurseInCharge)
        : ""
  const response = await fetch("/api/integrations/wati/send-alert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      to: recipient,
      patientId: payload.patientId,
      phoneNumber,
      patientName: payload.patientName,
      room: payload.room,
      riskType: payload.riskType,
      severity: payload.severity,
      observation: payload.latestObservation,
      recommendedAction: payload.recommendedAction,
      nurseName: payload.nurseInCharge,
      message: payload.message,
      simulated: SIMULATION_MODE,
    }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result?.error || "Failed to send WATI alert.")
  return result
}

export default function WhatsAppAlertsPage() {
  const [alerts, setAlerts] = useState<WhatsAppAlert[]>([])
  const [activeAlert, setActiveAlert] = useState<string>("")
  const [statusMessage, setStatusMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [lastCopyMessage, setLastCopyMessage] = useState("")

  const refresh = useCallback(() => {
    try {
      const rows = buildAlertRows()
      setAlerts(rows)
      setActiveAlert(rows[0]?.id || "")
      setIsLoading(false)
    } catch (error) {
      console.error("Failed to build WhatsApp alert rows:", error)
      setStatusMessage("Failed to generate alerts from patient data. Showing fallback simulation mode.")
      setAlerts(buildSimulatedRows())
      setActiveAlert("sim-1")
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    setIsLoading(false)
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
  }, [refresh])

  const cards = useMemo(() => metricCards.map((card) => ({ ...card, value: card.value(alerts) })), [alerts])
  const currentAlert = alerts.find((item) => item.id === activeAlert) ?? alerts[0]

  async function generate() {
    refresh()
    setStatusMessage("WhatsApp alerts generated from latest nursing notes and AI risk summary.")
    setTimeout(() => setStatusMessage(""), 2500)
  }

  function generateSimulatedAlert() {
    const synthetic = buildSimulatedRows()
    setAlerts(synthetic)
    setActiveAlert(synthetic[0]?.id || "")
    setStatusMessage("Generated simulated WhatsApp alert data from test patient rows.")
    setTimeout(() => setStatusMessage(""), 2500)
  }

  async function copyMessage() {
    if (!currentAlert) return
    await navigator.clipboard.writeText(currentAlert.message)
    setLastCopyMessage(`Message copied: ${currentAlert.patientName} · ${currentAlert.riskType}`)
  }

  async function markAsSent() {
    if (!currentAlert) return
    try {
      await Promise.all(currentAlert.recipients.map((recipient) => sendWatiMessage(currentAlert, recipient)))
      setAlerts((current) => current.map((row) => (row.id === currentAlert.id ? { ...row, status: "sent" as const } : row)))
      setStatusMessage("Mock send complete. WATI endpoint used in simulation mode.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send mock alert."
      setStatusMessage(message)
    } finally {
      setTimeout(() => setStatusMessage(""), 2600)
    }
  }

  async function escalateToSupervisor() {
    if (!currentAlert) return
    try {
      await sendWatiMessage(currentAlert, "nurse-supervisor")
      setAlerts((current) => current.map((row) => (row.id === currentAlert.id ? { ...row, status: "escalated" as const } : row)))
      setStatusMessage("Escalation queued to Nurse Supervisor via WATI simulation endpoint.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to escalate alert."
      setStatusMessage(message)
    } finally {
      setTimeout(() => setStatusMessage(""), 2600)
    }
  }

  async function sendTestAlert() {
    try {
      const result = await fetch("/api/integrations/wati/send-alert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: "nurse-supervisor",
          patientName: "WMC Nurse Station",
          room: "SIM-01",
          riskType: "Simulation test",
          severity: "yellow",
          observation: "System test message; no clinical event.",
          recommendedAction: "Confirm channel connectivity and template rendering.",
          nurseName: "System",
          simulated: SIMULATION_MODE,
        }),
      })

      const payload = await result.json()
      if (!result.ok) throw new Error(payload?.error || "Failed to send test alert.")
      setStatusMessage(`Test alert generated. Message: ${payload.message?.slice(0, 140)}...`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send test alert."
      setStatusMessage(message)
    } finally {
      setTimeout(() => setStatusMessage(""), 2600)
    }
  }

  const emergencyCount = alerts.filter((row) => row.riskType === "Emergency escalation").length

  return (
    <main className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6">
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Critical care communication</p>
          <h1 className="text-2xl font-semibold text-slate-900">WhatsApp Alert Center</h1>
          <p className="text-sm text-slate-600">Generate mock WhatsApp-ready nursing alerts for supervisor, physician, and family updates.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
              Simulation Mode
            </span>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
              No real message sent
            </span>
          </div>
        </div>
        <Link href="/dashboard" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          Back to dashboard
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        {cards.map((card) => (
          <article key={card.title} className={`rounded-2xl border p-5 ${toneStyles[card.tone]}`}>
            <p className="text-xs uppercase tracking-wide text-slate-600">{card.title}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        {isLoading ? <p className="text-sm text-slate-600">Loading WhatsApp alerts...</p> : null}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generateSimulatedAlert}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <AlertTriangle className="h-4 w-4" />
            Generate Simulated WhatsApp Alert
          </button>
          <button
            type="button"
            onClick={generate}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            <AlertTriangle className="h-4 w-4" />
            Generate from AI Data
          </button>
          <button
            type="button"
            onClick={copyMessage}
            disabled={!currentAlert}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <ClipboardCopy className="h-4 w-4" />
            Copy Message
          </button>
          <button
            type="button"
            onClick={markAsSent}
            disabled={!currentAlert}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
          >
            <SendHorizonal className="h-4 w-4" />
            Mark as Sent
          </button>
          <button
            type="button"
            onClick={sendTestAlert}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800"
          >
            <SendHorizonal className="h-4 w-4" />
            Send Test WhatsApp Alert
          </button>
          <button
            type="button"
            onClick={escalateToSupervisor}
            disabled={!currentAlert}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50"
          >
            <BellRing className="h-4 w-4" />
            Escalate to Supervisor
          </button>
        </div>

        {statusMessage ? <p className="mb-4 text-sm text-emerald-700">{statusMessage}</p> : null}
        {lastCopyMessage ? <p className="mb-4 text-xs text-slate-500">{lastCopyMessage}</p> : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700">Critical alert types</p>
            <ul className="mt-2 text-sm text-slate-700">
              <li>- Fall risk ({alerts.filter((item) => item.riskType === "Fall risk").length})</li>
              <li>- Dehydration ({alerts.filter((item) => item.riskType === "Dehydration").length})</li>
              <li>- Confusion ({alerts.filter((item) => item.riskType === "Confusion").length})</li>
              <li>- Medication missed ({alerts.filter((item) => item.riskType === "Medication missed").length})</li>
              <li>- Pressure sore risk ({alerts.filter((item) => item.riskType === "Pressure sore risk").length})</li>
              <li>- Emergency escalation ({emergencyCount})</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700">Recipient legend</p>
            <ul className="mt-2 text-sm text-slate-700">
              <li>- {recipientLabel["nurse-supervisor"]}</li>
              <li>- {recipientLabel.doctor}</li>
              <li>- {recipientLabel.family}</li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">Recipients auto-selected from severity and clinical context.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700">WATI placeholder</p>
            <p className="mt-2 text-xs text-slate-600">Endpoint: /api/integrations/wati/send-alert</p>
            <p className="mt-2 text-xs text-slate-600">This module is simulation mode and does not dispatch real WhatsApp messages.</p>
            <p className="mt-2 text-xs text-slate-600">Live sending is disabled by default in this module.</p>
            <p className="mt-2 text-xs text-slate-600">Status: Simulation Mode</p>
            <p className="mt-2 text-xs text-slate-600">Last action: {emergencyCount > 0 ? "Critical cases detected" : "No critical cases currently."}</p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-6 xl:grid-cols-5">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 xl:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Alert list</h2>
          <div className="mt-3 max-h-[480px] overflow-auto rounded-xl border border-slate-200">
            {alerts.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-500">
                No critical alert detected. Click "Generate from AI Data" or use simulated test alerts.
              </p>
            ) : (
              alerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => setActiveAlert(alert.id)}
                  className={`w-full border-b border-slate-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-slate-50 ${
                    alert.id === currentAlert?.id ? "bg-slate-100" : "bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{alert.patientName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {alert.riskType} · Room {alert.room}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${severityTone[alert.severity]}`}>{alert.severity}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">{formatStatus(alert.status)}</span>
                    {alert.recipients.includes("family") ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${recipientTone.family}`}>family</span>
                    ) : null}
                    {alert.recipients.includes("doctor") ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${recipientTone.doctor}`}>doctor</span>
                    ) : null}
                    {alert.recipients.includes("nurse-supervisor") ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${recipientTone["nurse-supervisor"]}`}>supervisor</span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">WhatsApp message preview</h2>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <UserRound className="h-4 w-4" />
              Nurse in charge: {currentAlert?.nurseInCharge || "—"}
            </span>
          </div>
          <div className="mb-3 inline-flex items-center gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Simulation Mode</span>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
              No real message sent
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-sm text-slate-700">
              {currentAlert ? currentAlert.message : "No alert selected. Generate alerts then choose one to view message."}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <ArrowRight className="mt-0.5 h-4 w-4 text-slate-500" />
              <p className="text-xs text-slate-500">Each generated message includes patient name, room, risk type, severity, latest observation, action, time, and nurse in charge.</p>
            </div>
          </div>
        </article>
      </section>
    </main>
  )
}
