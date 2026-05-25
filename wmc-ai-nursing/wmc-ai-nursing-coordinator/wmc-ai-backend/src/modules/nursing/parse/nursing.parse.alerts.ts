import type { NursingParseAlert, ParsedNursingFields } from './nursing.parse.types.js'

function hasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text))
}

export function detectNursingParseAlerts(text: string, parsed: ParsedNursingFields): NursingParseAlert[] {
  const blob = [
    text,
    parsed.appetite ?? '',
    parsed.mobility ?? '',
    parsed.turningPosition ?? '',
    ...(parsed.symptoms ?? []),
  ]
    .join(' ')
    .toLowerCase()

  const alerts: NursingParseAlert[] = []

  if (
    hasPattern(blob, [
      /\bfever\b/,
      /\b38\.?\d/,
      /\b39\.?\d/,
      /\bhigh\s+temp/,
      /\btemperature\s+(high|elevated|38|39)/,
    ])
    || (parsed.vitals.temperature != null && parsed.vitals.temperature >= 38)
  ) {
    alerts.push({
      type: 'fever',
      severity: parsed.vitals.temperature != null && parsed.vitals.temperature >= 39 ? 'high' : 'medium',
      message: 'Fever detected — monitor temperature and notify charge nurse.',
    })
  }

  if (
    hasPattern(blob, [
      /\bfall\b/,
      /\bfell\b/,
      /\bweak\s+mobility\b/,
      /\bunsteady\b/,
      /\bassist(?:ed|ance)\s+transfer\b/,
      /\bnear\s+fall\b/,
    ])
    || /weak|poor|limited|assist/i.test(parsed.mobility ?? '')
  ) {
    alerts.push({
      type: 'fall_risk',
      severity: 'high',
      message: 'Fall risk flagged — apply fall precautions and reassess mobility.',
    })
  }

  if (
    hasPattern(blob, [
      /\bbreath(?:ing|less)\s+difficult/,
      /\bshortness\s+of\s+breath\b/,
      /\bdyspnea\b/,
      /\bsob\b/,
      /\blow\s+oxygen\b/,
      /\bspo2\s*\d{1,2}\b/,
      /\bwheez/i,
      /\brespiratory\s+distress\b/,
    ])
    || (parsed.vitals.oxygen != null && parsed.vitals.oxygen < 92)
  ) {
    alerts.push({
      type: 'breathing_difficulty',
      severity: parsed.vitals.oxygen != null && parsed.vitals.oxygen < 88 ? 'critical' : 'high',
      message: 'Breathing difficulty detected — check oxygen saturation and escalate if needed.',
    })
  }

  if (
    hasPattern(blob, [
      /\bpoor\s+appetite\b/,
      /\brefused\s+(food|meal|lunch|dinner|breakfast|tray)\b/,
      /\bnot\s+eating\b/,
      /\blow\s+intake\b/,
      /\bnpo\b/,
    ])
    || /poor|refused|low|none|minimal/i.test(parsed.appetite ?? '')
  ) {
    alerts.push({
      type: 'poor_appetite',
      severity: 'medium',
      message: 'Poor appetite noted — monitor intake and hydration.',
    })
  }

  return alerts
}

export function buildConfirmationMessage(parsed: ParsedNursingFields, alerts: NursingParseAlert[]): string {
  let risk = 'Low'
  if (alerts.some((a) => a.severity === 'critical' || a.severity === 'high')) risk = 'High'
  else if (alerts.some((a) => a.severity === 'medium') || /poor|refused/i.test(parsed.appetite ?? '')) risk = 'Medium'

  const lines = [
    '✅ Nursing Record Saved',
    '',
    `Room: ${parsed.room ?? '—'}`,
    `Patient: ${parsed.patientName ?? '—'}`,
  ]

  if (parsed.appetite) lines.push(`Appetite: ${parsed.appetite}`)
  if (parsed.mobility) lines.push(`Mobility: ${parsed.mobility}`)
  if (parsed.turningPosition) lines.push(`Turning: ${parsed.turningPosition}`)

  lines.push(`Risk: ${risk}`)

  const vitals = parsed.vitals
  if (vitals.bloodPressure || vitals.pulse || vitals.temperature || vitals.oxygen) {
    lines.push(
      `Vitals: BP ${vitals.bloodPressure ?? '—'}, Pulse ${vitals.pulse ?? '—'}, Temp ${vitals.temperature ?? '—'}, O2 ${vitals.oxygen ?? '—'}`,
    )
  }

  if (parsed.symptoms.length > 0) {
    lines.push(`Symptoms: ${parsed.symptoms.join(', ')}`)
  }

  if (alerts.length > 0) {
    lines.push('', '⚠️ Alerts:')
    for (const alert of alerts) {
      lines.push(`• ${alert.message}`)
    }
  }

  return lines.join('\n')
}
