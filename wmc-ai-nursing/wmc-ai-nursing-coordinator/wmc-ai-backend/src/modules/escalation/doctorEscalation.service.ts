import type { DoctorEscalationBody } from './doctorEscalation.validation.js'
import type { DoctorEscalationResponse, EscalationPriorityLevel } from './doctorEscalation.types.js'

function parseBp(s: string): { sys?: number; dia?: number } {
  const m = s.trim().match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) return {}
  return { sys: Number(m[1]), dia: Number(m[2]) }
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/** Stable ordering for responses */
const REASON_ORDER = [
  'Very high blood pressure',
  'Severely elevated blood pressure',
  'Very fast pulse',
  'Low oxygen',
  'High fever',
  'Fever',
  'High pain score',
  'Confusion/agitation',
  'Possible wound infection',
] as const

function collectReasons(body: DoctorEscalationBody): string[] {
  const reasons = new Set<string>()
  const { sys, dia } = parseBp(body.bloodPressure)

  if (sys !== undefined && dia !== undefined) {
    if (sys >= 180 || dia >= 110) reasons.add('Very high blood pressure')
    else if (sys >= 160 || dia >= 100) reasons.add('Severely elevated blood pressure')
  }

  if (body.pulse >= 130) reasons.add('Very fast pulse')

  if (body.oxygen < 95) reasons.add('Low oxygen')

  if (body.temperature >= 39.0) reasons.add('High fever')
  else if (body.temperature >= 38.0) reasons.add('Fever')

  if (body.painScore >= 9) reasons.add('High pain score')

  const mood = norm(body.mood)
  const notes = norm(body.notes)
  const cognitionCue =
    /\b(agitated|anxious|combative|confused|disoriented|hallucinat)\b/.test(mood) ||
    /\b(confused|disoriented|altered mental|not oriented|acute confusion)\b/.test(notes)

  if (cognitionCue) reasons.add('Confusion/agitation')

  const w = norm(body.woundCondition)
  const woundInfectionCue =
    /\b(discharge|pus|odor|purulent|infected|cellulitis)\b/.test(w) ||
    (/\bredness\b|\berythema\b/.test(w) && /\b(discharge|pus)\b/.test(w))

  if (woundInfectionCue) reasons.add('Possible wound infection')

  return REASON_ORDER.filter((label) => reasons.has(label))
}

function urgencyScore(reasons: string[], body: DoctorEscalationBody): number {
  let score = 0
  const labels = new Set(reasons)

  if (labels.has('Very high blood pressure')) score += 4
  if (labels.has('Severely elevated blood pressure')) score += 2
  if (labels.has('Very fast pulse')) score += 2
  if (labels.has('Low oxygen')) score += body.oxygen < 90 ? 4 : 2
  if (labels.has('High fever')) score += 3
  else if (labels.has('Fever')) score += 1
  if (labels.has('High pain score')) score += 2
  if (labels.has('Confusion/agitation')) score += 3
  if (labels.has('Possible wound infection')) score += 2

  if (body.pulse >= 120) score += 1

  score += Math.min(4, reasons.length)
  return score
}

function assignPriority(reasons: string[], body: DoctorEscalationBody): EscalationPriorityLevel {
  if (reasons.length === 0) return 'Low'

  const score = urgencyScore(reasons, body)
  const labels = new Set(reasons)

  const urgentCombo =
    labels.has('Possible wound infection') &&
    (labels.has('Low oxygen') || labels.has('High fever') || labels.has('Very high blood pressure'))

  if (
    score >= 14 ||
    reasons.length >= 5 ||
    urgentCombo ||
    (labels.has('Low oxygen') &&
      body.oxygen < 90 &&
      (labels.has('High fever') || labels.has('Very high blood pressure')))
  ) {
    return 'Urgent'
  }

  if (score >= 10 || reasons.length >= 4 || labels.has('Very high blood pressure') || labels.has('High fever'))
    return 'High'

  if (score >= 6 || reasons.length >= 2) return 'Medium'

  return 'Low'
}

function recommendedActions(priority: EscalationPriorityLevel, labels: Set<string>): string[] {
  const actions: string[] = []

  if (priority === 'Urgent') {
    actions.push(
      'Notify doctor immediately',
      'Monitor oxygen closely',
      'Repeat vital signs within 15 minutes',
      'Prepare possible hospital transfer',
    )
    return [...new Set(actions)]
  }

  if (priority === 'High') {
    actions.push(
      'Notify doctor as soon as possible',
      'Repeat vital signs within 30 minutes',
      'Monitor airway and circulation closely',
    )
    if (labels.has('Low oxygen')) actions.push('Titrate oxygen per protocol and reassess frequently')
    if (labels.has('Possible wound infection')) actions.push('Photograph wound if appropriate and expedite review')
    return [...new Set(actions)]
  }

  if (priority === 'Medium') {
    actions.push('Notify covering physician or senior nurse', 'Repeat vital signs within 1 hour')
    if (labels.has('Possible wound infection')) actions.push('Review wound care plan and dressing integrity')
    actions.push('Continue close observation and document trends')
    return [...new Set(actions)]
  }

  actions.push('Continue routine monitoring', 'Document findings on the observation chart')
  return actions
}

/** Rule-based escalation triage — no persistence */
export function evaluateDoctorEscalation(body: DoctorEscalationBody): DoctorEscalationResponse {
  const reasons = collectReasons(body)
  const priority = assignPriority(reasons, body)

  return {
    patientName: body.patientName.trim(),
    escalationRequired: reasons.length > 0,
    priority,
    reasons,
    recommendedActions: recommendedActions(priority, new Set(reasons)),
  }
}
