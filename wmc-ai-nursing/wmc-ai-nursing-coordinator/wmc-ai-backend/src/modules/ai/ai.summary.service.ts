import { z } from 'zod'
import { nursingStructuredSummarySchema } from './ai.summary.validation.js'

export type NursingStructuredSummaryInput = z.infer<typeof nursingStructuredSummarySchema>

export type NursingSummaryRisk = 'low' | 'moderate' | 'high'

export interface NursingRuleSummaryOutput {
  summary: string
  riskLevel: NursingSummaryRisk
  nextAction: string
}

function parseBp(s: string): { sys?: number; dia?: number } {
  const m = s.trim().match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) return {}
  return { sys: Number(m[1]), dia: Number(m[2]) }
}

function painLabel(score: number): string {
  if (score <= 3) return 'mild'
  if (score <= 6) return 'moderate'
  return 'severe'
}

function woundSoundsConcerning(woundCondition: string): boolean {
  const t = woundCondition.toLowerCase()
  return (
    /\b(redness|red|pus|weeping|necrot|cavity|odor|malodor|infection|slough|dehiscence)\b/i.test(
      t,
    ) && !/\bno\s+(redness|signs of infection|drainage)\b/i.test(t)
  )
}

function classifyRisk(input: NursingStructuredSummaryInput): NursingSummaryRisk {
  const { sys, dia } = parseBp(input.bloodPressure)
  let score = 0

  if (input.painScore >= 7) score += 3
  else if (input.painScore >= 4) score += 1

  if (input.oxygen < 92) score += 3
  else if (input.oxygen < 95) score += 1

  if (input.temperature >= 38.5 || input.temperature <= 35.5) score += 3
  else if (input.temperature >= 38.0) score += 1

  if (input.pulse >= 120 || input.pulse <= 50) score += 2
  else if (input.pulse >= 110 || input.pulse <= 55) score += 1

  if (sys !== undefined && dia !== undefined) {
    if (sys >= 180 || dia >= 110 || sys < 90) score += 3
    else if (sys >= 160 || dia >= 100 || sys < 95) score += 2
    else if (sys >= 140 || dia >= 90) score += 1
  }

  if (woundSoundsConcerning(input.woundCondition)) score += 2

  if (score >= 4) return 'high'
  if (score >= 2) return 'moderate'
  return 'low'
}

/** Fold free-text notes into the first sentence when they read like a status line. */
function buildOpening(patientName: string, notes: string, risk: NursingSummaryRisk): string {
  const n = notes.trim()
  if (n) {
    if (risk === 'low' && /^patient\s+/i.test(n)) {
      const rest = n.replace(/^patient\s+/i, '').trim()
      const body = /^is\b/i.test(rest) ? rest : `is ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`
      return `${patientName} ${body.endsWith('.') ? body : `${body}.`}`
    }
    return `${patientName}: ${n.endsWith('.') ? n : `${n}.`}`
  }
  if (risk === 'low') return `${patientName} is clinically stable today.`
  if (risk === 'moderate') return `${patientName} shows observations that merit follow-up monitoring.`
  return `${patientName} shows several concerning indicators that warrant prompt review.`
}

function vitalsClause(input: NursingStructuredSummaryInput, risk: NursingSummaryRisk): string {
  const { sys, dia } = parseBp(input.bloodPressure)
  const parts: string[] = []

  if (risk === 'low' && input.oxygen >= 95 && input.temperature > 35.5 && input.temperature < 38.0) {
    if (
      sys !== undefined &&
      dia !== undefined &&
      sys < 160 &&
      dia < 100 &&
      sys >= 90 &&
      input.pulse > 55 &&
      input.pulse < 110
    ) {
      return 'Vital signs are within acceptable range.'
    }
  }

  parts.push(`Blood pressure ${input.bloodPressure.trim()}, pulse ${input.pulse}`)
  parts.push(`temperature ${input.temperature}°C`)
  parts.push(`oxygen saturation ${input.oxygen}%`)

  const tail = parts.join('; ') + '.'
  return risk === 'high' ? `Review vitals closely: ${tail}` : `${tail}`
}

function appetiteMoodSentence(appetite: string, mood: string): string {
  const goodAppetite = /good|normal|fair|adequate/i.test(appetite)
  const calmMood = /calm|good|positive|pleasant|stable/i.test(mood)
  let s = ''
  if (goodAppetite && calmMood) s = 'Appetite and mood are good.'
  else if (goodAppetite)
    s = `Appetite is acceptable; mood described as "${mood.trim()}".`
  else if (calmMood)
    s = `Appetite reported as "${appetite.trim()}" with a favorable mood tone.`
  else s = `Appetite: ${appetite.trim()}. Mood: ${mood.trim()}.`
  return s
}

function mobilitySentence(mobility: string): string {
  const m = mobility.trim()
  if (/independent|self/i.test(m)) return 'Mobility is largely independent.'
  if (/assist|wheelchair|walker|help/i.test(m)) return 'Mobility still requires assistance.'
  return `Mobility: ${m}.`
}

function sideTurningSentence(sideTurning: string): string {
  const s = sideTurning.trim()
  if (/completed|done|clear|adjusted/i.test(s)) return 'Side turning was completed.'
  return `Side turning / repositioning: ${s}.`
}

function woundSentence(woundCondition: string): string {
  const w = woundCondition.trim()
  if (/\bno\b.*\bredness\b|\bno redness\b|\bclean\b|\bhealing\b/i.test(w)) return 'No wound redness noted.'
  if (woundSoundsConcerning(woundCondition)) return `W/skin: ${w} — escalate if worsening.`
  return `Wound/skin observation: ${w}.`
}

function nextActionFor(risk: NursingSummaryRisk): string {
  switch (risk) {
    case 'high':
      return 'Notify the responsible clinician urgently and increase observation frequency.'
    case 'moderate':
      return 'Recheck vital signs sooner; notify the supervising nurse if trends worsen.'
    default:
      return 'Continue monitoring and assist mobility.'
  }
}

/** Rule-based narrative from structured nursing observations (placeholder for LLM). */
export function generateNursingRecordSummary(input: NursingStructuredSummaryInput): NursingRuleSummaryOutput {
  const risk = classifyRisk(input)
  const opener = buildOpening(input.patientName.trim(), input.notes, risk)
  const vp = vitalsClause(input, risk)

  const sentences = [
    opener,
    vp,
    `Pain score is ${painLabel(input.painScore)}.`,
    appetiteMoodSentence(input.appetite, input.mood),
    mobilitySentence(input.mobility),
    sideTurningSentence(input.sideTurning),
    woundSentence(input.woundCondition),
  ]

  const summary = sentences.map((x) => (x.endsWith('.') ? x : `${x}.`)).join(' ')

  return {
    summary,
    riskLevel: risk,
    nextAction: nextActionFor(risk),
  }
}
