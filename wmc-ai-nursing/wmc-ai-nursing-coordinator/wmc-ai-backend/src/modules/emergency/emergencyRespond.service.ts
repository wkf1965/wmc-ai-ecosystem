import type { EmergencyRespondBody } from './emergencyRespond.validation.js'
import type {
  EmergencyRespondResponse,
  EmergencyResponseTimePriority,
  EmergencySeverityLevel,
} from './emergencyRespond.types.js'

function parseBp(s: string): { sys?: number; dia?: number } {
  const m = s.trim().match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) return {}
  return { sys: Number(m[1]), dia: Number(m[2]) }
}

const EMERGENCY_LABEL_ORDER = [
  'Severe low oxygen',
  'Possible shock',
  'Severe hypotension',
  'Severe hypertension crisis',
  'High fever',
  'Breathing difficulty',
  'Unconsciousness or failure to respond',
] as const

function sortEmergencyLabels(found: Set<string>): string[] {
  return [...EMERGENCY_LABEL_ORDER.filter((label) => found.has(label))]
}

function isUnconsciousness(consciousness: string): boolean {
  return /\b(unconscious|unresponsive|coma|not\s*rousable|failure\s+to\s+respond|gcs\s*[1-9]|non[-\s]?\s*responsive)\b/i.test(
    consciousness,
  )
}

function hypotension(sys?: number, dia?: number): boolean {
  if (sys !== undefined && Number.isFinite(sys) && sys < 90) return true
  if (dia !== undefined && Number.isFinite(dia) && dia < 60) return true
  return false
}

function severeHypertension(sys?: number, dia?: number): boolean {
  if (sys !== undefined && Number.isFinite(sys) && sys >= 180) return true
  if (dia !== undefined && Number.isFinite(dia) && dia >= 110) return true
  return false
}

function shockSuspected(body: EmergencyRespondBody, sys?: number, dia?: number): boolean {
  if (hypotension(sys, dia) && body.pulse >= 100) return true
  if (hypotension(sys, dia) && body.oxygen < 94) return true
  if (hypotension(sys, dia)) return true
  return false
}

function actionsFor(level: EmergencySeverityLevel): string[] {
  const criticalFull = [
    'Notify doctor immediately',
    'Prepare oxygen support',
    'Monitor vital signs continuously',
    'Prepare possible hospital transfer',
    'Stay with patient',
  ]

  switch (level) {
    case 'Critical':
      return criticalFull
    case 'High':
      return [
        'Notify nurse in charge and doctor urgently',
        'Prepare oxygen therapy as protocol allows',
        'Repeat vital signs within 15 minutes',
        'Do not leave patient unattended until stable trend',
      ]
    case 'Medium':
      return [
        'Notify supervising nurse promptly',
        'Repeat vital signs within 30 minutes',
        'Review medications and reversible causes',
        'Escalate to doctor if any deterioration',
      ]
    default:
      return [
        'Continue scheduled observation',
        'Document readings and subjective changes',
        'Reassure patient and correlate clinically',
      ]
  }
}

function responseTime(level: EmergencySeverityLevel): EmergencyResponseTimePriority {
  if (level === 'Critical') return 'Immediate'
  if (level === 'High') return 'Immediate'
  if (level === 'Medium') return 'Urgent'
  return 'Standard'
}

function summarizeEmergency(body: EmergencyRespondBody, emergencies: string[], level: EmergencySeverityLevel): string {
  const name = body.patientName.trim()

  const set = emergencies.join('|')
  const flagship =
    level === 'Critical' &&
    set.includes('Severe low oxygen') &&
    set.includes('Possible shock') &&
    body.breathingDifficulty &&
    set.includes('High fever')

  if (
    flagship &&
    hypotension(parseBp(body.bloodPressure).sys, parseBp(body.bloodPressure).dia) &&
    set.includes('Breathing difficulty')
  ) {
    return 'Critical emergency detected due to severe low oxygen, unstable blood pressure and breathing difficulty.'
  }

  if (level === 'Low')
    return `${name} triggers limited acute flags on this submission; observe and document any change.`

  if (level === 'Critical')
    return `${name} has a potentially life-threatening pattern (${emergencies.slice(0, 4).join(', ')}); pursue immediate clinician-led response.`

  if (level === 'High')
    return `${name} shows multiple concerning signals (${emergencies.slice(0, 3).join(', ')}); escalate per unit protocol within the hour unless improving.`

  return `${name} warrants focused reassessment (${emergencies.slice(0, 3).join(', ')}).`
}

function bandEmergencyLevel(score: number): EmergencySeverityLevel {
  if (score >= 9) return 'Critical'
  if (score >= 6) return 'High'
  if (score >= 3) return 'Medium'
  return 'Low'
}

/**
 * Rule-based triage composite — calibrated so flagship Ah Chong input yields Critical + flagship summary.
 */
export function generateEmergencyResponse(body: EmergencyRespondBody): EmergencyRespondResponse {
  const { sys, dia } = parseBp(body.bloodPressure)
  const hypo = hypotension(sys, dia)
  const hyper = severeHypertension(sys, dia)
  const unconscious = isUnconsciousness(body.consciousness)
  const shock = shockSuspected(body, sys, dia)
  const eventLowO2 = /low\s*oxygen|\bhypox/i.test(`${body.eventType} ${body.notes}`)

  const detected = new Set<string>()

  if (body.oxygen < 90 || eventLowO2) detected.add('Severe low oxygen')
  if (shock) detected.add('Possible shock')
  else if (hypo) detected.add('Severe hypotension')
  if (hyper) detected.add('Severe hypertension crisis')
  if (body.temperature >= 39.0) detected.add('High fever')
  else if (body.temperature >= 38.5 && body.oxygen < 95) detected.add('High fever')
  if (body.breathingDifficulty) detected.add('Breathing difficulty')
  if (unconscious) detected.add('Unconsciousness or failure to respond')

  const emergencies = sortEmergencyLabels(detected)

  let score = 0
  if (body.oxygen < 85) score += 4
  else if (body.oxygen < 90) score += 3
  else if (body.oxygen < 94) score += 1

  if (hypo && !shock) score += 3
  if (shock) score += 4
  else if (hypo) score += 1
  if (body.pulse >= 120 && hypo) score += 2
  if (body.temperature >= 39.5) score += 2
  else if (body.temperature >= 39.0) score += 2
  else if (body.temperature >= 38.5) score += 1

  if (body.breathingDifficulty) score += 2
  if (unconscious) score += 5
  if (hyper && body.pulse >= 110) score += 2
  else if (hyper) score += 2

  if (hypo && hyper) score -= 2

  let emergencyLevel = bandEmergencyLevel(score)

  /** Hard overrides for unmistakable composites */
  if (unconscious) emergencyLevel = 'Critical'
  else if (body.oxygen < 88 && hypo && (body.breathingDifficulty || shock)) {
    emergencyLevel = 'Critical'
  } else if (body.oxygen < 90 && shock && body.breathingDifficulty) {
    emergencyLevel = 'Critical'
  }

  if (emergencies.length === 0 && emergencyLevel !== 'Critical') emergencyLevel = 'Low'

  const aiSummary = summarizeEmergency(body, emergencies, emergencyLevel)
  const immediateActions = actionsFor(emergencyLevel)
  const responseTimePriority = responseTime(emergencyLevel)

  return {
    patientName: body.patientName.trim(),
    emergencyLevel,
    detectedEmergencies: emergencies.length > 0 ? emergencies : ['No acute composite trigger on supplied snapshot'],
    immediateActions:
      emergencies.length > 0
        ? immediateActions
        : [
            ...immediateActions,
            'Correlate with full assessment if symptoms change',
          ],
    aiSummary:
      emergencies.length > 0
        ? aiSummary
        : `${body.patientName.trim()} submission did not satisfy emergency composite rules; escalate clinically if suspicion remains.`,
    responseTimePriority,
  }
}
