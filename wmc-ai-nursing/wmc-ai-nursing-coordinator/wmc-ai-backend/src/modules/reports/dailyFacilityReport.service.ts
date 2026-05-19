import { nursingAnnouncementMemoryStore } from '../announcements/nursingAnnouncement.store.js'
import { buildCommandCenterStatus } from '../commandCenter/commandCenter.service.js'
import { buildFamilyCommunicationQueue } from '../family/familyCommunicationQueue.service.js'
import { buildHandoverAutoGenerate } from '../handover/handoverAutoGenerate.service.js'
import { incidentReportsMemoryStore } from '../incidents/incident.store.js'
import { nursingClinicalRecordsMemoryStore } from '../nursing/nursing.records.store.js'
import { nurseShiftOtMemoryStore } from '../nurseShift/nurseShift.store.js'
import { nurseReminderMemoryStore } from '../reminders/nurseReminder.store.js'
import { sideTurningMemoryStore } from '../turning/turning.store.js'
import { buildNightShiftMonitor } from '../nightShift/nightShiftMonitor.service.js'
import { woundAssessmentMemoryStore } from '../wound/woundAssessment.store.js'
import type {
  DailyFacilityFacilityStatus,
  DailyFacilityKeyMetrics,
  DailyFacilityReportResponse,
} from './dailyFacilityReport.types.js'
import type { CommandCenterFacilityStatus } from '../commandCenter/commandCenter.types.js'

/** Cold coordinator snapshot — aligns with onboarding / command-center cold paths */
export const MOCK_DAILY_FACILITY_REPORT: DailyFacilityReportResponse = {
  reportDate: '2026-05-19',
  facilityStatus: 'Attention Required',
  executiveSummary:
    'Today the facility recorded one emergency case, three high-risk patients, two pending side turning tasks and one doctor escalation. Overall operations require attention but remain manageable.',
  shiftHandoverStatus: 'Attention Required — open escalations and turning gaps remain actionable before night shift.',
  keyMetrics: {
    totalPatients: 58,
    highRiskPatients: 3,
    emergencyCases: 1,
    doctorEscalations: 1,
    incidentReports: 2,
    pendingTasks: 6,
    medicationAlerts: 2,
    woundCases: 3,
    totalOTHours: 4.5,
  },
  riskHighlights: [
    'Ah Chong requires close monitoring for low oxygen and fever',
    'Two patients have pressure ulcer risk due to missed turning',
  ],
  staffHighlights: [
    'Nurse Mary completed most assigned tasks',
    'Night shift requires additional supervision',
  ],
  familyCommunicationSummary: [
    'One urgent family update pending',
    'Two routine updates recommended',
  ],
  managementRecommendations: [
    'Review high-risk patients before night shift',
    'Ensure all side turning records are completed',
    'Follow up pending family communication',
    'Monitor staff overtime',
  ],
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

export function formatReportDateUtc(d = new Date()): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function isDailyFacilityReportCold(): boolean {
  return (
    nursingClinicalRecordsMemoryStore.list().length === 0 &&
    sideTurningMemoryStore.list().length === 0 &&
    woundAssessmentMemoryStore.list().length === 0 &&
    incidentReportsMemoryStore.list().length === 0 &&
    nursingAnnouncementMemoryStore.list().length === 0
  )
}

function mapFacilityStatus(s: CommandCenterFacilityStatus): DailyFacilityFacilityStatus {
  return s
}

function countMissedSideTurningNursing(): number {
  let c = 0
  for (const [, rec] of latestByPatientName(nursingClinicalRecordsMemoryStore.list())) {
    if (/\bpending\b|\bdue\b|\bnot\s+completed\b|\bdelay/i.test(rec.sideTurning)) c += 1
  }
  return c
}

function topReminderAssignee(): string | null {
  const tally = new Map<string, number>()
  for (const r of nurseReminderMemoryStore.list()) {
    const n = r.assignedTo.trim()
    if (!n || /^staff$/i.test(n)) continue
    tally.set(n, (tally.get(n) ?? 0) + 1)
  }
  let bestName: string | null = null
  let bestScore = -1
  for (const [name, score] of tally) {
    if (score > bestScore) {
      bestScore = score
      bestName = name
    }
  }
  return bestScore > 0 ? bestName : null
}

interface InternalRollup extends DailyFacilityKeyMetrics {
  completedSideTurning: number
  missedSideTurning: number
  staffWorkloadIndex: number
}

function buildExecutiveFromInternal(mx: InternalRollup, facility: DailyFacilityFacilityStatus): string {
  const urgency =
    facility === 'Critical'
      ? 'Facility operations entered a tightly coupled critical pattern today.'
      : facility === 'High Alert'
        ? 'Throughput pressure and risk clustering warrant senior visibility today.'
        : facility === 'Attention Required'
          ? 'Overall operations require attention but remain manageable.'
          : 'Operations remained broadly within tolerance with normal surveillance.'

  const missBit =
    mx.missedSideTurning > 0
      ? `${mx.missedSideTurning} missed turning cue${mx.missedSideTurning === 1 ? '' : 's'}, `
      : ''

  return (
    `Today the facility recorded ${mx.emergencyCases} emergency ${mx.emergencyCases === 1 ? 'case' : 'cases'}, ` +
    `${mx.highRiskPatients} high-risk ${mx.highRiskPatients === 1 ? 'patient' : 'patients'}, ` +
    missBit +
    `${mx.pendingTasks} pending ${mx.pendingTasks === 1 ? 'task' : 'tasks'} and ${mx.doctorEscalations} doctor ` +
    `${mx.doctorEscalations === 1 ? 'escalation' : 'escalations'}. ${urgency}`
  )
}

function buildRiskHighlights(
  cc: Awaited<ReturnType<typeof buildCommandCenterStatus>>,
  missedTurn: number,
): string[] {
  const highlights: string[] = []
  for (const cp of cc.criticalPatients.slice(0, 4)) {
    highlights.push(
      `${cp.patientName.trim()} requires close monitoring regarding ${cp.issue.replace(/\.$/, '')}.`,
    )
  }

  const puBand = cc.summary.pressureUlcerRisks
  if (puBand >= 2 && missedTurn >= 2) {
    highlights.push(`${missedTurn} patients have elevated pressure ulcer risk cues tied to missed turning.`)
  } else if (puBand >= 1 && missedTurn >= 1) {
    highlights.push('Pressure injury prevention bundle should pair with overdue turning completions tonight.')
  } else if (missedTurn >= 3 && highlights.length === 0) {
    highlights.push(`${missedTurn} patients flagged for missed or delayed repositioning cues.`)
  }

  return highlights.slice(0, 6)
}

function buildStaffHighlights(
  workload: number,
  otHours: number,
  nightStatus: string,
  topNurse: string | null,
): string[] {
  const out: string[] = []
  if (topNurse) out.push(`${topNurse} surfaced with the busiest reminder/task assignment profile today.`)
  else out.push('Cross-check roster parity — no single nurse dominated reminder queues on this rollup.')

  if (workload >= 18) out.push(`Aggregate workload pulse is elevated (${workload} weighted units across queues).`)
  else if (workload >= 10) out.push(`Staff workload trending moderate (${workload} weighted workload units).`)
  else out.push('Staff cue volume appears manageable relative to seeded coordinator buffers.')

  if (nightStatus === 'Critical') out.push('Night shift requires additional supervision tonight.')
  else if (nightStatus === 'Attention Required') out.push('Night shift supervisors should widen rounding checks.')
  else out.push('Night shift footprint looks sustainable on current aggregator inputs.')

  if (otHours >= 10) out.push(`Overtime hours rolling up to ${otHours.toFixed(1)}h — audit fatigue-sensitive duties.`)
  else if (otHours >= 4) out.push(`Overtime at ${otHours.toFixed(1)}h merits brief staffing recap.`)

  return [...new Set(out)].slice(0, 6)
}

function familySummaryLines(u: number, r: number): string[] {
  const lines: string[] = []
  if (u > 0) {
    lines.push(
      `${u === 1 ? 'One urgent' : `${u} urgent`} family update${u === 1 ? '' : 's'} pending`,
    )
  }
  if (r > 0) {
    lines.push(`${r === 1 ? 'One routine update recommended' : `${r} routine updates recommended`}`)
  }
  if (!lines.length) lines.push('No outstanding family-queue flags on aggregator inputs.')
  return lines
}

function buildManagementRecommendations(
  facility: DailyFacilityFacilityStatus,
  m: DailyFacilityKeyMetrics,
  missedTurn: number,
  pendingFamilyCommunications: number,
  fqRecs: string[],
  ccRecs: string[],
  handRecs: string[],
): string[] {
  const rx: string[] = []
  rx.push(...ccRecs.slice(0, 2))
  rx.push(...fqRecs.slice(0, 2))
  rx.push(...handRecs.slice(0, 2))

  if (m.highRiskPatients > 0) rx.push('Review high-risk patients before night shift')
  if (missedTurn > 0) rx.push('Ensure all side turning records are completed')
  if (pendingFamilyCommunications > 0) rx.push('Follow up pending family communication')
  if (m.totalOTHours >= 4) rx.push('Monitor staff overtime')

  if (facility === 'Critical')
    rx.push('Escalate to executive medical director immediately for bottleneck triage.')

  const dedup = [...new Set(rx.map((x) => x.trim()).filter(Boolean))]
  return dedup.slice(0, 12)
}

export async function buildDailyFacilityReport(asOf = new Date()): Promise<DailyFacilityReportResponse> {
  if (isDailyFacilityReportCold()) {
    return structuredClone(MOCK_DAILY_FACILITY_REPORT)
  }

  const [cc, fq, ho, night] = await Promise.all([
    buildCommandCenterStatus(),
    buildFamilyCommunicationQueue(),
    buildHandoverAutoGenerate(asOf),
    Promise.resolve(buildNightShiftMonitor()),
  ])

  const missedTurn = countMissedSideTurningNursing()
  const completedTurnLogs = sideTurningMemoryStore.list().length

  let totalOt = nurseShiftOtMemoryStore.list().reduce((acc, r) => acc + (r.overtimeHours ?? 0), 0)
  totalOt = Math.round(totalOt * 10) / 10

  const woundCases = woundAssessmentMemoryStore.list().length

  const staffWorkloadIndex = Math.round(
    cc.summary.nurseTaskQueue +
      cc.summary.unresolvedUrgentTasks * 3 +
      cc.summary.pendingAcknowledgements +
      fq.summary.totalPendingCommunications,
  )

  /** Public key metrics omit internal-only tallies kept for narrative synthesis */
  const keyMetricsPub: DailyFacilityKeyMetrics = {
    totalPatients: cc.summary.totalPatients,
    highRiskPatients: cc.summary.highRiskPatients,
    emergencyCases: cc.summary.emergencyCases,
    doctorEscalations: cc.summary.doctorEscalations,
    incidentReports: cc.summary.incidentReports,
    pendingTasks: cc.summary.nurseTaskQueue,
    medicationAlerts: cc.summary.medicationAlerts,
    woundCases,
    totalOTHours: totalOt,
  }

  const internal: InternalRollup = {
    ...keyMetricsPub,
    completedSideTurning: completedTurnLogs,
    missedSideTurning: missedTurn,
    staffWorkloadIndex,
  }

  const facilityStatus = mapFacilityStatus(cc.facilityStatus)

  const executiveSummary = buildExecutiveFromInternal(internal, facilityStatus)

  const shiftBits: string[] = []
  shiftBits.push(`${ho.overallShiftStatus} per auto handover aggregator`)
  if (ho.pendingTasks.length) shiftBits.push(`${ho.pendingTasks.length} scripted follow-up cues outstanding`)
  const shiftHandoverStatus = [...new Set(shiftBits)].join('; ').slice(0, 280)

  const riskHighlights = buildRiskHighlights(cc, missedTurn)
  if (!riskHighlights.length && cc.summary.highRiskPatients > 0) {
    riskHighlights.push(
      `${cc.summary.highRiskPatients} resident${cc.summary.highRiskPatients === 1 ? '' : 's'} remain on amplified observation lists.`,
    )
  }

  const staffHighlights = buildStaffHighlights(
    staffWorkloadIndex,
    totalOt,
    night.systemStatus,
    topReminderAssignee(),
  )

  const familyCommunicationSummary = familySummaryLines(fq.summary.urgentFamilyUpdates, fq.summary.routineUpdates)

  const managementRecommendations = buildManagementRecommendations(
    facilityStatus,
    keyMetricsPub,
    missedTurn,
    fq.summary.totalPendingCommunications,
    fq.recommendedActions,
    cc.recommendedActions,
    ho.recommendations,
  )

  return {
    reportDate: formatReportDateUtc(asOf),
    facilityStatus,
    executiveSummary,
    shiftHandoverStatus,
    keyMetrics: keyMetricsPub,
    riskHighlights,
    staffHighlights,
    familyCommunicationSummary,
    managementRecommendations,
  }
}
