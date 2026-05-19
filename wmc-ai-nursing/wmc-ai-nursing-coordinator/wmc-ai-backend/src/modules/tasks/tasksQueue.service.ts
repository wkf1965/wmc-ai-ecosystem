import type { NursingClinicalRecord } from '../nursing/nursing.records.types.js'
import { nursingClinicalRecordsMemoryStore } from '../nursing/nursing.records.store.js'
import { sideTurningMemoryStore } from '../turning/turning.store.js'
import { woundAssessmentMemoryStore } from '../wound/woundAssessment.store.js'
import { analyzeVitals } from '../vitals/vitalsAnalyze.service.js'
import { evaluateDoctorEscalation } from '../escalation/doctorEscalation.service.js'
import { generateFallRiskAssessment } from '../risk/fallScore.service.js'
import { generatePressureUlcerRiskAssessment } from '../risk/pressureUlcer.service.js'
import type { NurseQueuedTask, NurseTaskPriority, TasksQueueResponse } from './tasks.types.js'

/** Returned when coordinator in-memory buffers are cold — wording matches onboarding demo */
export const MOCK_TASK_QUEUE: TasksQueueResponse = {
  tasks: [
    {
      priority: 'High',
      patientName: 'Ah Chong',
      task: 'Complete side turning',
      dueTime: '12:00',
      source: 'Pressure Ulcer Risk',
    },
    {
      priority: 'Urgent',
      patientName: 'Ah Chong',
      task: 'Notify doctor about low oxygen',
      dueTime: 'Immediate',
      source: 'Doctor Escalation',
    },
    {
      priority: 'Medium',
      patientName: 'Test Patient',
      task: 'Upload wound photo',
      dueTime: 'This shift',
      source: 'Wound Monitoring',
    },
  ],
  summary: {
    urgentTasks: 1,
    highPriorityTasks: 1,
    mediumPriorityTasks: 1,
    totalTasks: 3,
  },
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
    incontinence: /\bincontin/i.test(rec.notes),
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

function medNotesCue(text: string): boolean {
  const n = text.trim().toLowerCase()
  return /\b(medication|medicine|tablet|pill|mar)\b/i.test(n)
}

const PRIORITY_ORDER: Record<NurseTaskPriority, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
}

function sortTasks(rows: NurseQueuedTask[]): NurseQueuedTask[] {
  return [...rows].sort((a, b) => {
    const dp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (dp !== 0) return dp
    return a.patientName.localeCompare(b.patientName)
  })
}

function doctorEscalationTask(
  patientName: string,
  esc: ReturnType<typeof evaluateDoctorEscalation>,
): NurseQueuedTask | null {
  if (!esc.escalationRequired) return null
  const rx = esc.reasons
  let task = 'Notify doctor — clinical escalation review'
  if (rx.includes('Low oxygen')) task = 'Notify doctor about low oxygen'
  else if (rx.includes('Very high blood pressure') || rx.includes('Severely elevated blood pressure'))
    task = 'Notify doctor about blood pressure concerns'
  else if (rx.includes('High fever') || rx.includes('Fever')) task = 'Notify doctor about fever'
  else if (rx.includes('Possible wound infection')) task = 'Notify doctor about wound concerns'

  let priority: NurseTaskPriority = 'Medium'
  let dueTime = 'Within 1 hour'

  if (esc.priority === 'Urgent') {
    priority = 'Urgent'
    dueTime = 'Immediate'
  } else if (esc.priority === 'High') {
    priority = 'High'
    dueTime = 'Within 30 minutes'
  } else if (esc.priority === 'Medium') {
    priority = 'Medium'
    dueTime = 'Within 2 hours'
  } else {
    priority = 'Low'
    dueTime = 'Today'
    task = 'Review escalation flags with senior nurse'
  }

  return { priority, patientName, task, dueTime, source: 'Doctor Escalation' }
}

/** Rule-based queue from in-memory coordinators + deterministic engines */
export function buildTasksQueue(): TasksQueueResponse {
  const nursingRows = nursingClinicalRecordsMemoryStore.list()
  const turningRows = sideTurningMemoryStore.list()
  const woundRows = woundAssessmentMemoryStore.list()

  if (nursingRows.length === 0 && turningRows.length === 0 && woundRows.length === 0) {
    return structuredClone(MOCK_TASK_QUEUE)
  }

  const latestNursing = latestByPatientName(nursingRows)
  const latestWounds = latestByPatientName(woundRows)
  const latestTurning = latestByPatientName(turningRows)

  const tasks: NurseQueuedTask[] = []
  const flaggedTurningCue = new Set<string>()

  for (const [patientName, rec] of latestNursing) {
    const esc = evaluateDoctorEscalation(escalationBody(rec))
    const docTask = doctorEscalationTask(patientName, esc)
    if (docTask) tasks.push(docTask)

    const vit = analyzeVitals(vitalBody(rec))
    if (vit.alertLevel === 'High') {
      tasks.push({
        priority: 'High',
        patientName,
        task: 'Repeat vital signs and follow high-risk escalation protocol',
        dueTime: 'Within 15 minutes',
        source: 'Vital Signs',
      })
    } else if (vit.alertLevel === 'Medium') {
      tasks.push({
        priority: 'Medium',
        patientName,
        task: 'Repeat vital signs — trend observation',
        dueTime: 'Within 45 minutes',
        source: 'Vital Signs',
      })
    }

    const puBody = syntheticPressureBody(rec)
    const pu = generatePressureUlcerRiskAssessment(puBody)
    const turningHint = latestTurning.get(patientName)
    const dueTurn =
      turningHint?.nextTurningTime?.trim() && /\d/.test(turningHint.nextTurningTime)
        ? turningHint.nextTurningTime.trim()
        : 'Within 60 minutes'

    const pendingSideText = /\bpending\b|\bdue\b|\bnot\s+completed\b/i.test(rec.sideTurning)
    const needsTurnCue =
      pu.riskLevel === 'High' || (pu.riskLevel === 'Moderate' && !puBody.sideTurningCompleted) || pendingSideText

    if (needsTurnCue) {
      flaggedTurningCue.add(patientName)
      tasks.push({
        priority: pu.riskLevel === 'High' || pendingSideText ? 'High' : 'Medium',
        patientName,
        task: 'Complete side turning',
        dueTime: dueTurn,
        source: 'Pressure Ulcer Risk',
      })
    }

    const fall = generateFallRiskAssessment(syntheticFallBody(rec))
    if (fall.riskLevel === 'High') {
      tasks.push({
        priority: 'High',
        patientName,
        task: 'Maintain fall precautions — high fall risk noted',
        dueTime: 'This shift',
        source: 'Fall Risk',
      })
    } else if (fall.riskLevel === 'Moderate') {
      tasks.push({
        priority: 'Medium',
        patientName,
        task: 'Reinforce mobility safety — moderate fall risk',
        dueTime: 'This shift',
        source: 'Fall Risk',
      })
    }

    if (medNotesCue(rec.notes)) {
      tasks.push({
        priority: 'Medium',
        patientName,
        task: 'Review MAR — medication clarification or follow-up',
        dueTime: 'This shift',
        source: 'Medication Alerts',
      })
    }
  }

  for (const [patientName, w] of latestWounds) {
    if (!w.photoUploaded) {
      tasks.push({
        priority: w.infectionRisk === 'High' ? 'High' : 'Medium',
        patientName,
        task: 'Upload wound photo',
        dueTime: w.infectionRisk === 'High' ? 'Within 30 minutes' : 'This shift',
        source: 'Wound Monitoring',
      })
    }
    if (w.infectionRisk === 'High') {
      tasks.push({
        priority: 'High',
        patientName,
        task: 'Prioritise medical review — elevated wound infection concern',
        dueTime: 'Within 45 minutes',
        source: 'Wound Monitoring',
      })
    }
  }

  for (const [patientName, t] of latestTurning) {
    if (t.photoRequired && !t.photoUploaded) {
      tasks.push({
        priority: 'Medium',
        patientName,
        task: 'Upload side turning photograph where required',
        dueTime: 'This shift',
        source: 'Side Turning Tracking',
      })
    }
    if (!flaggedTurningCue.has(patientName)) {
      tasks.push({
        priority: 'Low',
        patientName,
        task: `Perform scheduled side turning — due by ${t.nextTurningTime.trim()}`,
        dueTime: t.nextTurningTime.trim(),
        source: 'Side Turning Tracking',
      })
    }
  }

  const sorted = sortTasks(tasks)

  const urgentTasks = sorted.filter((t) => t.priority === 'Urgent').length
  const highPriorityTasks = sorted.filter((t) => t.priority === 'High').length
  const mediumPriorityTasks = sorted.filter((t) => t.priority === 'Medium').length

  return {
    tasks: sorted,
    summary: {
      urgentTasks,
      highPriorityTasks,
      mediumPriorityTasks,
      totalTasks: sorted.length,
    },
  }
}
