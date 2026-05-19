import type { IncidentReportBody } from './incident.validation.js'
import type { IncidentReportRecord, IncidentSeverityLevel } from './incident.types.js'

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function capitalizeSentence(s: string): string {
  const t = s.trim()
  if (!t) return t
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Severity from signal blend — heuristic, no persistence */
export function computeIncidentSeverity(body: IncidentReportBody): IncidentSeverityLevel {
  const type = norm(body.incidentType)
  const vt = norm(body.vitalStatus)
  const injuries = norm(body.injuryDetails)

  if (/\b(critical|catastrophic|code blue|respiratory arrest|cardiac arrest|collapsed unresponsive)\b/.test(vt))
    return 'Critical'

  if (/\babuse\b|\bassault\b|\bweapon\b|\bsexual misconduct\b/i.test(body.incidentType)) return 'Critical'

  const severeInjury =
    body.injuryDetected &&
    /\b(fracture|skull|unconscious|unresponsive|severe bleed|head injury|neck injury|spinal|hemorrhag|oxygen desat)\b/i.test(
      injuries,
    )

  if (severeInjury) return body.doctorInformed ? 'High' : 'Critical'

  let score = 0
  if (type.includes('medication')) score += 4
  else if (type.includes('fall')) score += 2
  else if (type.includes('wander')) score += 2
  else if (type.includes('slip')) score += 2
  else if (type.includes('equipment')) score += 3
  else score += 2

  if (body.injuryDetected) score += 2
  else score -= 1

  if (/\bruise|sprain|laceration|cut|pain|minor\b/i.test(injuries) && body.injuryDetected) score += 1

  if (/\bunstable\b|\battention\b|\bconcerning\b|\bdeteriorat\b|\bsevere\b/.test(vt)) score += 3
  else if (!/\bstable\b|\bnormal\b|\bgood\b/.test(vt)) score += 1

  if (!body.doctorInformed && (type.includes('medication') || body.injuryDetected)) score += 2
  if (!body.familyInformed && body.injuryDetected) score += 1

  if (norm(body.notes).length > 20 && /\b(syncope|near miss|struck)\b/i.test(body.notes)) score += 1

  score = Math.max(0, Math.min(score, 12))

  if (score >= 9) return 'Critical'
  if (score >= 7) return 'High'
  if (score >= 4) return 'Medium'
  return 'Low'
}

/** Natural-language incident paragraph — rule templates (offline “AI”) */
export function composeIncidentAiSummary(body: IncidentReportBody): string {
  const pieces: string[] = []
  const loc = body.location.trim()
  const t = norm(body.incidentType)

  if (t === 'fall' || /\bfall\b/i.test(body.incidentType))
    pieces.push(`Patient experienced a fall incident in ${loc}.`)
  else if (t.includes('medication'))
    pieces.push(`A medication-related incident was reported at ${loc}.`)
  else
    pieces.push(
      `${capitalizeSentence(body.incidentType.trim())} incident documented at ${loc}.`,
    )

  if (body.injuryDetected && body.injuryDetails.trim()) {
    let clause = body.injuryDetails.trim().replace(/\.*$/, '')
    if (!/\bdetected\b/i.test(clause)) {
      const m = clause.split(/\s+on\s+/i)
      clause = m.length === 2 ? `${m[0]} detected on ${m[1]}` : `${clause} detected`
    }
    pieces.push(`${capitalizeSentence(clause)}.`)
  } else if (body.injuryDetected)
    pieces.push('An injury was noted; further bedside assessment documented separately.')

  pieces.push(body.doctorInformed ? 'Doctor has been informed.' : 'Doctor notification still pending.')

  pieces.push(body.familyInformed ? 'Family has been notified.' : 'Family notification still pending.')

  return pieces.join(' ')
}

/** Next-step checklist — aligns with escalation & ward policy reminders */
export function buildIncidentRecommendations(
  body: IncidentReportBody,
  severity: IncidentSeverityLevel,
): string[] {
  const out: string[] = []
  const type = norm(body.incidentType)

  if (severity === 'Critical') {
    out.push(
      'Escalate to nurse in charge and on-call clinician immediately',
      'Preserve scene details and objective observations for governance review',
    )
    if (!body.familyInformed) out.push('Expedite family outreach with scripted support')
    if (!body.doctorInformed) out.push('Ensure physician handoff occurs without delay')
  } else if (severity === 'High') {
    out.push('Senior nurse notification within one hour', 'Complete detailed subjective timeline')
    if (type.includes('fall')) out.push('Obtain focussed neurovascular observations')
    if (!body.familyInformed) out.push('Inform family members')
  } else if (severity === 'Medium') {
    if (type.includes('fall')) {
      out.push('Monitor patient for 24 hours')
      out.push('Complete fall risk reassessment')
      if (!body.familyInformed) out.push('Inform family members')
      out.push('Increase supervision during transfer')
    } else {
      out.push('Monitor patient closely for symptom changes')
      out.push('Reassess care plan relevance after investigation')
      out.push('Document witness statements objectively')
    }
    if (!body.familyInformed && !type.includes('fall')) out.push('Inform family members')
  } else {
    out.push(
      'Document incident in organisational risk register fields',
      'Reinforce education with patient and bedside team',
    )
    if (!body.familyInformed && /\bmedicat|fall\b/.test(type)) out.push('Update family via agreed channel')
  }

  return dedupePreserve(out)
}

function dedupePreserve(strings: string[]): string[] {
  const seen = new Set<string>()
  const outList: string[] = []
  for (const x of strings) {
    if (seen.has(x)) continue
    seen.add(x)
    outList.push(x)
  }
  return outList
}

export function buildIncidentReportRecord(
  body: IncidentReportBody,
  id: string,
  createdAt: string,
  recordedByUserId?: string,
): IncidentReportRecord {
  const incidentSeverity = computeIncidentSeverity(body)
  const aiSummary = composeIncidentAiSummary(body)
  const recommendedActions = buildIncidentRecommendations(body, incidentSeverity)

  const row: IncidentReportRecord = {
    id,
    createdAt,
    patientName: body.patientName.trim(),
    incidentType: body.incidentType.trim(),
    incidentTime: body.incidentTime.trim(),
    location: body.location.trim(),
    reportedBy: body.reportedBy.trim(),
    injuryDetected: body.injuryDetected,
    injuryDetails: body.injuryDetails?.trim() ?? '',
    vitalStatus: body.vitalStatus.trim(),
    doctorInformed: body.doctorInformed,
    familyInformed: body.familyInformed,
    notes: body.notes?.trim() ?? '',
    incidentSeverity,
    aiSummary,
    recommendedActions,
  }
  if (recordedByUserId) row.recordedByUserId = recordedByUserId
  return row
}
