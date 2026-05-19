import { nursingAnnouncementMemoryStore } from '../announcements/nursingAnnouncement.store.js'
import { buildDashboardSummary } from '../dashboard/dashboard.service.js'
import { generateEmergencyResponse } from '../emergency/emergencyRespond.service.js'
import type { EmergencyRespondBody } from '../emergency/emergencyRespond.validation.js'
import { incidentReportsMemoryStore } from '../incidents/incident.store.js'
import type { NursingClinicalRecord } from '../nursing/nursing.records.types.js'
import { nursingClinicalRecordsMemoryStore } from '../nursing/nursing.records.store.js'
import { buildNightShiftMonitor } from '../nightShift/nightShiftMonitor.service.js'
import type { NightShiftMonitorResponse } from '../nightShift/nightShiftMonitor.types.js'
import { sideTurningMemoryStore } from '../turning/turning.store.js'
import { buildTasksQueue } from '../tasks/tasksQueue.service.js'
import { woundAssessmentMemoryStore } from '../wound/woundAssessment.store.js'
import { buildSupervisorEscalationQueue } from '../supervisor/supervisorEscalationQueue.service.js'
import type {
  SupervisorEscalationQueueItem,
  SupervisorSystemStatus,
} from '../supervisor/supervisorEscalationQueue.types.js'
import type {
  CommandCenterCriticalPatient,
  CommandCenterFacilityStatus,
  CommandCenterStatusResponse,
  CommandCenterSummary,
  CommandCenterPatientPriority,
  CommandCenterSystemHealth,
} from './commandCenter.types.js'

/** Full-facility snapshot when coordinator buffers / satellite feeds are cold */
export const MOCK_COMMAND_CENTER_STATUS: CommandCenterStatusResponse = {
  facilityStatus: 'Critical',
  summary: {
    totalPatients: 58,
    highRiskPatients: 6,
    emergencyCases: 1,
    doctorEscalations: 3,
    pendingSideTurning: 5,
    medicationAlerts: 2,
    bedExitAlerts: 1,
    fallRiskAlerts: 4,
    pressureUlcerRisks: 5,
    wanderingRisks: 2,
    vitalSignAlerts: 3,
    pendingAcknowledgements: 5,
    incidentReports: 2,
    nightShiftAlerts: 5,
    nurseTaskQueue: 18,
    unresolvedUrgentTasks: 4,
  },
  criticalPatients: [{ patientName: 'Ah Chong', issue: 'Low oxygen and fever', priority: 'Critical' }],
  operationalAlerts: [
    '2 wound photos missing',
    '3 urgent tasks unacknowledged',
    'Night shift monitoring required',
  ],
  recommendedActions: [
    'Prioritize emergency cases immediately',
    'Complete pending side turning',
    'Review all unresolved urgent alerts',
    'Increase supervision for wandering-risk patients',
  ],
  systemHealth: {
    apiStatus: 'Online',
    alertEngine: 'Running',
    handoverSystem: 'Running',
    riskMonitoring: 'Running',
  },
}

const DEFAULT_SYSTEM_HEALTH: CommandCenterSystemHealth = {
  apiStatus: 'Online',
  alertEngine: 'Running',
  handoverSystem: 'Running',
  riskMonitoring: 'Running',
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

function isCommandCenterCold(): boolean {
  return (
    nursingClinicalRecordsMemoryStore.list().length === 0 &&
    sideTurningMemoryStore.list().length === 0 &&
    woundAssessmentMemoryStore.list().length === 0 &&
    incidentReportsMemoryStore.list().length === 0 &&
    nursingAnnouncementMemoryStore.list().length === 0
  )
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

function mapQueuePriority(p: SupervisorEscalationQueueItem['priority']): CommandCenterPatientPriority {
  if (p === 'Urgent') return 'Critical'
  return p
}

function extractCriticalPatients(queue: SupervisorEscalationQueueItem[]): CommandCenterCriticalPatient[] {
  const seen = new Set<string>()
  const out: CommandCenterCriticalPatient[] = []
  for (const q of queue) {
    if (q.priority !== 'Urgent' && q.priority !== 'High') continue
    const key = q.patientName.trim()
    if (/^shift:/i.test(key)) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      patientName: key,
      issue: q.issue,
      priority: mapQueuePriority(q.priority),
    })
    if (out.length >= 12) break
  }
  return out
}

function countPendingSideTurningNursing(latestNursing: Map<string, NursingClinicalRecord>): number {
  let c = 0
  for (const [, rec] of latestNursing) {
    if (/\bpending\b|\bdue\b|\bnot\s+completed\b/i.test(rec.sideTurning)) c += 1
  }
  return c
}

function countWoundPhotosMissing(): number {
  let c = 0
  for (const [, w] of latestByPatientName(woundAssessmentMemoryStore.list())) {
    if (!w.photoUploaded) c += 1
  }
  return c
}

function countPendingBulletinAcks(): number {
  return nursingAnnouncementMemoryStore.list().filter(
    (a) => a.requiresAcknowledgement && a.acknowledgements.length === 0,
  ).length
}

function countUrgentUnackedBulletins(): number {
  return nursingAnnouncementMemoryStore.list().filter(
    (a) =>
      a.requiresAcknowledgement &&
      a.acknowledgements.length === 0 &&
      (a.priority === 'Urgent' || a.priority === 'High'),
  ).length
}

function deriveFacilityStatus(
  s: CommandCenterSummary,
  nightSys: NightShiftMonitorResponse['systemStatus'],
  supSys: SupervisorSystemStatus,
): CommandCenterFacilityStatus {
  let score = 0
  if (s.emergencyCases >= 1) score += 6
  if (s.doctorEscalations >= 2) score += 3
  else if (s.doctorEscalations >= 1) score += 1
  if (s.unresolvedUrgentTasks >= 3) score += 3
  else if (s.unresolvedUrgentTasks >= 1) score += 1
  if (s.vitalSignAlerts >= 2) score += 2
  else if (s.vitalSignAlerts >= 1) score += 1
  if (s.bedExitAlerts >= 1) score += 2
  if (s.incidentReports >= 1) score += 1
  if (s.pendingAcknowledgements >= 4) score += 1

  const nightCrit = nightSys === 'Critical'
  const supCrit = supSys === 'Critical'
  if ((s.emergencyCases >= 1 && nightCrit) || supCrit || nightCrit || score >= 10) return 'Critical'
  if (score >= 6 || s.highRiskPatients >= 5) return 'High Alert'
  if (score >= 2 || nightSys === 'Attention Required' || supSys === 'Attention Required') {
    return 'Attention Required'
  }
  return 'Stable'
}

function buildOperationalAlertsLive(
  s: CommandCenterSummary,
  woundPhotosMissing: number,
  night: NightShiftMonitorResponse,
): string[] {
  const op: string[] = []
  if (woundPhotosMissing > 0) {
    op.push(`${woundPhotosMissing} wound photo${woundPhotosMissing === 1 ? '' : 's'} missing`)
  }
  if (s.unresolvedUrgentTasks > 0) {
    op.push(`${s.unresolvedUrgentTasks} urgent tasks unacknowledged`)
  }
  if (night.systemStatus === 'Critical') {
    op.push('Night shift monitoring required')
  }
  if (op.length === 0) {
    op.push('No major operational exceptions flagged on this snapshot')
  }
  return op
}

function buildRecommendedActions(
  facilityStatus: CommandCenterFacilityStatus,
  s: CommandCenterSummary,
): string[] {
  const rx: string[] = []
  if (s.emergencyCases > 0) rx.push('Prioritize emergency cases immediately')
  if (s.pendingSideTurning > 0) rx.push('Complete pending side turning')
  if (s.unresolvedUrgentTasks > 0) rx.push('Review all unresolved urgent alerts')
  if (s.wanderingRisks > 0) rx.push('Increase supervision for wandering-risk patients')
  if (s.medicationAlerts > 0) rx.push('Clear medication alerts with pharmacy and bedside verification')
  if (s.pressureUlcerRisks > 0 || s.fallRiskAlerts > 0) {
    rx.push('Reassess mobility and repositioning bundles for flagged patients')
  }
  if (facilityStatus === 'Critical' && rx.length < 4) {
    rx.push('Escalate to facility medical director within 30 minutes')
  }
  if (rx.length === 0) {
    rx.push('Maintain standard rounding and documentation cadence')
  }
  return [...new Set(rx)]
}

export async function buildCommandCenterStatus(): Promise<CommandCenterStatusResponse> {
  if (isCommandCenterCold()) {
    return structuredClone(MOCK_COMMAND_CENTER_STATUS)
  }

  const dashboard = await buildDashboardSummary()
  const supervisor = buildSupervisorEscalationQueue()
  const tasks = buildTasksQueue()
  const night = buildNightShiftMonitor()

  const latestNursing = latestByPatientName(nursingClinicalRecordsMemoryStore.list())

  let emergencyCases = 0
  for (const [, rec] of latestNursing) {
    const level = generateEmergencyResponse(nursingRecordToEmergencyBody(rec)).emergencyLevel
    if (level === 'Critical') emergencyCases += 1
  }

  const bedExitAlerts = supervisor.queue.filter((q) => q.source === 'Bed Exit Alert').length
  const wanderingRisks = supervisor.queue.filter((q) => q.source === 'Wandering Risk').length

  const pendingAcknowledgements = countPendingBulletinAcks()
  const unresolvedUrgentTasks = tasks.summary.urgentTasks + countUrgentUnackedBulletins()

  const woundPhotosMissing = countWoundPhotosMissing()

  const summary: CommandCenterSummary = {
    totalPatients: dashboard.totalPatients,
    highRiskPatients: dashboard.highRiskPatients.length,
    emergencyCases,
    doctorEscalations: dashboard.alerts.doctorEscalations,
    pendingSideTurning: countPendingSideTurningNursing(latestNursing),
    medicationAlerts: dashboard.alerts.medicationAlerts,
    bedExitAlerts,
    fallRiskAlerts: dashboard.alerts.fallRisk,
    pressureUlcerRisks: dashboard.alerts.pressureUlcerRisk,
    wanderingRisks,
    vitalSignAlerts: dashboard.alerts.vitalAlerts,
    pendingAcknowledgements,
    incidentReports: incidentReportsMemoryStore.list().length,
    nightShiftAlerts:
      night.nightShiftSummary.criticalAlerts.length + night.nightShiftSummary.unacknowledgedAlerts,
    nurseTaskQueue: tasks.summary.totalTasks,
    unresolvedUrgentTasks,
  }

  const facilityStatus = deriveFacilityStatus(summary, night.systemStatus, supervisor.systemStatus)
  const criticalPatients = extractCriticalPatients(supervisor.queue)
  const operationalAlerts = buildOperationalAlertsLive(summary, woundPhotosMissing, night)

  const recommendedActions = buildRecommendedActions(facilityStatus, summary)

  return {
    facilityStatus,
    summary,
    criticalPatients,
    operationalAlerts,
    recommendedActions,
    systemHealth: DEFAULT_SYSTEM_HEALTH,
  }
}
