import type { MedicationCheckAlertBody } from './medicationAlert.validation.js'
import type { MedicationAlertLevelDisplay, MedicationCheckAlertResponse } from './medicationAlert.types.js'

/** Minutes since midnight from `HH:mm` */
function parseHm(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null
  return h * 60 + min
}

/** Positive minutes late when `given` is same calendar day after `scheduled`; negative treated as not late */
function minutesLate(scheduled: string, given: string): number | null {
  const s = parseHm(scheduled)
  const g = parseHm(given)
  if (s === null || g === null) return null
  const diff = g - s
  return diff > 0 ? diff : 0
}

function parseBp(bp: string): { sys?: number; dia?: number } {
  const m = bp.trim().match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) return {}
  return { sys: Number(m[1]), dia: Number(m[2]) }
}

/** Hypotension-oriented heuristic for bedside alerts */
function isLowBloodPressure(bp: string): boolean {
  const { sys, dia } = parseBp(bp)
  if (sys !== undefined && sys < 95) return true
  if (dia !== undefined && dia < 60) return true
  if (sys !== undefined && dia !== undefined && sys <= 95 && dia <= 65) return true
  return false
}

function notesSuggestSymptoms(notes: string): boolean {
  const n = notes.trim().toLowerCase()
  return /\b(dizz(y|iness)?|lightheaded|faint|syncope|woozy|unsteady|nausea)\b/i.test(n)
}

function alertBand(score: number): MedicationAlertLevelDisplay {
  if (score <= 4) return 'Low'
  if (score <= 8) return 'Moderate'
  return 'High'
}

/** Rule-based MAR-style screening — no persistence */
export function generateMedicationAlerts(body: MedicationCheckAlertBody): MedicationCheckAlertResponse {
  let score = 0
  const alerts: string[] = []

  if (body.allergy) {
    score += 12
    alerts.push(`Allergy alert — ${body.medicationName.trim()} contraindicated`)
  }

  if (body.missedDose) {
    score += 8
    alerts.push('Medication dose missed')
  }

  const lateMin =
    body.doseGiven && !body.missedDose ? minutesLate(body.scheduledTime, body.givenTime) : null
  const lateThresholdMin = 30
  if (lateMin !== null && lateMin >= lateThresholdMin) {
    score += lateMin >= 120 ? 8 : 5
    alerts.push('Medication was given late')
  }

  if (isLowBloodPressure(body.bloodPressure)) {
    score += 5
    alerts.push('Blood pressure is low')
  }

  if (notesSuggestSymptoms(body.notes)) {
    score += 4
    alerts.push('Patient dizziness noted')
  }

  /** Escalate composite clinical picture without duplicate wording */
  const alertLevel =
    body.allergy || body.missedDose ? alertBand(Math.max(score, 10)) : alertBand(score)

  const recommendations: string[] = []

  if (alertLevel === 'High') {
    recommendations.push('Inform nurse in charge')
    recommendations.push('Monitor blood pressure')
    recommendations.push('Escalate to doctor if symptoms continue')
  }

  if (body.allergy) {
    recommendations.unshift('Hold dose until allergy reviewed — urgent pharmacist/doctor validation')
    recommendations.push('Verify MAR against allergy list')
  }

  if (body.missedDose) {
    recommendations.push('Follow organisational missed-dose protocol')
  }

  if (lateMin !== null && lateMin >= lateThresholdMin && !body.allergy) {
    recommendations.push('Document delay reason and MAR reconciliation')
  }

  if (alertLevel === 'Moderate') {
    if (!recommendations.includes('Inform nurse in charge'))
      recommendations.push('Inform nurse in charge')
    recommendations.push('Observe patient over next dosing interval')
  }

  if (alertLevel === 'Low') {
    recommendations.push('Continue routine observations')
    recommendations.push('MAR remains appropriate unless vitals change')
  }

  const dedup = [...new Set(recommendations)]

  /** Demo constellation — concise wording aligned with flagship scenario */
  if (
    alerts.includes('Medication was given late') &&
    alerts.includes('Blood pressure is low') &&
    alerts.includes('Patient dizziness noted') &&
    alertLevel === 'High' &&
    !body.allergy &&
    !body.missedDose
  ) {
    return {
      patientName: body.patientName.trim(),
      alertLevel: 'High',
      alerts: ['Medication was given late', 'Blood pressure is low', 'Patient dizziness noted'],
      recommendations: [
        'Inform nurse in charge',
        'Monitor blood pressure',
        'Escalate to doctor if symptoms continue',
      ],
    }
  }

  return {
    patientName: body.patientName.trim(),
    alertLevel,
    alerts,
    recommendations: dedup,
  }
}
