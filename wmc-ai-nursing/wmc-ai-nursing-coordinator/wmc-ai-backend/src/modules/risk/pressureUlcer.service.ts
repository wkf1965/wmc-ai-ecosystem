import type { PressureUlcerBody } from './pressureUlcer.validation.js'
import type { PressureUlcerRiskLevelDisplay, PressureUlcerRiskResponse } from './pressureUlcer.types.js'

function nutritionPoor(status: string): boolean {
  return /\bpoor\b|\binsufficient\b|\bat\s*risk\b|\bmalnutrition\b/i.test(status.trim())
}

function skinShowsRedness(condition: string): boolean {
  return /\bredness\b|\bred\b|\beryth\b|\bdiscolor/i.test(condition.trim())
}

function moistureHigh(moisture: string): boolean {
  return /\bhigh\b|\bheavy\b|\bsaturating\b|\bwet\b|\bsweat/i.test(moisture.trim())
}

function mobilityVeryLimited(mobility: string): boolean {
  const m = mobility.trim().toLowerCase()
  return /\bimmobile\b|\bbe?d\s*bound\b|\bbedridden\b|\blimited\b|\bchair\b|\bcrawl\b/i.test(m)
}

function hasImmobility(body: PressureUlcerBody): boolean {
  return body.bedbound || mobilityVeryLimited(body.mobility)
}

/** Align bands so flagship composite (~10 pts) reads High without crowding Moderate band */
function band(score: number): PressureUlcerRiskLevelDisplay {
  if (score <= 4) return 'Low'
  if (score <= 7) return 'Moderate'
  return 'High'
}

/**
 * Weighted Braden-style heuristic — flagship Ah Chong demo totals **10** with High tier.
 * Single score per domain where overlaps apply (immobility umbrella covers bedbound + limited mobility).
 */
export function generatePressureUlcerRiskAssessment(body: PressureUlcerBody): PressureUlcerRiskResponse {
  let score = 0

  if (hasImmobility(body)) score += 2
  if (!body.sideTurningCompleted) score += 2
  if (nutritionPoor(body.nutritionStatus)) score += 2
  if (skinShowsRedness(body.skinCondition)) score += 1
  if (moistureHigh(body.moisture)) score += 1
  if (body.incontinence) score += 2

  const pressureUlcerRiskScore = score

  const riskFactors: string[] = []
  if (hasImmobility(body)) riskFactors.push('Immobility')
  if (!body.sideTurningCompleted) riskFactors.push('Missed side turning')
  if (nutritionPoor(body.nutritionStatus)) riskFactors.push('Poor nutrition')
  if (skinShowsRedness(body.skinCondition)) riskFactors.push('Skin redness')
  if (moistureHigh(body.moisture)) riskFactors.push('Moisture exposure')
  if (body.incontinence) riskFactors.push('Incontinence')

  const riskLevel = band(pressureUlcerRiskScore)

  const recommendations: string[] = []

  if (riskLevel === 'High') {
    if (!body.sideTurningCompleted) recommendations.push('Immediate side turning')
    if (hasImmobility(body)) recommendations.push('Pressure relief mattress')
    recommendations.push('Monitor skin every shift')
  }

  if (riskLevel === 'Moderate') {
    recommendations.push('Increase repositioning frequency')
    recommendations.push('Skin checks at least twice per shift')
    if (hasImmobility(body)) recommendations.push('Evaluate pressure-relieving equipment')
  }

  if (riskLevel === 'Low') {
    recommendations.push('Maintain usual skin-care rounding')
    if (nutritionPoor(body.nutritionStatus)) recommendations.push('Nutrition counselling if intake falls')
  }

  if (nutritionPoor(body.nutritionStatus)) recommendations.push('Improve nutrition')

  if (moistureHigh(body.moisture) || body.incontinence) recommendations.push('Apply barrier cream')

  /** Dedupe while preserving first occurrence order */
  const seen = new Set<string>()
  const deduped = recommendations.filter((r) => {
    if (seen.has(r)) return false
    seen.add(r)
    return true
  })

  return {
    patientName: body.patientName.trim(),
    pressureUlcerRiskScore,
    riskLevel,
    riskFactors,
    recommendations: deduped,
  }
}
