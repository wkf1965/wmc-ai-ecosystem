import { listNotes } from "./nursingNotes"
import { listPatients, Patient, FALL_RISK_OPTIONS } from "./patientManagement"
import type { NursingNote } from "./nursingNotes"

export type RiskCategory = {
  id: string
  label: string
  score: number
  warning: string
  escalate: boolean
  signals: string[]
  action: string
}

export type PatientRiskProfile = {
  patientId: string
  patientName: string
  totalScore: number
  riskBadge: "low" | "medium" | "high"
  categories: RiskCategory[]
  severity: "green" | "yellow" | "orange" | "red"
}

export type PatientNoteRiskProfile = {
  patientId: string
  patientName: string
  at: string
  noteId: string
  totalScore: number
  riskBadge: "low" | "medium" | "high"
  categories: RiskCategory[]
  severity: "green" | "yellow" | "orange" | "red"
}

function norm(value: string) {
  return String(value || "").toLowerCase()
}

function scoreFromTerms(text: string, map: Record<string, number>) {
  let score = 0
  const matched: string[] = []
  for (const [term, increment] of Object.entries(map)) {
    if (text.includes(term)) {
      score += increment
      matched.push(term)
    }
  }
  return { score, matched }
}

function mapTone(score: number) {
  if (score >= 60) return "high"
  if (score >= 35) return "medium"
  return "low"
}

export function riskSeverity(score: number) {
  if (score >= 80) return "red"
  if (score >= 60) return "orange"
  if (score >= 35) return "yellow"
  return "green"
}

function clamp(score: number) {
  return Math.max(0, Math.min(100, score))
}

function riskSignal(
  label: string,
  base: number,
  termsMap: Record<string, number>,
  noteText: string,
): RiskCategory | null {
  const match = scoreFromTerms(noteText, termsMap)
  if (match.score === 0) return null
  const score = clamp(base + match.score)
  const warnings = match.matched.map((entry) => `signal: ${entry}`).slice(0, 3)
  const action =
    label === "Fall risk"
      ? "Increase assisted transfer checks and bedside supervision."
      : label === "Infection risk"
        ? "Reassess skin, temp, and sputum/wound status; notify RN lead."
        : label === "Poor appetite"
          ? "Coordinate with nutrition and assess swallow/meal tolerance."
          : label === "Dehydration"
            ? "Track hourly intake and hydration intake/output."
            : label === "Emotional distress"
              ? "Escalate to mental health protocol and involve psychosocial support."
              : "Perform focused neurological and transfer reassessment."

  return {
    id: label.toLowerCase().replace(/\s/g, "-"),
    label,
    score,
    warning: score >= 50 ? "Escalate now" : "Monitor in 1 hour",
    escalate: score >= 60,
    signals: warnings,
    action,
  }
}

function buildNoteText(note: NursingNote) {
  return norm(
    [
      note.appetite,
      note.mood,
      note.noteText,
      note.mobility,
      note.bloodPressure,
      note.bloodSugar,
      note.urination,
      note.bowelMovement,
      note.skinCondition,
      note.abnormalEvents,
      note.nurseRemarks,
      note.painScore ? `pain score ${note.painScore}` : "",
    ].join(" "),
  )
}

function assessRiskFromText(patient: Patient, noteText: string) {
  const categories: RiskCategory[] = []

  const fallBase = patient.fallRisk === FALL_RISK_OPTIONS[2] ? 25 : patient.fallRisk === FALL_RISK_OPTIONS[1] ? 12 : 4
  const fall = riskSignal(
    "Fall risk",
    fallBase,
    {
      "fall risk": 32,
      "fell again": 30,
      "near fall": 28,
      "assist x2": 18,
      unsteady: 16,
      dizziness: 12,
      weakness: 12,
      transfer: 14,
    },
    noteText,
  )
  if (fall) categories.push(fall)

  const infection = riskSignal(
    "Infection risk",
    10,
    {
      fever: 26,
      redness: 22,
      wound: 20,
      coughing: 18,
      chills: 16,
      temperature: 10,
      purulent: 18,
      saturation: 14,
    },
    noteText,
  )
  if (infection) categories.push(infection)

  const pain = riskSignal(
    "Pain distress",
    18,
    {
      pain: 20,
      "pain score": 18,
      "severe pain": 24,
      burning: 18,
      cramp: 16,
    },
    noteText,
  )
  if (pain) categories.push(pain)

  const appetite = riskSignal(
    "Poor appetite",
    8,
    {
      reduced: 24,
      "poor appetite": 26,
      "didn't eat": 26,
      "low intake": 20,
      "refused meals": 22,
    },
    noteText,
  )
  if (appetite) categories.push(appetite)

  const dehydration = riskSignal(
    "Dehydration",
    9,
    {
      dehydration: 22,
      "less than usual": 19,
      "low intake": 19,
      "dry mouth": 18,
      "dry lips": 15,
      "low urine": 17,
      "dark urine": 14,
    },
    noteText,
  )
  if (dehydration) categories.push(dehydration)

  const emotional = riskSignal(
    "Emotional distress",
    8,
    {
      crying: 22,
      anxious: 18,
      withdrawn: 16,
      tearful: 20,
      agitation: 14,
      confused: 14,
      confusion: 14,
      "emotional distress": 24,
      "disoriented x": 16,
    },
    noteText,
  )
  if (emotional) categories.push(emotional)

  const weakness = riskSignal(
    "Sudden weakness",
    9,
    {
      "sudden weakness": 32,
      "can't stand": 28,
      "leg weakness": 23,
      "sudden decline": 24,
      "unable to transfer": 22,
    },
    noteText,
  )
  if (weakness) categories.push(weakness)

  const pressure = riskSignal(
    "Pressure sore risk",
    8,
    {
      "pressure sore": 22,
      "pressure sore risk": 28,
      redness: 20,
      "skin breakdown": 24,
      "open lesion": 30,
      heel: 16,
      coccyx: 16,
      excoriation: 16,
    },
    noteText,
  )
  if (pressure) categories.push(pressure)

  const totalScore = categories.reduce((sum, item) => sum + item.score, 0)
  const riskBadge = mapTone(totalScore)

  return {
    totalScore,
    riskBadge,
    categories: categories.sort((a, b) => b.score - a.score),
  }
}

export function analyzePatientRisk(patient: Patient): PatientRiskProfile {
  const notes = listNotes().filter((item) => item.patientId === patient.id)
  const allText = notes.map((note) => buildNoteText(note)).join(" ")
  const assessment = assessRiskFromText(patient, allText)

  return {
    patientId: patient.id,
    patientName: patient.fullName,
    totalScore: assessment.totalScore,
    riskBadge: assessment.riskBadge,
    categories: assessment.categories,
    severity: riskSeverity(assessment.totalScore),
  }
}

export function analyzePatientNoteRisk(patient: Patient, note: NursingNote): PatientNoteRiskProfile {
  const assessment = assessRiskFromText(patient, buildNoteText(note))

  return {
    patientId: patient.id,
    patientName: patient.fullName,
    at: note.date,
    noteId: note.id,
    totalScore: assessment.totalScore,
    riskBadge: assessment.riskBadge,
    categories: assessment.categories,
    severity: riskSeverity(assessment.totalScore),
  }
}

export function analyzeAllPatients() {
  return listPatients().map(analyzePatientRisk).sort((left, right) => right.totalScore - left.totalScore)
}
