import type { VitalsAnalyzeBody } from './vitalsAnalyze.validation.js'
import type { VitalAlertLevelDisplay, VitalsAnalyzeResponse } from './vitalsAnalyze.types.js'

function parseBp(s: string): { sys?: number; dia?: number } {
  const m = s.trim().match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) return {}
  return { sys: Number(m[1]), dia: Number(m[2]) }
}

/** Stable presentation order */
const SIGN_ORDER = [
  'High blood pressure',
  'Low blood pressure',
  'Fast pulse',
  'Fever',
  'Low oxygen',
  'High pain score',
] as const

function assignBand(signCount: number): VitalAlertLevelDisplay {
  if (signCount >= 4) return 'High'
  if (signCount >= 2) return 'Medium'
  return 'Low'
}

/** Rule-based vital-sign screen — no persistence */
export function analyzeVitals(body: VitalsAnalyzeBody): VitalsAnalyzeResponse {
  const { sys, dia } = parseBp(body.bloodPressure)
  const signs = new Set<string>()

  if (sys !== undefined && dia !== undefined) {
    if (sys >= 140 || dia >= 90) signs.add('High blood pressure')
    if (sys < 90 || dia < 60) signs.add('Low blood pressure')
  }

  if (body.pulse >= 100) signs.add('Fast pulse')

  if (body.temperature >= 38.0) signs.add('Fever')

  if (body.oxygen < 95) signs.add('Low oxygen')

  if (body.painScore >= 7) signs.add('High pain score')

  const abnormalSigns = SIGN_ORDER.filter((label) => signs.has(label))
  const alertLevel = assignBand(abnormalSigns.length)

  const recommendations: string[] = []

  if (alertLevel === 'High') {
    recommendations.push(
      'Inform nurse in charge',
      'Recheck vital signs',
      'Monitor oxygen level',
      'Escalate to doctor if condition continues',
    )
  } else if (alertLevel === 'Medium') {
    recommendations.push('Notify supervising nurse', 'Repeat vital signs within 1 hour')
    if (signs.has('Low oxygen')) recommendations.push('Monitor oxygen saturation closely')
    if (signs.has('High blood pressure')) recommendations.push('Review BP trends and medications when appropriate')
    if (signs.has('Fever')) recommendations.push('Assess infection sources and comfort measures')
  } else {
    recommendations.push('Continue routine observation', 'Document trends if symptoms evolve')
    if (abnormalSigns.length === 1) recommendations.push('Single-parameter deviation — correlate clinically')
  }

  return {
    patientName: body.patientName.trim(),
    alertLevel,
    abnormalSigns,
    recommendations: [...new Set(recommendations)],
  }
}
