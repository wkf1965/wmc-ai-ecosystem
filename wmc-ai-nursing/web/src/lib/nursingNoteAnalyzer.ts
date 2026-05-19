import type { NursingNote } from "./nursingNotes"
import { Patient } from "./patientManagement"

type RiskTone = "low" | "medium" | "high"

export type NoteRiskSignal = {
  label: string
  score: number
  reason: string
  escalation: "routine" | "monitor" | "escalate-now"
  recommendation: string
}

export type NursingNoteAnalysis = {
  patientId?: string
  patientName?: string
  riskScore: number
  tone: RiskTone
  signals: NoteRiskSignal[]
  actions: string[]
  escalate: boolean
}

type NoteTextInput = Pick<
  NursingNote,
  | "appetite"
  | "mood"
  | "bloodPressure"
  | "bloodSugar"
  | "urination"
  | "bowelMovement"
  | "skinCondition"
  | "abnormalEvents"
  | "nurseRemarks"
  | "mobility"
  | "painScore"
  | "noteText"
>

type AnalyzerInput = NoteTextInput & {
  patientId?: string
  hydrationWatch?: boolean
}

type TrendDirection = "improving" | "stable" | "worsening"

export type NursingNoteAnalysisEntry = {
  noteId: string
  date: string
  analysis: NursingNoteAnalysis
}

export type NursingNoteBatchSummary = {
  trend: TrendDirection
  count: number
  latestScore: number
  highestScore: number
  averageScore: number
  escalationCount: number
  entries: NursingNoteAnalysisEntry[]
}

const baseTone = (score: number) => {
  if (score >= 75) return "high"
  if (score >= 35) return "medium"
  return "low"
}

const clamp = (value: number) => Math.max(0, Math.min(100, value))

const toLower = (value: string) => String(value ?? "").toLowerCase()

function parseBloodPressure(text: string) {
  const numeric = String(text || "").match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
  if (!numeric) return null

  const systolic = Number.parseInt(numeric[1], 10)
  const diastolic = Number.parseInt(numeric[2], 10)
  if (Number.isNaN(systolic) || Number.isNaN(diastolic)) return null

  const flags = [] as string[]
  if (systolic >= 180 || diastolic >= 120) {
    flags.push("critical blood pressure pattern detected")
  } else if (systolic >= 160 || diastolic >= 100) {
    flags.push("severely elevated blood pressure")
  } else if (systolic <= 90 || diastolic <= 50) {
    flags.push("hypotension pattern detected")
  }

  return {
    systolic,
    diastolic,
    flags,
  }
}

function parseBloodSugar(text: string) {
  const sugar = String(text || "").match(/(\d{2,3})/)
  if (!sugar) return null

  const value = Number.parseInt(sugar[1], 10)
  if (Number.isNaN(value)) return null

  const flags = [] as string[]
  if (value >= 300) flags.push("critical hyperglycemia")
  else if (value >= 220) flags.push("marked hyperglycemia")
  else if (value <= 60) flags.push("severe hypoglycemia risk")
  else if (value <= 80) flags.push("low blood sugar")

  return { value, flags }
}

function createSignal(label: string, score: number, reason: string, escalation: "routine" | "monitor" | "escalate-now", recommendation: string) {
  return {
    label,
    score: clamp(score),
    reason,
    escalation,
    recommendation,
  }
}

function hasTerm(text: string, terms: string[]) {
  const lower = toLower(text)
  return terms.filter((term) => lower.includes(term))
}

function escalateFromScore(score: number) {
  if (score >= 70) return true
  if (score >= 40) return false
  return false
}

function analyzeTextSignals(noteText: string) {
  const signals: NoteRiskSignal[] = []

  const fallSignals = hasTerm(noteText, [
    "near fall",
    "unstable",
    "dizzy",
    "unable to stand",
    "unsteady",
    "fell",
    "slipped",
    "transfer",
    "fall risk",
  ])
  if (fallSignals.length > 0) {
    signals.push(
      createSignal(
        "Fall risk",
        28 + fallSignals.length * 9,
        `Detected terms: ${fallSignals.join(", ")}`,
        "escalate-now",
        "Increase 1:1 assist for transfers and schedule hourly rounds.",
      ),
    )
  }

  const skinSignals = hasTerm(noteText, [
    "redness",
    "rash",
    "open skin",
    "breakdown",
    "wound",
    "ulcer",
    "excoriation",
    "skin tear",
    "pressure sore",
    "pressure sore risk",
  ])
  if (skinSignals.length > 0) {
    signals.push(
      createSignal(
        "Skin and tissue risk",
        22 + skinSignals.length * 7,
        `Detected terms: ${skinSignals.join(", ")}`,
        "monitor",
        "Perform focused skin assessment and document staging and intervention immediately.",
      ),
    )
  }

  const mentalSignals = hasTerm(noteText, [
    "agitated",
    "withdrawn",
    "tearful",
    "anxious",
    "confused",
    "disoriented",
    "confusion",
    "aggressive",
  ])
  if (mentalSignals.length > 0) {
    signals.push(
      createSignal(
        "Emotional distress",
        18 + mentalSignals.length * 6,
        `Detected terms: ${mentalSignals.join(", ")}`,
        "monitor",
        "Notify charge nurse and include emotional trend in handover note.",
      ),
    )
  }

  const appetiteSignals = hasTerm(noteText, [
    "reduced",
    "poor appetite",
    "refused meals",
    "didn't eat",
    "no intake",
    "low appetite",
  ])
  if (appetiteSignals.length > 0) {
    signals.push(
      createSignal(
        "Nutrition and hydration",
        16 + appetiteSignals.length * 5,
        `Detected terms: ${appetiteSignals.join(", ")}`,
        "monitor",
        "Initiate intake monitoring and escalate nutrition support if intake remains low at lunch and dinner.",
      ),
    )
  }

  const hydrationSignals = hasTerm(noteText, [
    "dehydration",
    "dry mouth",
    "low urine",
    "dark urine",
    "dry lips",
    "poor hydration",
  ])
  if (hydrationSignals.length > 0) {
    signals.push(
      createSignal(
        "Dehydration",
        18 + hydrationSignals.length * 6,
        `Detected terms: ${hydrationSignals.join(", ")}`,
        "monitor",
        "Prioritize fluid monitoring and review IV or oral hydration orders if output remains low.",
      ),
    )
  }

  return signals
}

export function analyzeNursingNote(input: AnalyzerInput, patient?: Patient | null): NursingNoteAnalysis {
  const noteText = [
    input.appetite,
    input.mood,
    input.skinCondition,
    input.abnormalEvents,
    input.nurseRemarks,
    input.bowelMovement,
    input.urination,
    input.mobility,
    input.noteText,
    input.painScore ? `pain score ${input.painScore}` : "",
  ]
    .map(toLower)
    .join(" ")

  const signals: NoteRiskSignal[] = analyzeTextSignals(noteText)
  const painScore = Number.parseInt(String(input.painScore || ""), 10)

  if (!Number.isNaN(painScore) && painScore >= 8) {
    signals.unshift(
      createSignal(
        "High pain burden",
        30 + painScore,
        `Pain score ${painScore} reported`,
        "monitor",
        "Escalate pain assessment and review comfort interventions.",
      ),
    )
  } else if (!Number.isNaN(painScore) && painScore >= 5) {
    signals.push(
      createSignal(
        "Moderate pain burden",
        20 + painScore,
        `Pain score ${painScore} reported`,
        "monitor",
        "Review pain schedule and non-pharmacologic comfort support.",
      ),
    )
  }

  const bp = parseBloodPressure(input.bloodPressure)
  if (bp && bp.flags.length > 0) {
    signals.push(
      createSignal(
        "Vitals: blood pressure",
        bp.flags.includes("critical blood pressure pattern detected") ? 34 : 20,
        `BP observed as ${input.bloodPressure}: ${bp.flags.join(", ")}`,
        bp.flags.includes("critical blood pressure pattern detected") ? "escalate-now" : "monitor",
        "Recheck BP within 30 minutes and review medication tolerance.",
      ),
    )
  }

  const glucose = parseBloodSugar(input.bloodSugar)
  if (glucose && glucose.flags.length > 0) {
    signals.push(
      createSignal(
        "Vitals: blood glucose",
        glucose.flags.some((item) => item.includes("critical") || item.includes("severe"))
          ? 30
          : 16,
        `Blood sugar ${input.bloodSugar}: ${glucose.flags.join(", ")}`,
        glucose.flags.some((item) => item.includes("critical") || item.includes("severe")) ? "escalate-now" : "monitor",
        "Assess for symptoms and escalate clinical review of glucose control.",
      ),
    )
  }

  if (input.hydrationWatch) {
    signals.push(
      createSignal(
        "Hydration watch",
        12,
        "Care handoff flagged hydration watch",
        "monitor",
        "Increase fluid intake log and monitor urine output hourly.",
      ),
    )
  }

  if (patient) {
    const baseline = toLower(patient.fallRisk)
    if (baseline === "high") {
      signals.push(
        createSignal(
          "Baseline fall risk",
          16,
          `Patient risk baseline is ${patient.fallRisk}`,
          "monitor",
          "Use walker/wheelchair protocol and ensure immediate call-bell access.",
        ),
      )
    }
    if (toLower(patient.pressureSoreRisk) === "high") {
      signals.push(
        createSignal(
          "Baseline pressure risk",
          14,
          `Patient risk baseline is ${patient.pressureSoreRisk}`,
          "monitor",
          "Ensure skin rounds every 2 hours and check heel/chair cushions.",
        ),
      )
    }
  }

  const uniqueSignals = new Map<string, NoteRiskSignal>()
  for (const signal of signals) {
    uniqueSignals.set(signal.label, signal)
  }
  const merged = Array.from(uniqueSignals.values()).sort((left, right) => right.score - left.score)

  const riskScore = merged.reduce((acc, item) => acc + item.score, 0)
  const tone = baseTone(riskScore)
  const escalate = merged.some((item) => item.escalation === "escalate-now") || escalateFromScore(riskScore)

  const actions = merged.slice(0, 4).map((item) => item.recommendation)

  return {
    patientId: patient?.id,
    patientName: patient?.fullName,
    riskScore,
    tone,
    signals: merged,
    actions,
    escalate,
  }
}

export function summarizeNursingNotes(notes: NursingNote[], patient?: Patient | null): NursingNoteBatchSummary {
  if (notes.length === 0) {
    return {
      trend: "stable",
      count: 0,
      latestScore: 0,
      highestScore: 0,
      averageScore: 0,
      escalationCount: 0,
      entries: [],
    }
  }

  const entries = notes
    .map((note) => ({
      noteId: note.id,
      date: note.date,
      analysis: analyzeNursingNote(note, patient),
    }))
    .sort((left, right) => right.date.localeCompare(left.date))

  const scores = entries.map((entry) => entry.analysis.riskScore)
  const latestScore = scores[0]
  const highestScore = scores.length === 0 ? 0 : Math.max(...scores)
  const averageScore = scores.length === 0 ? 0 : Math.round(scores.reduce((total, current) => total + current, 0) / scores.length)
  const escalationCount = entries.filter((entry) => entry.analysis.escalate).length

  let trend: TrendDirection = "stable"
  if (scores.length > 1) {
    const delta = scores[0] - scores[1]
    if (delta >= 10) trend = "worsening"
    else if (delta <= -10) trend = "improving"
  }

  return {
    trend,
    count: entries.length,
    latestScore,
    highestScore,
    averageScore,
    escalationCount,
    entries,
  }
}
