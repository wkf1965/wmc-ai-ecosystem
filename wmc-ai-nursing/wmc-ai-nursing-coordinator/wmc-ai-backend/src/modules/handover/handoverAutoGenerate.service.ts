import { nursingAnnouncementMemoryStore } from '../announcements/nursingAnnouncement.store.js'
import { buildDashboardSummary } from '../dashboard/dashboard.service.js'
import { evaluateDoctorEscalation } from '../escalation/doctorEscalation.service.js'
import { generateEmergencyResponse } from '../emergency/emergencyRespond.service.js'
import type { EmergencyRespondBody } from '../emergency/emergencyRespond.validation.js'
import { incidentReportsMemoryStore } from '../incidents/incident.store.js'
import type { NursingClinicalRecord } from '../nursing/nursing.records.types.js'
import { nursingClinicalRecordsMemoryStore } from '../nursing/nursing.records.store.js'
import { buildNightShiftMonitor } from '../nightShift/nightShiftMonitor.service.js'
import { generateBedExitAlert } from '../risk/bedExitAlert.service.js'
import { generateFallRiskAssessment } from '../risk/fallScore.service.js'
import { generatePressureUlcerRiskAssessment } from '../risk/pressureUlcer.service.js'
import { generateWanderingRiskAssessment } from '../risk/wanderingRisk.service.js'
import { sideTurningMemoryStore } from '../turning/turning.store.js'
import { buildSupervisorEscalationQueue } from '../supervisor/supervisorEscalationQueue.service.js'
import type { NurseQueuedTask } from '../tasks/tasks.types.js'
import { buildTasksQueue } from '../tasks/tasksQueue.service.js'
import { analyzeVitals } from '../vitals/vitalsAnalyze.service.js'
import { woundAssessmentMemoryStore } from '../wound/woundAssessment.store.js'
import type {
  HandoverAutoGenerateResponse,
  HandoverAutoHighRiskPatient,
  HandoverOverallShiftStatus,
} from './handoverAuto.types.js'

/** Cold coordinators + incidents + announcements — demo copy aligned with onboarding */
export const MOCK_HANDOVER_AUTO_GENERATE: HandoverAutoGenerateResponse = {
  shift: 'Night Shift',
  generatedAt: '2026-05-19 23:00',
  overallShiftStatus: 'Attention Required',
  handoverSummary:
    'Several high-risk patients require close monitoring tonight. Ah Chong experienced low oxygen and fever with doctor escalation initiated. Two patients still require side turning. One bed-exit alert detected during night shift.',
  highRiskPatients: [
    {
      patientName: 'Ah Chong',
      issues: ['Low oxygen', 'High fever', 'High fall risk'],
    },
  ],
  pendingTasks: [
    'Complete side turning for Ah Chong',
    'Upload wound photo for Test Patient',
    'Recheck oxygen at 02:00',
  ],
  criticalAlerts: ['Doctor escalation active', 'Bed exit alert detected'],
  recommendations: [
    'Increase night supervision',
    'Prioritize oxygen monitoring',
    'Ensure all pending turning completed',
  ],
  preparedByAI: true,
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

export function formatHandoverLocalTimestamp(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

export function inferShiftLabel(now: Date): string {
  const h = now.getHours()
  if (h >= 6 && h < 14) return 'Morning Shift'
  if (h >= 14 && h < 22) return 'Evening Shift'
  return 'Night Shift'
}

function isAutoHandoverCold(): boolean {
  return (
    nursingClinicalRecordsMemoryStore.list().length === 0 &&
    sideTurningMemoryStore.list().length === 0 &&
    woundAssessmentMemoryStore.list().length === 0 &&
    incidentReportsMemoryStore.list().length === 0 &&
    nursingAnnouncementMemoryStore.list().length === 0
  )
}

function medNotesCue(text: string): boolean {
  const n = text.trim().toLowerCase()
  return /\b(medication|medicine|tablet|pill|mar)\b/i.test(n)
}

function nursingRecordToEmergencyBody(rec: NursingClinicalRecord): EmergencyRespondBody {
  const notes = rec.notes ?? ''
  return {
    patientName: rec.patientName.trim(),
    eventType: 'Monitor',
    bloodPressure: rec.bloodPressure,
    pulse: rec.pulse,
    temperature: rec.temperature,
    oxygen: rec.oxygen,
    consciousness: (rec.mood ?? '').trim() || 'Alert',
    breathingDifficulty: /\bshort(?:ness)?\s+of\s+breath|dyspn|sob|breathless\b/i.test(notes),
    notes,
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
  const sideTurningCompleted = /\bcompleted\b|\bdone\b|\byes\b/i.test(rec.sideTurning)
  return {
    patientName: rec.patientName.trim(),
    bedbound: /\bbe?dbound|bedridden\b/i.test(rec.mobility),
    sideTurningCompleted,
    nutritionStatus: rec.appetite?.trim() ? rec.appetite.trim() : 'Fair',
    skinCondition: rec.woundCondition?.trim() ? rec.woundCondition.trim() : 'Clear',
    moisture: 'Moderate',
    mobility: rec.mobility,
    age: 72,
    incontinence: /\bincontin/i.test(rec.notes ?? ''),
  }
}

function syntheticWanderingBody(rec: NursingClinicalRecord) {
  const text = `${rec.notes ?? ''} ${rec.mood}`.toLowerCase()
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
    nightShift: /\b(22|23|00|01|02|03|04):|night shift|overnight\b/i.test(notes),
    notes,
  }
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

function addIssue(by: Map<string, Set<string>>, patientName: string, issue: string) {
  const key = patientName.trim()
  if (!key || !issue.trim()) return
  let set = by.get(key)
  if (!set) {
    set = new Set()
    by.set(key, set)
  }
  set.add(issue.trim())
}

function queuedTaskPhrase(t: NurseQueuedTask): string {
  const name = t.patientName.trim()
  const tx = t.task.trim()
  if (!name || tx.toLowerCase().includes(name.toLowerCase())) return tx
  return `${tx.replace(/\.$/, '')} for ${name}`
}

function sortIssues(xs: Iterable<string>): string[] {
  return [...new Set([...xs].map((s) => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function buildHighRiskRows(by: Map<string, Set<string>>): HandoverAutoHighRiskPatient[] {
  const rows: HandoverAutoHighRiskPatient[] = []
  const names = [...by.keys()].sort((a, b) => a.localeCompare(b))
  for (const name of names) {
    const raw = sortIssues(by.get(name) ?? [])
    if (!raw.length) continue
    rows.push({ patientName: name, issues: raw.slice(0, 12) })
  }
  return rows
}

function deriveOverallShiftStatus(payload: {
  anyEmergencyCritical: boolean
  anyIncidentCriticalOrHigh: boolean
  supervisorCriticalOrUrgentSignals: boolean
  nightCritical: boolean
  highRiskCount: number
  urgentTasks: boolean
  dashboardAttention: boolean
  criticalAlertsLen: boolean
}): HandoverOverallShiftStatus {
  if (
    payload.anyEmergencyCritical ||
    payload.anyIncidentCriticalOrHigh ||
    payload.supervisorCriticalOrUrgentSignals ||
    payload.nightCritical
  )
    return 'Critical'
  if (
    payload.highRiskCount > 0 ||
    payload.urgentTasks ||
    payload.dashboardAttention ||
    payload.criticalAlertsLen
  )
    return 'Attention Required'
  return 'Stable'
}

function buildNarrative(input: {
  highRiskPatients: HandoverAutoHighRiskPatient[]
  pendingTurnPatients: number
  lowOxygenNames: Set<string>
  feverNames: Set<string>
  escalationNames: Set<string>
  bedExitPatients: Set<string>
}): string {
  const clauses: string[] = []
  const nHigh = input.highRiskPatients.length
  if (nHigh >= 3) {
    clauses.push('Several high-risk patients require close monitoring tonight.')
  } else if (nHigh === 2) {
    clauses.push('Two patients require heightened observation tonight.')
  } else if (nHigh === 1) {
    clauses.push(`${input.highRiskPatients[0].patientName} requires close monitoring tonight.`)
  }

  const primary = [...input.lowOxygenNames].sort()[0] ?? [...input.feverNames].sort()[0]
  if (
    primary &&
    (input.lowOxygenNames.size > 0 || input.feverNames.size > 0) &&
    input.escalationNames.size > 0
  ) {
    const bits: string[] = []
    if (input.lowOxygenNames.has(primary)) bits.push('low oxygen')
    if (input.feverNames.has(primary)) bits.push('fever')
    const vitalsBit = [...new Set(bits.filter(Boolean))]
    clauses.push(
      `${primary} experienced ${formatJoined(vitalsBit)} with doctor escalation initiated.`,
    )
  } else if (primary && (input.lowOxygenNames.has(primary) || input.feverNames.has(primary))) {
    if (input.lowOxygenNames.has(primary) && input.feverNames.has(primary))
      clauses.push(`${primary} had low oxygen and fever recorded on last vitals snapshot.`)
    else if (input.lowOxygenNames.has(primary))
      clauses.push(`${primary} had low oxygen on last vitals snapshot.`)
    else clauses.push(`${primary} ran febrile on monitoring.`)
  }

  if (input.pendingTurnPatients === 2) clauses.push('Two patients still require side turning.')
  else if (input.pendingTurnPatients >= 3) clauses.push(`${input.pendingTurnPatients} patients still require side turning.`)
  else if (input.pendingTurnPatients === 1) clauses.push('One patient still requires side turning.')

  if (input.bedExitPatients.size === 1) {
    clauses.push('One bed-exit alert detected during night shift.')
  } else if (input.bedExitPatients.size >= 2) {
    clauses.push(`${input.bedExitPatients.size} bed-exit alerts were raised this shift window.`)
  }

  const text = clauses.join(' ').replace(/\s+/g, ' ').trim()
  if (!text) return 'Facility snapshot gathered; limited acute deviations on aggregated coordinator inputs.'
  return text
}

function formatJoined(bits: string[]): string {
  const u = [...new Set(bits)].filter(Boolean)
  if (!u.length) return 'clinical concerns'
  if (u.length === 1) return u[0]!
  return `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]!}`
}

function buildRecommendations(input: {
  overall: HandoverOverallShiftStatus
  lowOx: boolean
  bedExit: boolean
  pendingTurn: boolean
  woundPhoto: boolean
  wanderHi: boolean
}): string[] {
  const r: string[] = []
  if (input.lowOx) r.push('Prioritize oxygen monitoring')
  if (input.bedExit || input.overall === 'Critical') r.push('Increase night supervision')
  if (input.pendingTurn) r.push('Ensure all pending turning completed')
  if (input.wanderHi) r.push('Reinforce elopement checks and egress awareness')
  if (input.woundPhoto) r.push('Close wound documentation loops with photo uploads')
  if (input.overall === 'Critical')
    r.push('Escalate open cases to supervisor and on-call clinician immediately')
  if (!r.length) r.push('Continue routine bedside surveillance and bedside safety checks')
  return [...new Set(r)]
}

/** Rule-based rollup from coordinators + deterministic engines (`preparedByAI`: rule engine / future LLM). */
export async function buildHandoverAutoGenerate(now = new Date()): Promise<HandoverAutoGenerateResponse> {
  if (isAutoHandoverCold()) {
    return structuredClone(MOCK_HANDOVER_AUTO_GENERATE)
  }

  const dashboard = await buildDashboardSummary()
  const supervisor = buildSupervisorEscalationQueue()
  const tasks = buildTasksQueue()
  const night = buildNightShiftMonitor()

  const issuesByPatient = new Map<string, Set<string>>()
  const pendingTurnPatients = new Set<string>()
  const lowOxygenNames = new Set<string>()
  const feverNames = new Set<string>()
  const escalationNames = new Set<string>()
  const bedExitPatients = new Set<string>()
  let anyEmergencyCritical = false
  const criticalAlertsDedup = new Set<string>()

  const latestNursing = latestByPatientName(nursingClinicalRecordsMemoryStore.list())

  let anyIncidentCriticalOrHigh = false
  for (const inc of incidentReportsMemoryStore.list()) {
    const name = inc.patientName.trim()
    if (!name) continue
    if (inc.incidentSeverity === 'Critical') {
      anyIncidentCriticalOrHigh = true
      addIssue(issuesByPatient, name, `${inc.incidentType} incident (Critical)`)
    } else if (inc.incidentSeverity === 'High') {
      anyIncidentCriticalOrHigh = true
      addIssue(issuesByPatient, name, `${inc.incidentType} incident (High)`)
    }
  }

  for (const [patientName, rec] of latestNursing) {
    const vit = analyzeVitals(vitalBody(rec))
    if (vit.alertLevel === 'High' || vit.alertLevel === 'Medium') {
      for (const sig of vit.abnormalSigns) {
        const s = sig.toLowerCase()
        if (/oxygen|spo2|\bo2\b/.test(s)) {
          addIssue(issuesByPatient, patientName, 'Low oxygen')
          lowOxygenNames.add(patientName)
        } else if (/fever|temp|temperature/.test(s)) {
          addIssue(issuesByPatient, patientName, vit.abnormalSigns.includes('Fever') ? 'High fever' : 'Fever')
          feverNames.add(patientName)
        } else {
          addIssue(issuesByPatient, patientName, sig)
        }
      }
      if (
        vit.abnormalSigns.includes('Low oxygen') &&
        (rec.temperature >= 38 || vit.abnormalSigns.includes('Fever'))
      ) {
        escalationNames.add(patientName)
      }
    }

    if (rec.temperature >= 38.5 && !vit.abnormalSigns.includes('Fever')) {
      addIssue(issuesByPatient, patientName, 'High fever')
      feverNames.add(patientName)
    } else if (rec.temperature >= 38.0 && !vit.abnormalSigns.includes('Fever')) {
      addIssue(issuesByPatient, patientName, 'Fever')
      feverNames.add(patientName)
    }

    if (rec.oxygen < 95 && !(vit.alertLevel === 'High' || vit.alertLevel === 'Medium')) {
      addIssue(issuesByPatient, patientName, 'Low oxygen')
      lowOxygenNames.add(patientName)
    }

    const esc = evaluateDoctorEscalation(escalationBody(rec))
    if (esc.escalationRequired && (esc.priority === 'Urgent' || esc.priority === 'High')) {
      addIssue(issuesByPatient, patientName, 'Doctor escalation')
      escalationNames.add(patientName)
    }

    const fall = generateFallRiskAssessment(syntheticFallBody(rec))
    if (fall.riskLevel === 'High')
      addIssue(issuesByPatient, patientName, 'High fall risk')
    else if (fall.riskLevel === 'Moderate') addIssue(issuesByPatient, patientName, 'Moderate fall risk')

    const pu = generatePressureUlcerRiskAssessment(syntheticPressureBody(rec))
    if (pu.riskLevel === 'High') addIssue(issuesByPatient, patientName, 'High pressure ulcer risk')
    else if (pu.riskLevel === 'Moderate')
      addIssue(issuesByPatient, patientName, 'Moderate pressure ulcer risk')

    if (/\bpending\b|\bdue\b|\bnot\s+completed\b/i.test(rec.sideTurning)) pendingTurnPatients.add(patientName)

    if (medNotesCue(rec.notes ?? '')) addIssue(issuesByPatient, patientName, 'Medication alert flagged')

    const em = generateEmergencyResponse(nursingRecordToEmergencyBody(rec))
    if (em.emergencyLevel === 'Critical') {
      addIssue(issuesByPatient, patientName, 'Critical emergency pattern')
      anyEmergencyCritical = true
      criticalAlertsDedup.add('Emergency case detected on rule engine review')
    } else if (em.emergencyLevel === 'High') {
      addIssue(issuesByPatient, patientName, 'Elevated emergency pattern')
    }

    const wand = generateWanderingRiskAssessment(syntheticWanderingBody(rec))
    if (wand.riskLevel === 'High') addIssue(issuesByPatient, patientName, 'High wandering risk')

    const bed = generateBedExitAlert(syntheticBedExitBody(rec, wand.riskLevel, fall.riskLevel))
    if (bed.bedExitAlertLevel === 'Urgent' || bed.bedExitAlertLevel === 'High') {
      addIssue(issuesByPatient, patientName, 'Bed exit alert')
      bedExitPatients.add(patientName)
    }
  }

  const latestWounds = latestByPatientName(woundAssessmentMemoryStore.list())
  for (const [name, w] of latestWounds) {
    if (w.infectionRisk === 'High') addIssue(issuesByPatient, name, 'Elevated wound concern')
    else if (w.infectionRisk === 'Medium') addIssue(issuesByPatient, name, 'Wound surveillance')
    if (!w.photoUploaded) addIssue(issuesByPatient, name, 'Wound photo incomplete')
  }

  for (const q of supervisor.queue) {
    if (q.priority === 'Urgent' && q.source === 'Doctor Escalation') {
      escalationNames.add(q.patientName.trim())
      criticalAlertsDedup.add('Doctor escalation active')
    }
    if (q.source === 'Bed Exit Alert') {
      const n = q.patientName.trim()
      if (!/^shift:/i.test(n)) {
        bedExitPatients.add(n)
        addIssue(issuesByPatient, n, 'Bed exit alert')
      }
      if (q.priority === 'Urgent' || q.priority === 'High') criticalAlertsDedup.add('Bed exit alert detected')
    }
    if (
      q.source === 'Incident Reports' &&
      (q.priority === 'Urgent' || q.priority === 'High')
    ) {
      criticalAlertsDedup.add('Serious incident follow-up pending')
    }
  }

  if (criticalAlertsDedup.size === 0 && escalationNames.size > 0) {
    criticalAlertsDedup.add('Doctor escalation active')
  }

  let wandHi = false
  for (const row of supervisor.queue) {
    if (
      row.source === 'Wandering Risk' &&
      (row.priority === 'Urgent' || row.priority === 'High')
    ) {
      wandHi = true
      break
    }
  }

  const highRiskRows = buildHighRiskRows(issuesByPatient)

  const pendingTaskLines = [
    ...tasks.tasks.slice(0, 25).map(queuedTaskPhrase),
    ...night.nightShiftSummary.pendingTasks,
  ].filter(Boolean)
  const pendingTasksUniq = [...new Set(pendingTaskLines)].slice(0, 32)

  const woundPhotoOutstanding = [...latestWounds.values()].some((w) => !w.photoUploaded)

  const supervisorCriticalSignals =
    supervisor.systemStatus === 'Critical' ||
    supervisor.summary.urgentCases >= 2 ||
    supervisor.queue.some((q) => q.source === 'Bed Exit Alert' && q.priority === 'Urgent')

  const urgentTasksExist = tasks.summary.urgentTasks > 0

  const overallShiftStatus = deriveOverallShiftStatus({
    anyEmergencyCritical,
    anyIncidentCriticalOrHigh,
    supervisorCriticalOrUrgentSignals: supervisorCriticalSignals,
    nightCritical: night.systemStatus === 'Critical',
    highRiskCount: highRiskRows.length,
    urgentTasks: urgentTasksExist,
    dashboardAttention: dashboard.shiftStatus === 'Attention Required',
    criticalAlertsLen: Boolean(night.nightShiftSummary.criticalAlerts.length),
  })

  const criticalAlerts = [
    ...criticalAlertsDedup,
    ...night.nightShiftSummary.criticalAlerts.slice(0, 6),
  ].filter(Boolean)
  const criticalAlertsDedupSorted = [...new Set(criticalAlerts)].slice(0, 10)

  const handoverSummary = buildNarrative({
    highRiskPatients: highRiskRows,
    pendingTurnPatients:
      pendingTurnPatients.size ||
      dashboard.pendingTasks.filter((t) => /side turning/i.test(t)).length,
    lowOxygenNames,
    feverNames,
    escalationNames,
    bedExitPatients,
  })

  const recommendations = buildRecommendations({
    overall: overallShiftStatus,
    lowOx: lowOxygenNames.size > 0,
    bedExit: bedExitPatients.size > 0 || criticalAlertsDedupSorted.some((x) => /bed exit/i.test(x)),
    pendingTurn:
      pendingTurnPatients.size > 0 || pendingTasksUniq.some((t) => /side turning/i.test(t)),
    woundPhoto: woundPhotoOutstanding,
    wanderHi: wandHi,
  })

  const shift = inferShiftLabel(now)
  const generatedAt = formatHandoverLocalTimestamp(now)

  return {
    shift,
    generatedAt,
    overallShiftStatus,
    handoverSummary,
    highRiskPatients: highRiskRows,
    pendingTasks: pendingTasksUniq.length ? pendingTasksUniq : [...night.nightShiftSummary.pendingTasks],
    criticalAlerts: criticalAlertsDedupSorted,
    recommendations,
    preparedByAI: true,
  }
}
