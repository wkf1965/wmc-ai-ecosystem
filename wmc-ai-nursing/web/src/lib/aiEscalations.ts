import { announceClinicalDataUpdate } from "./patientManagement"
import { riskSeverity } from "./aiRiskDetection"
import type { NursingNote } from "./nursingNotes"

const ESCALATION_STORAGE_KEY = "wmc_ai_escalations_v1"
const AUDIT_LOG_STORAGE_KEY = "wmc_ai_escalation_audit_v1"
const MAX_AUDIT_ENTRIES = 250

export type EscalationStatus = "pending" | "nurse_review" | "supervisor_review" | "escalated" | "resolved"

export type EscalationTimelineEntry = {
  status: EscalationStatus
  at: string
  actor: string
  note: string
}

export type EscalationRecord = {
  id: string
  patientId: string
  patientName: string
  room: string
  noteId: string
  noteText: string
  riskScore: number
  severity: ReturnType<typeof riskSeverity>
  reason: string
  triggerTerms: string[]
  status: EscalationStatus
  createdAt: string
  updatedAt: string
  timeline: EscalationTimelineEntry[]
  messagePreview?: string
}

export type EscalationAction =
  | {
      type: "created"
      action: string
      details?: string
      actor: string
    }
  | {
      type: "status-changed"
      previousStatus: EscalationStatus
      nextStatus: EscalationStatus
      actor: string
      details?: string
    }
  | {
      type: "whatsapp-trigger"
      actor: string
      details?: string
      action: string
      success: boolean
    }

export type EscalationAuditLogEntry = {
  id: string
  escalationId: string
  patientId: string
  patientName: string
  action: EscalationAction["type"]
  timestamp: string
  actionDetail: EscalationAction
}

type EscalationDecision = {
  escalate: boolean
  terms: string[]
  reason: string
}

const escalationTermMap = [
  { term: "fall", label: "Fall risk" },
  { term: "confusion", label: "Confusion" },
  { term: "dehydration", label: "Dehydration" },
  { term: "poor appetite", label: "Poor appetite" },
]

const storageAvailable = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined"

function toLower(value: string) {
  return String(value || "").toLowerCase()
}

function normalizeText(note: NursingNote) {
  return [
    note.noteText,
    note.abnormalEvents,
    note.nurseRemarks,
    note.appetite,
    note.mood,
    note.mobility,
    note.bowelMovement,
    note.urination,
    note.skinCondition,
    note.noteText,
  ]
    .map((entry) => toLower(entry || ""))
    .join(" ")
}

function buildEscalationId() {
  return `escalation-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function auditId() {
  return `escalation-audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function readEscalations(): EscalationRecord[] {
  if (!storageAvailable()) return []

  const raw = window.localStorage.getItem(ESCALATION_STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as EscalationRecord[]
  } catch {
    return []
  }
}

function writeEscalations(items: EscalationRecord[]) {
  if (!storageAvailable()) return
  window.localStorage.setItem(ESCALATION_STORAGE_KEY, JSON.stringify(items))
}

function readAuditLog(): EscalationAuditLogEntry[] {
  if (!storageAvailable()) return []

  const raw = window.localStorage.getItem(AUDIT_LOG_STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as EscalationAuditLogEntry[]
  } catch {
    return []
  }
}

function writeAuditLog(items: EscalationAuditLogEntry[]) {
  if (!storageAvailable()) return
  window.localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(items))
}

function createAuditEntry(action: EscalationAction, record: EscalationRecord): EscalationAuditLogEntry {
  return {
    id: auditId(),
    escalationId: record.id,
    patientId: record.patientId,
    patientName: record.patientName,
    action: action.type,
    timestamp: new Date().toISOString(),
    actionDetail: action,
  }
}

function appendAudit(action: EscalationAction, record: EscalationRecord) {
  const next = [...readAuditLog(), createAuditEntry(action, record)]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, MAX_AUDIT_ENTRIES)
  writeAuditLog(next)
}

function addStatusTimeline(record: EscalationRecord, status: EscalationStatus, actor: string, note: string) {
  const timeline: EscalationTimelineEntry[] = [
    ...record.timeline,
    {
      status,
      at: new Date().toISOString(),
      actor,
      note,
    },
  ]
  return timeline
}

function decideEscalation(note: NursingNote, riskScore: number): EscalationDecision {
  const text = normalizeText(note)
  const terms = escalationTermMap
    .filter((item) => text.includes(item.term))
    .map((item) => item.label)

  const hasAllKeywords = terms.length === escalationTermMap.length
  const hasRiskThreshold = riskScore >= 80

  if (hasRiskThreshold && hasAllKeywords) {
    return {
      escalate: true,
      terms,
      reason: "AI risk score reached 80+ and high-risk clinical keywords detected.",
    }
  }

  if (hasRiskThreshold) {
    return {
      escalate: true,
      terms,
      reason: "AI risk score reached 80+.",
    }
  }

  if (hasAllKeywords) {
    return {
      escalate: true,
      terms,
      reason: `All critical clinical keywords detected: ${terms.join(", ")}.`,
    }
  }

  return {
    escalate: false,
    terms: [],
    reason: "",
  }
}

function normalizeEscalationSeverity(score: number) {
  return riskSeverity(score)
}

export function listEscalations(): EscalationRecord[] {
  return readEscalations().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export function listEscalationsForPatient(patientId: string) {
  return listEscalations().filter((item) => item.patientId === patientId)
}

export function listEscalationAuditLog(): EscalationAuditLogEntry[] {
  return readAuditLog().sort((left, right) => right.timestamp.localeCompare(left.timestamp))
}

export function createEscalationFromNote(input: {
  patientId: string
  patientName: string
  room: string
  note: NursingNote
  riskScore: number
}): EscalationRecord | null {
  const decision = decideEscalation(input.note, input.riskScore)
  if (!decision.escalate) return null

  const existing = readEscalations().find((entry) => entry.noteId === input.note.id)
  if (existing) return existing

  const now = new Date().toISOString()
  const nextRecord: EscalationRecord = {
    id: buildEscalationId(),
    patientId: input.patientId,
    patientName: input.patientName,
    room: input.room,
    noteId: input.note.id,
    noteText: input.note.noteText || input.note.abnormalEvents || "No detailed note text.",
    riskScore: input.riskScore,
    severity: normalizeEscalationSeverity(input.riskScore),
    reason: decision.reason,
    triggerTerms: decision.terms,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    timeline: [
      {
        status: "pending",
        at: now,
        actor: "AI engine",
        note: `Auto-created: ${decision.reason}`,
      },
  ],
    messagePreview: buildEscalationMessage({
      patientName: input.patientName,
      room: input.room,
      riskScore: input.riskScore,
      severity: normalizeEscalationSeverity(input.riskScore),
      reason: decision.reason,
      triggerTerms: decision.terms,
      noteText: input.note.noteText || input.note.abnormalEvents || "No detailed note text.",
    }),
  }

  const next = [nextRecord, ...readEscalations()].slice(0, 600)
  writeEscalations(next)

  appendAudit(
    {
      type: "created",
      action: "Escalation created",
      details: decision.reason,
      actor: "AI engine",
    },
    nextRecord,
  )
  announceClinicalDataUpdate()
  return nextRecord
}

export function updateEscalationStatus(input: {
  id: string
  status: EscalationStatus
  actor?: string
  note?: string
}): EscalationRecord | null {
  const entries = readEscalations()
  const index = entries.findIndex((item) => item.id === input.id)
  if (index === -1) return null

  const previous = entries[index]
  if (previous.status === input.status) return previous

  const actor = input.actor || "Nurse"
  const nextStatusText = input.status.replace("_", " ")
  const note = input.note || `Status changed from ${previous.status} to ${nextStatusText}.`

  const updated: EscalationRecord = {
    ...previous,
    status: input.status,
    updatedAt: new Date().toISOString(),
    timeline: addStatusTimeline(previous, input.status, actor, note),
  }

  entries[index] = updated
  writeEscalations(entries)

  appendAudit(
    {
      type: "status-changed",
      previousStatus: previous.status,
      nextStatus: input.status,
      actor,
      details: note,
    },
    updated,
  )
  announceClinicalDataUpdate()
  return updated
}

export function setEscalationStatus(input: Parameters<typeof updateEscalationStatus>[0]) {
  return updateEscalationStatus(input)
}

export function recordEscalationWhatsappTrigger(id: string, actor: string, success: boolean, details: string) {
  const escalations = readEscalations()
  const index = escalations.findIndex((item) => item.id === id)
  if (index === -1) return null

  const record = escalations[index]
  const status = success ? "escalated" : record.status
  const timestamp = new Date().toISOString()
  const actionDetail = success
    ? {
        type: "whatsapp-trigger",
        action: "Escalation message triggered",
        actor,
        details,
        success,
      }
    : {
        type: "whatsapp-trigger",
        action: "Escalation message failed",
        actor,
        details,
        success,
      }

  const statusText = success && status !== record.status ? status : record.status
  const nextRecord: EscalationRecord = {
    ...record,
    status: statusText,
    updatedAt: timestamp,
    timeline: [
      ...record.timeline,
      {
        status: statusText,
        at: timestamp,
        actor,
        note: details,
      },
    ],
  }

  escalations[index] = nextRecord
  writeEscalations(escalations)
  appendAudit(actionDetail, nextRecord)
  announceClinicalDataUpdate()
  return nextRecord
}

export function buildEscalationMessage(input: {
  patientName: string
  room: string
  riskScore: number
  severity: ReturnType<typeof riskSeverity>
  reason: string
  triggerTerms: string[]
  noteText: string
}) {
  return [
    "WMC AI Escalation Trigger (Simulation)",
    "",
    `Patient: ${input.patientName}`,
    `Room: ${input.room}`,
    `Risk score: ${input.riskScore}`,
    `Severity: ${input.severity.toUpperCase()}`,
    `Reason: ${input.reason}`,
    `Trigger terms: ${input.triggerTerms.length ? input.triggerTerms.join(", ") : "None"}`,
    `Observation: ${input.noteText}`,
    "Recommended action: Move to supervisor review and perform bedside reassessment before shift handover.",
    `Time: ${new Date().toLocaleString()}`,
  ].join("\n")
}

export function escalationStatusTone(level: EscalationStatus) {
  if (level === "resolved") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (level === "escalated") return "bg-rose-100 text-rose-700 border-rose-200"
  if (level === "supervisor_review") return "bg-orange-100 text-orange-700 border-orange-200"
  if (level === "nurse_review") return "bg-amber-100 text-amber-700 border-amber-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

export function escalationSeverityTone(level: ReturnType<typeof riskSeverity>) {
  if (level === "red") return "bg-rose-100 text-rose-700 border-rose-200"
  if (level === "orange") return "bg-orange-100 text-orange-700 border-orange-200"
  if (level === "yellow") return "bg-yellow-100 text-yellow-700 border-yellow-200"
  return "bg-green-100 text-green-700 border-green-200"
}

export function escalationStatusLabel(status: EscalationStatus) {
  if (status === "nurse_review") return "nurse review"
  if (status === "supervisor_review") return "supervisor review"
  if (status === "escalated") return "escalated"
  if (status === "resolved") return "resolved"
  return "pending"
}

