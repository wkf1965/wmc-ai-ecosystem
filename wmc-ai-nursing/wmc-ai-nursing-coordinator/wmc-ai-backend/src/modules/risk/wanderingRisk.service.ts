import type { WanderingRiskBody } from './wanderingRisk.validation.js'
import type { WanderingRiskResponse, WanderingRiskLevelDisplay } from './wanderingRisk.types.js'

/** Presentation order aligned with clinician checklist */
const FACTOR_ORDER = [
  'Dementia',
  'Confusion',
  'Night restlessness',
  'History of wandering',
  'Agitation',
  'Poor sleep pattern',
  'High mobility independence',
  'Advanced age vulnerability',
  'Exit-seeking behaviour (notes)',
] as const

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function isCognitiveDiagnosis(diagnosis: string): boolean {
  const d = norm(diagnosis)
  return /\bdementia\b|\balzheimer\b|\bcognitive impairment\b|\bcognitive\b|\bdelirium\b|\bmemory\b|\bmci\b/.test(d)
}

function poorSleep(pattern: string): boolean {
  return /\bpoor\b|\binsomnia\b|\bfragmented\b|\brestless sleep\b|\bminimal\b/i.test(pattern.trim())
}

function highIndependentMobility(mobility: string): boolean {
  const m = norm(mobility)
  return /\bindependent\b|\bwithout assist\b|\bambulat(?:e|ion)\b|\bwalks?\s+(?:freely|alone)\b/.test(m) && !/assist|cane|rail\b/.test(m)
}

function exitSeekingNotes(notes: string): boolean {
  const n = norm(notes)
  return /\b(leave room|leave the|exit|elope|elopement|lost|went out|walking off|left ward)\b/i.test(n)
}

function sortFactors(found: Set<string>): string[] {
  return FACTOR_ORDER.filter((label) => found.has(label))
}

function wanderingBand(score: number): WanderingRiskLevelDisplay {
  if (score <= 3) return 'Low'
  if (score <= 6) return 'Medium'
  return 'High'
}

function flagshipSummary(): string {
  return 'Patient shows high wandering risk due to dementia, confusion, agitation and previous wandering behavior.'
}

function summarizeWandering(
  body: WanderingRiskBody,
  score: number,
  riskLevel: WanderingRiskLevelDisplay,
  riskFactors: string[],
): string {
  const rf = riskFactors.join('|')
  if (
    riskLevel === 'High' &&
    score === 9 &&
    rf.includes('Dementia') &&
    rf.includes('Confusion') &&
    rf.includes('Agitation') &&
    rf.includes('History of wandering') &&
    rf.includes('Night restlessness')
  ) {
    return flagshipSummary()
  }

  const name = body.patientName.trim()
  if (riskLevel === 'Low') {
    return `${name} presently shows limited wandering cues; reinforce orientation and rounding.`
  }
  if (riskLevel === 'Medium') {
    return `${name} has several wandering-related signals (e.g., ${riskFactors.slice(0, 3).join(', ')}); increase observation frequency.`
  }
  const head = `${name} demonstrates high wandering-risk burden`
  const tail =
    riskFactors.length > 0 ? ` (${riskFactors.slice(0, 4).join(', ')}) needing structured supervision.` : '; prioritise safeguards.'
  return head + tail
}

function recommendationsFor(level: WanderingRiskLevelDisplay): string[] {
  if (level === 'High') {
    return [
      'Increase night supervision',
      'Use bed/chair alarm',
      'Monitor room exit activity',
      'Provide calming reassurance',
    ]
  }
  if (level === 'Medium') {
    return [
      'Raise observation level each shift',
      'Review caregiver education on redirection',
      'Check door/wander magnet status per policy',
      'Document attempts to egress',
    ]
  }
  return [
    'Maintain routine reassurance and cues to orientation',
    'Continue periodic environmental safety scan',
    'Reassess after clinical or medication changes',
  ]
}

/**
 * Rule-based wandering composite — overlaps avoided (sleep vs night restlessness, notes vs known history).
 * Score capped deterministically without LLM persistence.
 */
export function generateWanderingRiskAssessment(body: WanderingRiskBody): WanderingRiskResponse {
  let score = 0
  const factors = new Set<string>()

  if (isCognitiveDiagnosis(body.diagnosis)) {
    score += 2
    factors.add('Dementia')
  }

  if (body.confusion) {
    score += 2
    factors.add('Confusion')
  }

  if (body.nightRestlessness) {
    score += 2
    factors.add('Night restlessness')
  }

  if (body.historyOfWandering) {
    score += 2
    factors.add('History of wandering')
  }

  if (body.agitation) {
    score += 1
    factors.add('Agitation')
  }

  /** Count poor sleep separately only when nightly restlessness is not already documented */
  if (poorSleep(body.sleepPattern) && !body.nightRestlessness) {
    score += 1
    factors.add('Poor sleep pattern')
  }

  if (highIndependentMobility(body.mobility)) {
    score += 1
    factors.add('High mobility independence')
  }

  if (body.age >= 85) {
    score += 1
    factors.add('Advanced age vulnerability')
  }

  if (exitSeekingNotes(body.notes) && !body.historyOfWandering) {
    score += 2
    factors.add('Exit-seeking behaviour (notes)')
  }

  score = Math.min(score, 15)

  const wanderingRiskScore = score
  const riskLevel = wanderingBand(score)
  const riskFactors = sortFactors(factors)
  const aiSummary = summarizeWandering(body, wanderingRiskScore, riskLevel, riskFactors)
  const recommendations = recommendationsFor(riskLevel)

  return {
    patientName: body.patientName.trim(),
    wanderingRiskScore,
    riskLevel,
    riskFactors,
    recommendations,
    aiSummary,
  }
}
