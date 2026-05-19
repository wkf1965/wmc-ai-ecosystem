import { nursingAnnouncementMemoryStore } from '../announcements/nursingAnnouncement.store.js'
import { evaluateDoctorEscalation } from '../escalation/doctorEscalation.service.js'
import { generateEmergencyResponse } from '../emergency/emergencyRespond.service.js'
import type { EmergencyRespondBody } from '../emergency/emergencyRespond.validation.js'
import { incidentReportsMemoryStore } from '../incidents/incident.store.js'
import type { NursingClinicalRecord } from '../nursing/nursing.records.types.js'
import { nursingClinicalRecordsMemoryStore } from '../nursing/nursing.records.store.js'
import { patientService } from '../patients/patients.service.js'
import type { RehabSession } from '../../types/domain.js'
import { rehabService } from '../rehabilitation/rehab.service.js'
import { nurseReminderMemoryStore } from '../reminders/nurseReminder.store.js'
import { generateFallRiskAssessment } from '../risk/fallScore.service.js'
import { generatePressureUlcerRiskAssessment } from '../risk/pressureUlcer.service.js'
import { sideTurningMemoryStore } from '../turning/turning.store.js'
import { analyzeVitals } from '../vitals/vitalsAnalyze.service.js'
import { woundAssessmentMemoryStore } from '../wound/woundAssessment.store.js'
import type {
  FamilyCommunicationPriority,
  FamilyCommunicationQueueItem,
  FamilyCommunicationQueueResponse,
} from './familyCommunicationQueue.types.js'

const PRIORITY_RANK: Record<FamilyCommunicationPriority, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
}

/** Cold coordinators + satellites — onboarding demo payload */
export const MOCK_FAMILY_COMMUNICATION_QUEUE: FamilyCommunicationQueueResponse = {
  queue: [
    {
      patientName: 'Ah Chong',
      priority: 'Urgent',
      reason: 'Low oxygen and doctor escalation',
      recommendedMessage:
        'Please update family immediately regarding oxygen monitoring and doctor review.',
    },
    {
      patientName: 'Test Patient',
      priority: 'Medium',
      reason: 'Good rehab improvement',
      recommendedMessage: 'Provide positive progress update to family.',
    },
  ],
  summary: {
    urgentFamilyUpdates: 1,
    routineUpdates: 1,
    totalPendingCommunications: 2,
  },
  recommendedActions: [
    'Prioritize urgent medical notifications',
    'Send routine updates before shift end',
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

export function isFamilyCommunicationQueueCold(): boolean {
  return (
    nursingClinicalRecordsMemoryStore.list().length === 0 &&
    sideTurningMemoryStore.list().length === 0 &&
    woundAssessmentMemoryStore.list().length === 0 &&
    incidentReportsMemoryStore.list().length === 0 &&
    nursingAnnouncementMemoryStore.list().length === 0
  )
}

function pickHigher(a: FamilyCommunicationPriority, b: FamilyCommunicationPriority): FamilyCommunicationPriority {
  return PRIORITY_RANK[a] <= PRIORITY_RANK[b] ? a : b
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

function isAgitated(rec: NursingClinicalRecord): boolean {
  return /\b(agitat|combative|distress|anxious|restless|calling out)\b/i.test(
    `${rec.mood} ${rec.notes ?? ''}`,
  )
}

function mapEscalationPri(p: ReturnType<typeof evaluateDoctorEscalation>): FamilyCommunicationPriority | null {
  if (!p.escalationRequired) return null
  if (p.priority === 'Urgent') return 'Urgent'
  if (p.priority === 'High') return 'High'
  if (p.priority === 'Medium') return 'Medium'
  return 'Low'
}

function mapEmergencyPri(level: ReturnType<typeof generateEmergencyResponse>['emergencyLevel']): FamilyCommunicationPriority | null {
  if (level === 'Critical') return 'Urgent'
  if (level === 'High') return 'High'
  if (level === 'Medium') return 'Medium'
  return null
}

function mapIncidentPri(sev: 'Low' | 'Medium' | 'High' | 'Critical'): FamilyCommunicationPriority {
  if (sev === 'Critical') return 'Urgent'
  if (sev === 'High') return 'High'
  if (sev === 'Medium') return 'Medium'
  return 'Low'
}

function mapVitalsPri(vit: ReturnType<typeof analyzeVitals>, rec: NursingClinicalRecord): FamilyCommunicationPriority | null {
  if (vit.alertLevel === 'High') {
    const lowOx = vit.abnormalSigns.includes('Low oxygen') || rec.oxygen < 93
    if (lowOx) return 'Urgent'
    return 'High'
  }
  if (vit.alertLevel === 'Medium') return 'Medium'
  return null
}

function rehabIndicatesProgress(rows: RehabSession[]): boolean {
  if (rows.length < 1) return false
  const sorted = [...rows].sort((a, b) => new Date(b.sessionAt).getTime() - new Date(a.sessionAt).getTime())
  const latest = sorted[0]!
  const text =
    `${latest.mobilityNotes ?? ''} ${latest.therapistNotes ?? ''} ${latest.aiProgressSummary ?? ''}`.toLowerCase()
  if (
    /\b(regress|deterior|worse than|pain (?:score )?(?:9|10)|acute decline)\b/i.test(text)
  )
    return false
  const positiveCue = /\b(progress|improv|better|increased distance|walking more|mileston|tolerat|coped well)\b/i.test(
    text,
  )
  const lowPain = typeof latest.painScore === 'number' && latest.painScore <= 4
  const prevPain = sorted[1]?.painScore
  const painDropped =
    typeof latest.painScore === 'number' &&
    typeof prevPain === 'number' &&
    prevPain > latest.painScore + 1
  return (positiveCue && (lowPain || painDropped || latest.painScore === undefined)) || painDropped
}

function summarizeReasonBits(bits: Set<string>): string {
  if (!bits.size) return ''
  const arr = [...bits]
  const hasOx = arr.some((x) => x.toLowerCase().includes('low oxygen'))
  const hasDoc = arr.some((x) => /doctor escalation/i.test(x))
  if (hasOx && hasDoc) return 'Low oxygen and doctor escalation'

  const normalized = [...new Set(arr)].map((x) =>
    /^doctor escalation initiated$/i.test(x) ? 'doctor escalation' : x,
  )
  normalized.sort((a, b) => a.localeCompare(b))
  const uniq = [...new Set(normalized)]
  if (uniq.length === 1) return uniq[0]!
  if (uniq.length === 2) return `${uniq[0]} and ${uniq[1]}`
  if (uniq.length <= 4) return `${uniq.slice(0, -1).join(', ')}, and ${uniq[uniq.length - 1]}`
  return `${uniq.slice(0, 3).join(', ')}, +${uniq.length - 3} more`
}

function composeRecommendedMessage(maxPri: FamilyCommunicationPriority, bits: Set<string>): string {
  const blob = [...bits].join(' | ').toLowerCase()

  if (
    (/low oxygen/.test(blob) && /doctor escalation/.test(blob)) ||
    summarizeReasonBits(bits) === 'Low oxygen and doctor escalation'
  )
    return 'Please update family immediately regarding oxygen monitoring and doctor review.'

  if (/good rehab|rehab improvement/i.test(blob) && maxPri === 'Medium')
    return 'Provide positive progress update to family.'

  if (maxPri === 'Urgent' || /critical emergency|critical.*incident/i.test(blob)) {
    return 'Reach family urgently with factual updates about today’s clinical change and supervising clinician involvement.'
  }

  if (/wound deterioration|elevated wound/.test(blob)) {
    return 'Explain wound changes in plain language, next dressing plan, and when to expect another update.'
  }

  if (/agitat|emotion|behaviour/i.test(blob)) {
    return 'Offer reassurance describing emotional support interventions and visitation guidance aligned with ward policy.'
  }

  if (/fall risk|pressure injury|elevated pressure/i.test(blob)) {
    return 'Summarise preventative measures and observation cadence families value during extended stays.'
  }

  if (/vitals/i.test(blob) || maxPri === 'High') {
    return 'Notify family promptly with recent vital trends and reassurance on monitoring intervals.'
  }

  return 'Share a succinct status confirmation and escalation contact for overnight questions.'
}

function buildRecommendedActions(s: FamilyCommunicationQueueResponse['summary']): string[] {
  const rx: string[] = []
  if (s.urgentFamilyUpdates > 0) rx.push('Prioritize urgent medical notifications')
  if (s.routineUpdates > 0) rx.push('Send routine updates before shift end')
  if (!rx.length) rx.push('No outstanding family-queue items on this aggregator snapshot.')
  return [...new Set(rx)]
}

interface PatientAccum {
  maxPri: FamilyCommunicationPriority
  reasons: Set<string>
}

/** Rule-based rollup for family liaison (LLM-ready copy slots). */
export async function buildFamilyCommunicationQueue(): Promise<FamilyCommunicationQueueResponse> {
  if (isFamilyCommunicationQueueCold()) {
    return structuredClone(MOCK_FAMILY_COMMUNICATION_QUEUE)
  }

  const byPatient = new Map<string, PatientAccum>()
  function touch(name: string, pri: FamilyCommunicationPriority | null, reason: string | null) {
    const key = name.trim()
    if (!key) return
    let row = byPatient.get(key)
    if (!row) {
      row = { maxPri: 'Low', reasons: new Set<string>() }
      byPatient.set(key, row)
    }
    if (pri) row.maxPri = pickHigher(row.maxPri, pri)
    if (reason) row.reasons.add(reason)
  }

  const patients = await patientService.list()
  const idToName = new Map(patients.map((p) => [p.id.trim(), p.fullName.trim()] as const))

  const latestNursing = latestByPatientName(nursingClinicalRecordsMemoryStore.list())

  for (const [patientName, rec] of latestNursing) {
    const vit = analyzeVitals(vitalBody(rec))
    const vp = mapVitalsPri(vit, rec)
    if (vp) touch(patientName, vp, 'Vital-sign alerts')

    const esc = evaluateDoctorEscalation(escalationBody(rec))
    if (esc.escalationRequired) {
      const ep = mapEscalationPri(esc)
      if (ep) touch(patientName, ep, 'Doctor escalation initiated')
    }

    const em = generateEmergencyResponse(nursingRecordToEmergencyBody(rec))
    const emP = mapEmergencyPri(em.emergencyLevel)
    if (emP) touch(patientName, emP, `Emergency-pattern (${em.emergencyLevel})`)

    if ((vit.alertLevel === 'High' || vit.alertLevel === 'Medium') && vit.abnormalSigns.includes('Low oxygen')) {
      touch(patientName, 'Urgent', 'Low oxygen')
    } else if (rec.oxygen < 93 && !vit.abnormalSigns.includes('Low oxygen')) touch(patientName, 'High', 'Low oxygen')

    if (rec.temperature >= 38.5) touch(patientName, 'High', 'High fever')
    else if (rec.temperature >= 38.0) touch(patientName, 'Medium', 'Fever')

    const fall = generateFallRiskAssessment(syntheticFallBody(rec))
    if (fall.riskLevel === 'High') touch(patientName, 'High', 'High fall risk')
    else if (fall.riskLevel === 'Moderate') touch(patientName, 'Medium', 'Moderate fall risk')

    const pu = generatePressureUlcerRiskAssessment(syntheticPressureBody(rec))
    if (pu.riskLevel === 'High') touch(patientName, 'High', 'Elevated pressure injury risk')

    if (isAgitated(rec)) touch(patientName, 'Medium', 'Emotional agitation cues')
  }

  const latestWounds = latestByPatientName(woundAssessmentMemoryStore.list())
  for (const [name, w] of latestWounds) {
    if (w.infectionRisk === 'High') touch(name, 'High', 'Wound deterioration')
    else if (w.infectionRisk === 'Medium') touch(name, 'Medium', 'Wound surveillance')
    if (!w.photoUploaded) touch(name, 'Low', 'Pending family-visible documentation cue')
  }

  for (const inc of incidentReportsMemoryStore.list()) {
    const name = inc.patientName.trim()
    if (!name) continue
    touch(name, mapIncidentPri(inc.incidentSeverity), `${inc.incidentType} incident report`)
  }

  const reminderPri: Record<string, FamilyCommunicationPriority> = {
    Urgent: 'Urgent',
    High: 'High',
    Medium: 'Medium',
    Low: 'Low',
  }
  for (const r of nurseReminderMemoryStore.list()) {
    if (r.reminderType === 'Family Update') {
      touch(
        r.patientName,
        reminderPri[r.priority] ?? 'Medium',
        'Pending family notification (scheduled reminder)',
      )
    }
  }

  const sessionsByPid = new Map<string, RehabSession[]>()
  for (const s of await rehabService.list()) {
    const pid = s.patientId.trim()
    if (!pid) continue
    let list = sessionsByPid.get(pid)
    if (!list) {
      list = []
      sessionsByPid.set(pid, list)
    }
    list!.push(s)
  }
  for (const [pid, pidRows] of sessionsByPid) {
    const full = idToName.get(pid)
    if (!full) continue
    if (rehabIndicatesProgress(pidRows)) touch(full, 'Medium', 'Good rehab improvement')
  }

  const queue: FamilyCommunicationQueueItem[] = [...byPatient.entries()]
    .map(([patientName, acc]) => {
      const pri = acc.maxPri
      const reasons = summarizeReasonBits(acc.reasons)
      const msg = composeRecommendedMessage(pri, acc.reasons)
      const item: FamilyCommunicationQueueItem = {
        patientName,
        priority: pri,
        reason: reasons || 'Operational update recommended',
        recommendedMessage: msg,
      }
      return item
    })
    .filter((q) => Boolean(q.reason.trim()))

  queue.sort((a, b) => {
    const d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (d !== 0) return d
    return a.patientName.localeCompare(b.patientName)
  })

  let urgentFamilyUpdates = 0
  let routineUpdates = 0
  for (const q of queue) {
    if (q.priority === 'Urgent') urgentFamilyUpdates += 1
    else routineUpdates += 1
  }

  const summary = {
    urgentFamilyUpdates,
    routineUpdates,
    totalPendingCommunications: queue.length,
  }

  return {
    queue,
    summary,
    recommendedActions: buildRecommendedActions(summary),
  }
}
