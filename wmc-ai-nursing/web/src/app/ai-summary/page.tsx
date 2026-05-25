"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ClipboardCopy, FileText, Printer, RefreshCw, Sparkles } from "lucide-react"
import { analyzePatientRisk, riskSeverity } from "../../lib/aiRiskDetection"
import { CLINICAL_DATA_UPDATE_EVENT, listPatients, Patient } from "../../lib/patientManagement"
import { notesForPatient } from "../../lib/nursingNotes"

type HandoverSection = "Urgent attention" | "Monitor closely" | "Routine care"

type NoteVitals = {
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

type DailyPatientRow = {
  patient: Patient
  room: string
  riskScore: number
  riskCategory: "low" | "medium" | "high"
  riskSeverity: ReturnType<typeof riskSeverity>
  categories: string[]
  shiftSection: HandoverSection
  noteAt: string
  vitals: NoteVitals
  familyUpdateNeeded: boolean
  needsNightMonitoring: boolean
  medicationUpdateNotes: string[]
}

type DailySummaryPayload = {
  generatedAt: string
  overallWardStatus: string
  highRiskPatients: DailyPatientRow[]
  fallRiskAlerts: DailyPatientRow[]
  hydrationOrAppetiteAlerts: DailyPatientRow[]
  emotionalOrConfusionAlerts: DailyPatientRow[]
  medicationIssues: string[]
  followUpPatients: DailyPatientRow[]
  familyUpdateSuggestions: DailyPatientRow[]
  managerSummary: string
  nursingChecklist: string[]
  doctorReviewNeeded: string[]
  familyCommunicationDraft: string
}

const metricCards = [
  { title: "Residents checked", tone: "emerald", value: (rows: DailyPatientRow[]) => `${rows.length}` },
  { title: "Urgent", tone: "rose", value: (rows: DailyPatientRow[]) => `${rows.filter((row) => row.shiftSection === "Urgent attention").length}` },
  { title: "Monitor", tone: "amber", value: (rows: DailyPatientRow[]) => `${rows.filter((row) => row.shiftSection === "Monitor closely").length}` },
  { title: "High risk", tone: "slate", value: (rows: DailyPatientRow[]) => `${rows.filter((row) => row.riskSeverity === "orange" || row.riskSeverity === "red").length}` },
]

const toneStyles: Record<string, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  rose: "border-rose-200 bg-rose-50 text-rose-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  slate: "border-slate-200 bg-slate-50 text-slate-900",
}

const severityBadgeStyles: Record<ReturnType<typeof riskSeverity>, string> = {
  green: "bg-emerald-100 text-emerald-700",
  yellow: "bg-amber-100 text-amber-700",
  orange: "bg-orange-100 text-orange-700",
  red: "bg-rose-100 text-rose-700",
}

function toLower(value: string) {
  return value.toLowerCase()
}

function hasAny(source: string, terms: string[]) {
  const lower = toLower(source)
  return terms.some((term) => lower.includes(term))
}

function latestNoteSnapshot(patientId: string) {
  const notes = notesForPatient(patientId).sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
  const latest = notes[0]
  if (!latest) {
    return {
      bloodPressure: "No update",
      bloodSugar: "No update",
      urination: "No update",
      bowelMovement: "No update",
      mobility: "No update",
      noteText: "No clinical note yet",
      abnormalEvents: "None",
      hydrationWatch: false,
      recordedAt: "",
    }
  }
  return {
    bloodPressure: latest.bloodPressure || "Not recorded",
    bloodSugar: latest.bloodSugar || "Not recorded",
    urination: latest.urination || "Not recorded",
    bowelMovement: latest.bowelMovement || "Not recorded",
    mobility: latest.mobility || "Not recorded",
    noteText: latest.noteText || latest.nurseRemarks || "No detailed note",
    abnormalEvents: latest.abnormalEvents || "None",
    hydrationWatch: latest.hydrationWatch || false,
    recordedAt: latest.recordedAt,
  }
}

function medicationSignalsFromNoteText(noteText: string, patient: Patient) {
  const notes = toLower(noteText)
  const issues = [] as string[]
  if (hasAny(notes, ["missed", "refused", "not taken", "delayed", "hold", "stopped", "vomit", "n/v", "nausea", "poor intake"])) {
    issues.push("Medication adherence concern: " + (notes.includes("missed") ? "missed or delayed dose" : "administration concern"))
  }
  if (hasAny(notes, ["new med", "added", "started", "discontinued", "changed", "adjusted", "dose increase", "dose decrease"])) {
    issues.push(`Medication change documented for ${patient.fullName}`)
  }
  return issues
}

function buildRows() {
  return listPatients().map((patient) => {
    const risk = analyzePatientRisk(patient)
    const vitals = latestNoteSnapshot(patient.id)
    const categories = risk.categories.map((item) => toLower(item.label))
    const noteText = `${vitals.noteText} ${vitals.abnormalEvents}`.toLowerCase()
    const shiftSection: HandoverSection =
      risk.severity === "red" || risk.severity === "orange"
        ? "Urgent attention"
        : risk.severity === "yellow"
          ? "Monitor closely"
          : "Routine care"
    const familyUpdateNeeded =
      risk.severity === "red" || hasAny(noteText, ["family", "confused", "agitated", "tearful", "anxious", "emotional distress", "disoriented"])
    const needsNightMonitoring = patient.fallRisk === "High" || hasAny(noteText, ["night", "evening", "wandering", "disoriented", "confusion", "agitated"])
    return {
      patient,
      room: patient.roomNumber || "—",
      riskScore: risk.totalScore,
      riskCategory: risk.riskBadge,
      riskSeverity: risk.severity,
      categories,
      shiftSection,
      noteAt: vitals.recordedAt,
      vitals,
      familyUpdateNeeded,
      needsNightMonitoring,
      medicationUpdateNotes: medicationSignalsFromNoteText(vitals.noteText + " " + vitals.abnormalEvents, patient),
    }
  })
}

function buildSummary(rows: DailyPatientRow[]): DailySummaryPayload {
  const highRiskPatients = rows.filter((row) => row.riskSeverity === "orange" || row.riskSeverity === "red")
  const fallRiskAlerts = rows.filter((row) => row.categories.includes("fall risk"))
  const hydrationOrAppetiteAlerts = rows.filter((row) => ["dehydration", "poor appetite"].some((label) => row.categories.includes(label)))
  const emotionalOrConfusionAlerts = rows.filter(
    (row) => row.categories.includes("emotional distress") || row.categories.includes("confusion") || row.categories.includes("sudden weakness"),
  )

  const medicationAlertsRows = rows.filter((row) => row.medicationUpdateNotes.length > 0)
  const medicationIssues = [
    ...medicationAlertsRows.flatMap((row) =>
      row.medicationUpdateNotes.map((signal) => `${row.patient.fullName} (${row.room}): ${signal}`),
    ),
    ...rows
      .filter((row) => hasAny(row.vitals.abnormalEvents, ["medication"])
      )
      .map((row) => `${row.patient.fullName} (${row.room}): abnormal event note may include medication review`),
  ]

  const followUpPatients = [...new Set(rows.filter((row) => row.shiftSection !== "Routine care").map((row) => row.patient.id))].map(
    (id) => rows.find((row) => row.patient.id === id)!,
  )
  const familyUpdateSuggestions = rows.filter((row) => row.familyUpdateNeeded)
  const urgentCount = rows.filter((row) => row.shiftSection === "Urgent attention").length
  const monitorCount = rows.filter((row) => row.shiftSection === "Monitor closely").length
  const avgScore = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.riskScore, 0) / rows.length) : 0

  const managerSummary = `Ward status today shows ${rows.length} resident snapshots. ${urgentCount} residents require urgent handover-level review and ${monitorCount} require frequent review. Average AI risk score is ${avgScore}.`

  const nursingChecklist = [
    ...highRiskPatients.map((row) => `Reassess ${row.patient.fullName} (${row.room}) urgently; review transfer support and last events.`),
    ...fallRiskAlerts.map((row) => `Prepare 1:1 transfer support checklist for ${row.patient.fullName} (${row.room}).`),
    ...medicationIssues.map((issue) => `Medication action: ${issue}`),
    ...rows
      .filter((row) => row.needsNightMonitoring)
      .map((row) => `Add night-check assignment for ${row.patient.fullName} (${row.room}).`),
  ]

  const doctorReviewNeeded = [
    ...highRiskPatients.map((row) => `Consider physician review for ${row.patient.fullName} (${row.room}) if risk persists.`),
    ...emotionalOrConfusionAlerts.map((row) => `Consider medical review for ${row.patient.fullName} (${row.room}) for cognition changes.`),
  ]

  const familyDraftLines = [
    `Family communication draft for today:`,
    `- ${highRiskPatients.length > 0 ? `${highRiskPatients.length} patient(s)` : "No"} high-risk patient required escalation during this shift.`,
    `- Fall risk remains present in ${fallRiskAlerts.length} patient(s).`,
    `- Dehydration or appetite concerns: ${hydrationOrAppetiteAlerts.length} patient(s).`,
    `- Family-recommended contacts: ${familyUpdateSuggestions.length} patient(s).`,
  ]

  return {
    generatedAt: new Date().toLocaleString(),
    overallWardStatus: managerSummary,
    highRiskPatients,
    fallRiskAlerts,
    hydrationOrAppetiteAlerts,
    emotionalOrConfusionAlerts,
    medicationIssues: medicationIssues.length > 0 ? medicationIssues : ["No medication deviation alerts identified."],
    followUpPatients,
    familyUpdateSuggestions,
    managerSummary,
    nursingChecklist: [...new Set(nursingChecklist)],
    doctorReviewNeeded: [...new Set(doctorReviewNeeded)],
    familyCommunicationDraft: familyDraftLines.join("\n"),
  }
}

function sectionList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- none"
}

function summarizePayload(payload: DailySummaryPayload) {
  return [
    `AI Daily Nursing Summary (${payload.generatedAt})`,
    "",
    "Overall ward status",
    payload.overallWardStatus,
    "",
    "High-risk patients today",
    ...payload.highRiskPatients.map((row) => `- ${row.patient.fullName} (${row.room}) · score ${row.riskScore} · severity ${row.riskSeverity}`),
    "",
    "Fall risk alerts",
    ...payload.fallRiskAlerts.map((row) => `- ${row.patient.fullName} (${row.room}) · ${row.categories.includes("fall risk") ? "fall risk identified" : "watch"}`),
    "",
    "Dehydration / poor appetite alerts",
    ...payload.hydrationOrAppetiteAlerts.map((row) => `- ${row.patient.fullName} (${row.room}) · ${row.vitals.hydrationWatch ? "hydration watch" : "trend flagged"}`),
    "",
    "Emotional or confusion alerts",
    ...payload.emotionalOrConfusionAlerts.map((row) => `- ${row.patient.fullName} (${row.room}) · review behavior and cognition`),
    "",
    "Medication issues",
    ...payload.medicationIssues.map((line) => `- ${line}`),
    "",
    "Patients needing follow-up",
    ...payload.followUpPatients.map((row) => `- ${row.patient.fullName} (${row.room}) · ${row.shiftSection} / severity ${row.riskSeverity}`),
    "",
    "Family update suggestions",
    ...payload.familyUpdateSuggestions.map((row) => `- ${row.patient.fullName} (${row.room})`),
    "",
    "Nursing action checklist",
    ...payload.nursingChecklist.map((item) => `- ${item}`),
    "",
    "Doctor review needed",
    ...payload.doctorReviewNeeded.map((item) => `- ${item}`),
    "",
    "Family communication draft",
    payload.familyCommunicationDraft,
  ].join("\n")
}

export default function AiSummaryPage() {
  const [rows, setRows] = useState<DailyPatientRow[]>([])
  const [payload, setPayload] = useState<DailySummaryPayload | null>(null)
  const [summaryText, setSummaryText] = useState("")
  const [status, setStatus] = useState("")

  const refresh = () => setRows(buildRows())

  useEffect(() => {
    refresh()
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("wmc_nursing_")) refresh()
    }
    const onClinicalUpdate = () => refresh()
    window.addEventListener("storage", onStorage)
    window.addEventListener(CLINICAL_DATA_UPDATE_EVENT, onClinicalUpdate)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(CLINICAL_DATA_UPDATE_EVENT, onClinicalUpdate)
    }
  }, [])

  const cards = useMemo(() => metricCards.map((card) => ({ ...card, value: card.value(rows) })), [rows])

  function generate() {
    const next = buildSummary(rows)
    setPayload(next)
    setSummaryText(summarizePayload(next))
    setStatus("AI Daily Summary generated.")
  }

  async function copyOutput() {
    if (!summaryText) return
    await navigator.clipboard.writeText(summaryText)
    setStatus("Daily summary copied to clipboard.")
  }

  function exportOutput() {
    if (!summaryText) return
    const blob = new Blob([summaryText], { type: "text/plain;charset=utf-8" })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = objectUrl
    link.download = `ai-daily-summary-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  }

  function printOutput() {
    if (!summaryText) return
    window.print()
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6">
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Daily clinical summary</p>
          <h1 className="text-2xl font-semibold text-slate-900">AI Daily Nursing Summary</h1>
          <p className="text-sm text-slate-600">Generate ward-level and patient-level summary for manager, nursing, and doctor handoff.</p>
        </div>
        <Link href="/dashboard" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          Back to dashboard
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        {cards.map((card) => (
          <article key={card.title} className={`rounded-2xl border p-5 ${toneStyles[card.tone]}`}>
            <p className="text-sm text-slate-600">{card.title}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generate}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <Sparkles className="h-4 w-4" />
            Generate AI Daily Summary
          </button>
          <button
            type="button"
            onClick={copyOutput}
            disabled={!summaryText}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <ClipboardCopy className="h-4 w-4" />
            Copy summary
          </button>
          <button
            type="button"
            onClick={exportOutput}
            disabled={!summaryText}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            onClick={printOutput}
            disabled={!summaryText}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print
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
        {status ? <p className="mb-4 text-sm text-emerald-700">{status}</p> : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">{payload ? payload.overallWardStatus : "No summary generated yet."}</p>
        </div>
      </section>

      <section className="mt-5 grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">AI Daily Summary</h2>
          <pre className="mt-3 max-h-[460px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
            {summaryText || "Click 'Generate AI Daily Summary' to produce all sections."}
          </pre>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Section snapshots</h2>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="font-semibold text-slate-800">High-risk patients today</p>
              <p className="mt-1 text-slate-600">{payload ? payload.highRiskPatients.length : 0}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Fall risk alerts</p>
              <p className="mt-1 text-slate-600">{payload ? payload.fallRiskAlerts.length : 0}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Dehydration / appetite alerts</p>
              <p className="mt-1 text-slate-600">{payload ? payload.hydrationOrAppetiteAlerts.length : 0}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Emotional or confusion alerts</p>
              <p className="mt-1 text-slate-600">{payload ? payload.emotionalOrConfusionAlerts.length : 0}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Medication issues</p>
              <pre className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">{sectionList(payload ? payload.medicationIssues : [])}</pre>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Patients needing follow-up</p>
              <pre className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                {payload
                  ? sectionList(payload.followUpPatients.map((row) => `${row.patient.fullName} (${row.room}) - ${row.shiftSection}`))
                  : "- none"}
              </pre>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Family update suggestions</p>
              <pre className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                {payload ? sectionList(payload.familyUpdateSuggestions.map((row) => `${row.patient.fullName} (${row.room})`)) : "- none"}
              </pre>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Latest snapshots</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row.patient.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold text-slate-900">{row.patient.fullName}</p>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityBadgeStyles[row.riskSeverity]}`}>{row.riskSeverity}</span>
              </div>
              <p className="text-xs text-slate-500">{row.room}</p>
              <p className="mt-2 text-sm text-slate-700">{row.vitals.noteText}</p>
              <p className="mt-1 text-xs text-slate-500">
                Vitals: BP {row.vitals.bloodPressure} / BS {row.vitals.bloodSugar}
              </p>
              <p className="text-xs text-slate-500">
                Urine: {row.vitals.urination} | Stool: {row.vitals.bowelMovement}
              </p>
              <p className="mt-1 text-xs text-slate-600">Risk score: {row.riskScore} / {row.riskCategory.toUpperCase()}</p>
              <p className="text-xs text-slate-600">Shift status: {row.shiftSection}</p>
              <p className="text-xs text-slate-600">Last note: {row.noteAt || "No timestamp"}</p>
            </article>
          ))}
          {!rows.length ? <p className="text-sm text-slate-500">No patients available for summary.</p> : null}
        </div>
      </section>
    </main>
  )
}
