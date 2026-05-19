import { incidentReportsMemoryStore } from '../incidents/incident.store.js'
import { nursingAnnouncementMemoryStore } from '../announcements/nursingAnnouncement.store.js'
import { nursingClinicalRecordsMemoryStore } from '../nursing/nursing.records.store.js'
import { sideTurningMemoryStore } from '../turning/turning.store.js'
import { woundAssessmentMemoryStore } from '../wound/woundAssessment.store.js'
import type { NursingClinicalRecord } from '../nursing/nursing.records.types.js'
import { analyzeVitals } from '../vitals/vitalsAnalyze.service.js'
import { evaluateDoctorEscalation } from '../escalation/doctorEscalation.service.js'
import { generateBedExitAlert } from '../risk/bedExitAlert.service.js'
import { generateFallRiskAssessment } from '../risk/fallScore.service.js'
import { generateWanderingRiskAssessment } from '../risk/wanderingRisk.service.js'
import { generatePressureUlcerRiskAssessment } from '../risk/pressureUlcer.service.js'
import type {
  NightShiftMonitorResponse,
  NightShiftMonitorSummaryInner,
  NightShiftSystemStatus,
} from './nightShiftMonitor.types.js'

export const MOCK_NIGHT_SHIFT_MONITOR: NightShiftMonitorResponse = {
  nightShiftSummary: {
    highRiskPatients: ['Ah Chong', 'Mdm Lee'],
    pendingTasks: [
      'Complete side turning for Ah Chong',
      'Recheck oxygen for Mdm Lee',
    ],
    criticalAlerts: ['Low oxygen detected for Ah Chong', 'Bed exit attempt detected'],
    unacknowledgedAlerts: 2,
    doctorEscalations: 1,
  },
  recommendations: [
    'Increase supervision for high-risk patients',
    'Prioritize oxygen monitoring',
    'Complete all pending side turning before 02:00',
  ],
  systemStatus: 'Critical',
}

function isCoordinatorTripleEmpty(): boolean {
  return (
    nursingClinicalRecordsMemoryStore.list().length === 0 &&
    sideTurningMemoryStore.list().length === 0 &&
    woundAssessmentMemoryStore.list().length === 0
  )
}

function hasNoIncidentsOrAnnouncements(): boolean {
  return incidentReportsMemoryStore.list().length === 0 && nursingAnnouncementMemoryStore.list().length === 0
}

function countUnackedUrgentBulletins(): number {
  return nursingAnnouncementMemoryStore.list().filter(
    (a) =>
      a.requiresAcknowledgement &&
      a.acknowledgements.length === 0 &&
      (a.priority === 'Urgent' || a.priority === 'High'),
  ).length
}

function latestByPatientName<T extends { patientName: string; createdAt: string }>(rows: T[]): Map<string, T> {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const m = new Map<string, T>()
  for (const r of sorted) {
    const key = r.patientName.trim()
    if (!m.has(key)) m.set(key, r)
  }
  return m
}

function vitalBody(rec: NursingClinicalRecord) {
  return {
    patientName: rec.patientName.trim(),
    bloodPressure: rec.bloodPressure,
    pulse: rec.pulse,
    temperature: rec.temperature,
    oxygen: rec.oxygen,
    painScore: rec.painScore,
    notes: rec.notes ?? '',
  }
}

function escalationBody(rec: NursingClinicalRecord) {
  return {
    patientName: rec.patientName.trim(),
    bloodPressure: rec.bloodPressure,
    pulse: rec.pulse,
    temperature: rec.temperature,
    oxygen: rec.oxygen,
    painScore: rec.painScore,
    mood: rec.mood,
    mobility: rec.mobility,
    woundCondition: rec.woundCondition,
    notes: rec.notes ?? '',
  }
}

function syntheticFallBody(rec: NursingClinicalRecord) {
  return {
    patientName: rec.patientName.trim(),
    mobility: rec.mobility,
    mood: rec.mood,
    painScore: rec.painScore,
    oxygen: rec.oxygen,
    historyOfFalls: false,
    walkingAssist: /\bassist|rail|cane|walker\b/i.test(rec.mobility),
    confusion: /\bconfus|disorient|agitat\b/i.test(rec.mood),
    age: 72,
  }
}

function syntheticPressureBody(rec: NursingClinicalRecord) {
  return {
    patientName: rec.patientName.trim(),
    bedbound: /\bbe?dbound|bedridden\b/i.test(rec.mobility),
    sideTurningCompleted: /\bcompleted\b|\bdone\b|\byes\b/i.test(rec.sideTurning),
    nutritionStatus: rec.appetite?.trim() ? rec.appetite.trim() : 'Fair',
    skinCondition: rec.woundCondition?.trim() ? rec.woundCondition.trim() : 'Clear',
    moisture: 'Moderate',
    mobility: rec.mobility,
    age: 72,
    incontinence: /\bincontin/i.test(rec.notes ?? ''),
  }
}

function syntheticWanderingBody(rec: NursingClinicalRecord) {
  const text = `${rec.notes} ${rec.mood}`.toLowerCase()
  const diagnosis =
    /\bdementia|alzheimer|cognitive impairment\b/i.test(text) ||
    /\bconfus|disorient/i.test(rec.mood.toLowerCase())
      ? 'Dementia'
      : 'General medical'
  return {
    patientName: rec.patientName.trim(),
    age: 82,
    diagnosis,
    confusion: /\bconfus|disorient|altered\b/i.test(rec.mood),
    agitation: /\bagitat|combative|anxious\b/i.test(rec.mood),
    nightRestlessness: /\bnight|insomnia|sundown\b/i.test(text),
    historyOfWandering: /\bwander|elope|exit|leave ward\b/i.test(text),
    mobility: rec.mobility.trim() || 'Unknown',
    sleepPattern: /\bpoor sleep|restless\b/i.test(text) ? 'Poor' : 'Fair',
    notes: rec.notes ?? '',
  }
}

function mapFallToBedTier(level: string): 'Low' | 'Medium' | 'High' {
  if (level === 'High') return 'High'
  if (level === 'Moderate') return 'Medium'
  return 'Low'
}

function syntheticBedExitBody(
  rec: NursingClinicalRecord,
  wanderingLevel: 'Low' | 'Medium' | 'High',
  fallLevel: string,
) {
  const notes = rec.notes ?? ''
  const bedCue =
    /\b(bed exit|got out of bed|unassisted transfer|fell|fall risk transfer)\b/i.test(notes) ||
    /\b(bed|ambulat|transfer)\b/i.test(notes)

  return {
    patientName: rec.patientName.trim(),
    age: 82,
    mobility: rec.mobility.trim() || 'Unknown',
    confusion: /\bconfus|disorient\b/i.test(rec.mood),
    fallRiskLevel: mapFallToBedTier(fallLevel),
    wanderingRiskLevel: wanderingLevel,
    bedExitAttempt: bedCue,
    timeOfAttempt: '',
    nightShift: true,
    notes,
  }
}

/** Prefer human-readable uniqueness */
function uniqStrings(rows: string[]): string[] {
  return [...new Set(rows.map((s) => s.trim()).filter(Boolean))]
}

function buildRecommendations(s: NightShiftMonitorSummaryInner): string[] {
  const out: string[] = []
  if (s.highRiskPatients.length > 0) {
    out.push('Increase supervision for high-risk patients')
  }
  if (s.criticalAlerts.some((a) => /oxygen/i.test(a))) {
    out.push('Prioritize oxygen monitoring')
  }
  if (s.pendingTasks.some((t) => /side turning/i.test(t))) {
    out.push('Complete all pending side turning before 02:00')
  }
  if (s.doctorEscalations > 0) {
    out.push('Review open doctor escalation cases with night supervisor')
  }
  if (s.unacknowledgedAlerts > 0) {
    out.push('Follow up outstanding urgent bulletin acknowledgement(s)')
  }
  if (s.criticalAlerts.some((a) => /wandering|elopement/i.test(a))) {
    out.push('Increase elopement safeguards and exits checks overnight')
  }
  if (s.criticalAlerts.some((a) => /fall|bed exit/i.test(a))) {
    out.push('Re-audit mobility and falls precautions near handover windows')
  }
  if (out.length === 0) {
    out.push('Maintain routine hourly rounding patterns throughout night shift')
  }
  return [...new Set(out)]
}

export function deriveNightShiftSystemStatus(s: NightShiftMonitorSummaryInner): NightShiftSystemStatus {
  const emptySignals =
    s.criticalAlerts.length === 0 &&
    s.doctorEscalations === 0 &&
    s.unacknowledgedAlerts === 0 &&
    s.highRiskPatients.length === 0 &&
    s.pendingTasks.length === 0

  if (emptySignals) return 'Stable'

  if (
    s.criticalAlerts.length >= 2 ||
    (s.doctorEscalations >= 1 && s.criticalAlerts.length >= 1) ||
    s.doctorEscalations >= 2 ||
    s.unacknowledgedAlerts >= 2
  ) {
    return 'Critical'
  }

  return 'Attention Required'
}

export function buildNightShiftMonitor(): NightShiftMonitorResponse {
  if (isCoordinatorTripleEmpty() && hasNoIncidentsOrAnnouncements()) {
    return structuredClone(MOCK_NIGHT_SHIFT_MONITOR)
  }

  const highRisk = new Set<string>()
  const pendingTasks: string[] = []
  const criticalAlerts: string[] = []
  let doctorEscalations = 0

  const latestNursing = latestByPatientName(nursingClinicalRecordsMemoryStore.list())

  for (const [patientName, rec] of latestNursing) {
    const vit = analyzeVitals(vitalBody(rec))
    if (vit.alertLevel !== 'Low') {
      if (vit.abnormalSigns.includes('Low oxygen')) {
        highRisk.add(patientName)
        criticalAlerts.push(`Low oxygen detected for ${patientName}`)
        pendingTasks.push(`Recheck oxygen for ${patientName}`)
      }
      if (vit.abnormalSigns.includes('Fever')) {
        highRisk.add(patientName)
        if (rec.temperature >= 39.0)
          criticalAlerts.push(`High fever detected for ${patientName}`)
        else criticalAlerts.push(`Fever surveillance required for ${patientName}`)
      }
    }

    const esc = evaluateDoctorEscalation(escalationBody(rec))
    if (esc.escalationRequired && (esc.priority === 'Urgent' || esc.priority === 'High')) {
      doctorEscalations += 1
      highRisk.add(patientName)
      criticalAlerts.push(
        `Doctor escalation (${esc.priority.toLowerCase()}) for ${patientName}: ${esc.reasons.slice(0, 3).join(', ') || 'Review vitals'}`,
      )
    }

    const pu = generatePressureUlcerRiskAssessment(syntheticPressureBody(rec))
    const pendingSide = /\bpending\b|\bdue\b|\bnot\s+completed\b/i.test(rec.sideTurning)

    if (pu.riskLevel === 'High' || pendingSide) {
      highRisk.add(patientName)
      pendingTasks.push(`Complete side turning for ${patientName}`)
    }

    const fall = generateFallRiskAssessment(syntheticFallBody(rec))
    if (fall.riskLevel === 'High') {
      highRisk.add(patientName)
      criticalAlerts.push(`High fall risk for ${patientName}`)
    } else if (fall.riskLevel === 'Moderate') {
      highRisk.add(patientName)
      pendingTasks.push(`Reinforce fall precautions for ${patientName}`)
    }

    const wander = generateWanderingRiskAssessment(syntheticWanderingBody(rec))
    if (wander.riskLevel === 'High') {
      highRisk.add(patientName)
      criticalAlerts.push(`Elevated wandering / elopement risk for ${patientName}`)
    } else if (wander.riskLevel === 'Medium') {
      highRisk.add(patientName)
      pendingTasks.push(`Increase rounding for wandering cues — ${patientName}`)
    }

    const bed = generateBedExitAlert(syntheticBedExitBody(rec, wander.riskLevel, fall.riskLevel))
    if (bed.bedExitAlertLevel === 'Urgent' || bed.bedExitAlertLevel === 'High') {
      highRisk.add(patientName)
      if (/night bed-exit|attempt/i.test(bed.alertReasons.join(' '))) {
        criticalAlerts.push(`Bed exit attempt detected for ${patientName}`)
      } else {
        criticalAlerts.push(`High bed-exit alert for ${patientName}`)
      }
    } else if (bed.bedExitAlertLevel === 'Medium') {
      highRisk.add(patientName)
      pendingTasks.push(`Review bed safeguards for ${patientName}`)
    }
  }

  for (const t of sideTurningMemoryStore.list()) {
    if (t.photoRequired && !t.photoUploaded) {
      const name = t.patientName.trim()
      highRisk.add(name)
      pendingTasks.push(`Upload side-turning photograph for ${name}`)
    }
  }

  const unacknowledgedAlerts = countUnackedUrgentBulletins()

  const summary: NightShiftMonitorSummaryInner = {
    highRiskPatients: uniqStrings([...highRisk]).sort((a, b) => a.localeCompare(b)),
    pendingTasks: uniqStrings(pendingTasks),
    criticalAlerts: uniqStrings(criticalAlerts),
    unacknowledgedAlerts,
    doctorEscalations,
  }

  const recommendations = buildRecommendations(summary)
  const systemStatus = deriveNightShiftSystemStatus(summary)

  return {
    nightShiftSummary: summary,
    recommendations,
    systemStatus,
  }
}
