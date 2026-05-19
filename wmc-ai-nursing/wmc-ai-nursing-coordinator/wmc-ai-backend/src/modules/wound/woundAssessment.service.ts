import type { WoundAssessmentBody } from './woundAssessment.validation.js'
import type { WoundAssessmentRecord, WoundInfectionRiskLevel } from './woundAssessment.types.js'

/** Stable alert ordering */
const ALERT_ORDER = [
  'Wound redness noted',
  'Swelling noted',
  'Discharge observed',
  'Odor noted',
  'High pain score reported',
  'Photo not uploaded',
] as const

function clinicalScore(body: WoundAssessmentBody): number {
  let s = 0
  if (body.redness) s += 2
  if (body.swelling) s += 2
  if (body.discharge) s += 2
  if (body.odor) s += 3
  if (body.painScore >= 7) s += 2
  return s
}

/** Rule-based infection concern tier — no persistence */
export function computeWoundInfectionRisk(body: WoundAssessmentBody): WoundInfectionRiskLevel {
  const score = clinicalScore(body)
  const inflammatorySigns = [body.redness, body.swelling, body.discharge].filter(Boolean).length

  if (body.odor || body.painScore >= 8 || score >= 6) return 'High'
  if (score >= 4 || body.painScore >= 7 || inflammatorySigns >= 2) return 'Medium'
  return 'Low'
}

function collectAlerts(body: WoundAssessmentBody): string[] {
  const set = new Set<string>()
  if (body.redness) set.add('Wound redness noted')
  if (body.swelling) set.add('Swelling noted')
  if (body.discharge) set.add('Discharge observed')
  if (body.odor) set.add('Odor noted')
  if (body.painScore >= 7) set.add('High pain score reported')
  if (!body.photoUploaded) set.add('Photo not uploaded')
  return ALERT_ORDER.filter((label) => set.has(label))
}

function buildRecommendations(
  risk: WoundInfectionRiskLevel,
  body: WoundAssessmentBody,
): string[] {
  const out: string[] = []

  if (risk === 'High') {
    out.push(
      'Inform nurse in charge immediately',
      'Arrange timely medical review of the wound',
      'Monitor wound and systemic signs every shift',
    )
    if (!body.photoUploaded) out.push('Upload wound photo as soon as possible for continuity of care')
    if (body.discharge || body.odor) out.push('Escalate to doctor if discharge increases or odor persists')
    return [...new Set(out)]
  }

  if (risk === 'Medium') {
    out.push('Monitor wound every shift', 'Ensure dressing change is documented')
    if (!body.photoUploaded) out.push('Upload wound photo for tracking')
    if (body.discharge) out.push('Escalate to doctor if discharge worsens')
    else out.push('Escalate to doctor if wound deteriorates')
    return [...new Set(out)]
  }

  out.push('Continue routine wound observation', 'Document findings each shift')
  if (!body.photoUploaded) out.push('Upload wound photo when available for tracking')
  if (body.redness || body.swelling) out.push('Recheck wound if erythema or swelling progresses')
  return [...new Set(out)]
}

export function buildWoundAssessmentRecord(
  body: WoundAssessmentBody,
  id: string,
  createdAt: string,
  recordedByUserId?: string,
): WoundAssessmentRecord {
  const infectionRisk = computeWoundInfectionRisk(body)
  const alerts = collectAlerts(body)
  const recommendations = buildRecommendations(infectionRisk, body)

  const row: WoundAssessmentRecord = {
    id,
    createdAt,
    patientId: body.patientId.trim(),
    patientName: body.patientName.trim(),
    nurseName: body.nurseName.trim(),
    woundLocation: body.woundLocation.trim(),
    redness: body.redness,
    swelling: body.swelling,
    discharge: body.discharge,
    odor: body.odor,
    painScore: body.painScore,
    woundSize: body.woundSize.trim(),
    dressingChanged: body.dressingChanged,
    photoUploaded: body.photoUploaded,
    notes: body.notes?.trim() ?? '',
    infectionRisk,
    alerts,
    recommendations,
  }
  if (recordedByUserId) row.recordedByUserId = recordedByUserId
  return row
}
