import type { IncidentReportRecord } from '../incidents/incident.types.js'
import type { NurseQueuedTask } from '../tasks/tasks.types.js'
import { incidentReportsMemoryStore } from '../incidents/incident.store.js'
import { nursingAnnouncementMemoryStore } from '../announcements/nursingAnnouncement.store.js'
import { nursingClinicalRecordsMemoryStore } from '../nursing/nursing.records.store.js'
import { sideTurningMemoryStore } from '../turning/turning.store.js'
import { woundAssessmentMemoryStore } from '../wound/woundAssessment.store.js'
import type { NursingClinicalRecord } from '../nursing/nursing.records.types.js'
import { buildTasksQueue } from '../tasks/tasksQueue.service.js'
import { generateBedExitAlert } from '../risk/bedExitAlert.service.js'
import type { AnnouncementPriority } from '../announcements/nursingAnnouncement.types.js'
import { generateFallRiskAssessment } from '../risk/fallScore.service.js'
import { generateWanderingRiskAssessment } from '../risk/wanderingRisk.service.js'
import type {
  SupervisorEscalationQueueItem,
  SupervisorEscalationQueueResponse,
  SupervisorQueuePriority,
  SupervisorSystemStatus,
} from './supervisorEscalationQueue.types.js'

/** Shown when coordinator buffers + satellite stores are empty — aligns with onboarding demo */
export const MOCK_SUPERVISOR_ESCALATION_QUEUE: SupervisorEscalationQueueResponse = {
  queue: [
    {
      priority: 'Urgent',
      patientName: 'Ah Chong',
      issue: 'Low oxygen and high fever',
      source: 'Doctor Escalation',
      recommendedAction: 'Notify doctor immediately',
    },
    {
      priority: 'High',
      patientName: 'Ah Chong',
      issue: 'Pressure ulcer risk',
      source: 'Pressure Ulcer Risk',
      recommendedAction: 'Complete side turning',
    },
    {
      priority: 'Medium',
      patientName: 'Test Patient',
      issue: 'Wound photo not uploaded',
      source: 'Wound Monitoring',
      recommendedAction: 'Upload wound photo',
    },
  ],
  summary: {
    urgentCases: 1,
    highRiskCases: 1,
    mediumRiskCases: 1,
    totalQueueItems: 3,
  },
  systemStatus: 'Attention Required',
}

const PRIORITY_ORDER: Record<SupervisorQueuePriority, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
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

function displaySourceForTask(source: string): string {
  if (source === 'Vital Signs') return 'Vital Sign Alerts'
  return source
}

function recommendedActionFromNurseTask(t: NurseQueuedTask): string {
  switch (t.source) {
    case 'Doctor Escalation':
      return 'Notify doctor immediately'
    case 'Vital Signs':
      return t.priority === 'Urgent'
        ? 'Notify doctor immediately'
        : 'Repeat vital signs and escalate if unstable'
    case 'Pressure Ulcer Risk':
      return 'Complete side turning'
    case 'Fall Risk':
      return 'Maintain fall precautions and reassess mobility'
    case 'Medication Alerts':
      return 'Review MAR and clarify orders if needed'
    case 'Wound Monitoring':
      return 'Upload wound photo'
    case 'Side Turning Tracking':
      return 'Complete documentation and any required photos'
    default:
      return 'Review with nurse in charge and document actions'
  }
}

function nurseTaskToSupervisorItem(t: NurseQueuedTask): SupervisorEscalationQueueItem {
  return {
    priority: t.priority,
    patientName: t.patientName,
    issue: t.task,
    source: displaySourceForTask(t.source),
    recommendedAction: recommendedActionFromNurseTask(t),
  }
}

function announcementPriorityToQueue(p: AnnouncementPriority): SupervisorQueuePriority {
  if (p === 'Urgent') return 'Urgent'
  if (p === 'High') return 'High'
  if (p === 'Medium') return 'Medium'
  return 'Low'
}

function incidentToItem(inc: IncidentReportRecord): SupervisorEscalationQueueItem {
  let priority: SupervisorQueuePriority = 'Medium'
  if (inc.incidentSeverity === 'Critical') priority = 'Urgent'
  else if (inc.incidentSeverity === 'High') priority = 'High'
  else if (inc.incidentSeverity === 'Low') priority = 'Low'

  const injuryBit = inc.injuryDetected
    ? inc.injuryDetails.trim() || 'Injury noted'
    : 'No acute injury documented'

  return {
    priority,
    patientName: inc.patientName,
    issue: `${inc.incidentType} — ${injuryBit}`,
    source: 'Incident Reports',
    recommendedAction:
      inc.recommendedActions[0] ?? 'Complete incident documentation and supervisor review',
  }
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
    nightShift: /\b(22|23|00|01|02|03|04):|night shift|overnight\b/i.test(notes),
    notes,
  }
}

function sortQueue(rows: SupervisorEscalationQueueItem[]): SupervisorEscalationQueueItem[] {
  return [...rows].sort((a, b) => {
    const dp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (dp !== 0) return dp
    return a.patientName.localeCompare(b.patientName)
  })
}

function summarize(queue: SupervisorEscalationQueueItem[]): SupervisorEscalationQueueResponse['summary'] {
  return {
    urgentCases: queue.filter((q) => q.priority === 'Urgent').length,
    highRiskCases: queue.filter((q) => q.priority === 'High').length,
    mediumRiskCases: queue.filter((q) => q.priority === 'Medium').length,
    totalQueueItems: queue.length,
  }
}

function deriveSystemStatus(s: SupervisorEscalationQueueResponse['summary']): SupervisorSystemStatus {
  if (s.totalQueueItems === 0) return 'Stable'
  if (s.urgentCases >= 2 || (s.urgentCases >= 1 && s.highRiskCases >= 2)) return 'Critical'
  if (s.urgentCases >= 1 || s.highRiskCases >= 1 || s.mediumRiskCases >= 1) return 'Attention Required'
  return 'Stable'
}

export function buildSupervisorEscalationQueue(): SupervisorEscalationQueueResponse {
  if (isCoordinatorTripleEmpty() && hasNoIncidentsOrAnnouncements()) {
    return structuredClone(MOCK_SUPERVISOR_ESCALATION_QUEUE)
  }

  const queue: SupervisorEscalationQueueItem[] = []

  if (!isCoordinatorTripleEmpty()) {
    const tasks = buildTasksQueue().tasks
    for (const t of tasks) queue.push(nurseTaskToSupervisorItem(t))

    const latestNursing = latestByPatientName(nursingClinicalRecordsMemoryStore.list())

    for (const [patientName, rec] of latestNursing) {
      const wand = generateWanderingRiskAssessment(syntheticWanderingBody(rec))
      if (wand.riskLevel === 'High') {
        queue.push({
          priority: 'High',
          patientName,
          issue: `Wandering / elopement risk — ${wand.riskFactors.slice(0, 4).join(', ')}`,
          source: 'Wandering Risk',
          recommendedAction: wand.recommendations[0] ?? 'Increase supervision and safeguards',
        })
      } else if (wand.riskLevel === 'Medium') {
        queue.push({
          priority: 'Medium',
          patientName,
          issue: 'Moderate wandering risk noted on last assessment',
          source: 'Wandering Risk',
          recommendedAction: wand.recommendations[0] ?? 'Reinforce orientation and rounding',
        })
      }

      const fall = generateFallRiskAssessment({
        patientName,
        mobility: rec.mobility,
        mood: rec.mood,
        painScore: rec.painScore,
        oxygen: rec.oxygen,
        historyOfFalls: false,
        walkingAssist: /\bassist|rail|cane|walker\b/i.test(rec.mobility),
        confusion: /\bconfus|disorient|agitat\b/i.test(rec.mood),
        age: 72,
      })

      const bed = generateBedExitAlert(syntheticBedExitBody(rec, wand.riskLevel, fall.riskLevel))
      if (bed.bedExitAlertLevel === 'Urgent' || bed.bedExitAlertLevel === 'High') {
        queue.push({
          priority: bed.bedExitAlertLevel === 'Urgent' ? 'Urgent' : 'High',
          patientName,
          issue: bed.alertReasons.join('; ') || 'Bed-exit safety concern',
          source: 'Bed Exit Alert',
          recommendedAction: bed.recommendedActions[0] ?? 'Attend bedside and mitigate fall risk',
        })
      } else if (bed.bedExitAlertLevel === 'Medium') {
        queue.push({
          priority: 'Medium',
          patientName,
          issue: 'Bed-exit risk — review safeguards',
          source: 'Bed Exit Alert',
          recommendedAction: bed.recommendedActions[0] ?? 'Increase observation around transfers',
        })
      }
    }
  }

  for (const inc of incidentReportsMemoryStore.list()) {
    queue.push(incidentToItem(inc))
  }

  for (const ann of nursingAnnouncementMemoryStore.list()) {
    if (ann.requiresAcknowledgement && ann.acknowledgements.length === 0) {
      queue.push({
        priority: announcementPriorityToQueue(ann.priority),
        patientName: `Shift: ${ann.targetShift}`,
        issue: `Pending acknowledgement — ${ann.title}`,
        source: 'Pending Acknowledgements',
        recommendedAction: 'Confirm read receipt with assigned nursing staff',
      })
    }
  }

  const sorted = sortQueue(queue)
  const summary = summarize(sorted)
  return {
    queue: sorted,
    summary,
    systemStatus: deriveSystemStatus(summary),
  }
}
