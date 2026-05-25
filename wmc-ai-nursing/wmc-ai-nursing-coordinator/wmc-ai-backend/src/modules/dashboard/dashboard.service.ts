import type { Patient } from '../../types/domain.js'
import type { NursingClinicalRecord } from '../nursing/nursing.records.types.js'
import { nursingClinicalRecordsMemoryStore } from '../nursing/nursing.records.store.js'
import { sideTurningMemoryStore } from '../turning/turning.store.js'
import type { SideTurningRecord } from '../turning/turning.types.js'
import { woundAssessmentMemoryStore } from '../wound/woundAssessment.store.js'
import type { WoundAssessmentRecord } from '../wound/woundAssessment.types.js'
import { patientService } from '../patients/patients.service.js'
import { analyzeVitals } from '../vitals/vitalsAnalyze.service.js'
import { evaluateDoctorEscalation } from '../escalation/doctorEscalation.service.js'
import { generateFallRiskAssessment } from '../risk/fallScore.service.js'
import { generatePressureUlcerRiskAssessment } from '../risk/pressureUlcer.service.js'
import { nursingService } from '../nursing/nursing.service.js'
import { nurseShiftOtMemoryStore } from '../nurseShift/nurseShift.store.js'
import type {
  DashboardAlerts,
  DashboardOtSummary,
  DashboardResponse,
  DashboardSummaryResponse,
} from './dashboard.types.js'

export const MOCK_DASHBOARD_SUMMARY: DashboardSummaryResponse = {
  totalPatients: 3,
  highRiskPatients: ['Ah Chong'],
  pendingTasks: [
    'Side turning pending for Ah Chong',
    'Wound photo missing for Ah Chong',
    'Medication review needed',
  ],
  alerts: {
    fallRisk: 1,
    pressureUlcerRisk: 1,
    vitalAlerts: 1,
    woundAlerts: 1,
    medicationAlerts: 1,
    doctorEscalations: 1,
  },
  shiftStatus: 'Attention Required',
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

function collectPatientNames(
  patients: Patient[],
  nursing: NursingClinicalRecord[],
  turning: SideTurningRecord[],
  wounds: WoundAssessmentRecord[],
): Set<string> {
  const names = new Set<string>()
  for (const p of patients) {
    const n = p.fullName.trim()
    if (n) names.add(n)
  }
  for (const r of nursing) names.add(r.patientName.trim())
  for (const r of turning) names.add(r.patientName.trim())
  for (const r of wounds) names.add(r.patientName.trim())
  return names
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

function shiftFromSignals(summary: DashboardSummaryResponse): 'Stable' | 'Attention Required' {
  if (summary.highRiskPatients.length > 0) return 'Attention Required'
  if (summary.pendingTasks.length > 0) return 'Attention Required'
  const alertSum =
    summary.alerts.fallRisk +
    summary.alerts.pressureUlcerRisk +
    summary.alerts.vitalAlerts +
    summary.alerts.woundAlerts +
    summary.alerts.medicationAlerts +
    summary.alerts.doctorEscalations
  if (alertSum >= 2) return 'Attention Required'
  return 'Stable'
}

export async function buildDashboardSummary(): Promise<DashboardSummaryResponse> {
  const nursingRows = nursingClinicalRecordsMemoryStore.list()
  const turningRows = sideTurningMemoryStore.list()
  const woundRows = woundAssessmentMemoryStore.list()

  const memoryEmpty =
    nursingRows.length === 0 && turningRows.length === 0 && woundRows.length === 0

  if (memoryEmpty) {
    return { ...MOCK_DASHBOARD_SUMMARY }
  }

  const patients = await patientService.list()

  const names = collectPatientNames(patients, nursingRows, turningRows, woundRows)

  const latestNursing = latestByPatientName(nursingRows)
  const latestWounds = latestByPatientName(woundRows)
  const latestTurning = latestByPatientName(turningRows)

  const totalPatients = Math.max(names.size, patients.length > 0 ? patients.length : 0)

  const highRiskSet = new Set<string>()
  let fallRisk = 0
  let pressureUlcerRisk = 0
  let vitalAlerts = 0
  let woundAlerts = 0
  let medicationAlerts = 0
  let doctorEscalations = 0

  const pendingTasks: string[] = []

  for (const [patientName, rec] of latestNursing) {
    const vit = analyzeVitals(vitalBody(rec))
    if (vit.alertLevel === 'High') {
      vitalAlerts += 1
      highRiskSet.add(patientName)
    }

    const esc = evaluateDoctorEscalation(escalationBody(rec))
    if (esc.priority === 'Urgent' || esc.priority === 'High') {
      doctorEscalations += 1
      highRiskSet.add(patientName)
    }

    const fall = generateFallRiskAssessment(syntheticFallBody(rec))
    if (fall.riskLevel === 'High') {
      fallRisk += 1
      highRiskSet.add(patientName)
    }

    const pu = generatePressureUlcerRiskAssessment(syntheticPressureBody(rec))
    if (pu.riskLevel === 'High') {
      pressureUlcerRisk += 1
      highRiskSet.add(patientName)
    }

    if (medNotesCue(rec.notes)) {
      medicationAlerts += 1
    }

    if (/\bpending\b|\bdue\b|\bnot\s+completed\b/i.test(rec.sideTurning)) {
      pendingTasks.push(`Side turning pending for ${patientName}`)
    }
  }

  if (medicationAlerts > 0) {
    pendingTasks.push('Medication review needed')
  }

  for (const [patientName, w] of latestWounds) {
    if (w.infectionRisk !== 'Low') {
      woundAlerts += 1
      highRiskSet.add(patientName)
    }
    if (!w.photoUploaded) {
      pendingTasks.push(`Wound photo missing for ${patientName}`)
    }
  }

  for (const [patientName, t] of latestTurning) {
    if (t.photoRequired && !t.photoUploaded) {
      pendingTasks.push(`Turning photo pending for ${patientName}`)
    }
  }

  const highRiskPatients = [...highRiskSet].sort((a, b) => a.localeCompare(b))

  const dedupedTasks = [...new Set(pendingTasks)]

  const alerts: DashboardAlerts = {
    fallRisk,
    pressureUlcerRisk,
    vitalAlerts,
    woundAlerts,
    medicationAlerts,
    doctorEscalations,
  }

  const summary: DashboardSummaryResponse = {
    totalPatients,
    highRiskPatients,
    pendingTasks: dedupedTasks,
    alerts,
    shiftStatus: 'Stable',
  }

  summary.shiftStatus = shiftFromSignals(summary)
  return summary
}

function buildOtSummary(): DashboardOtSummary {
  const records = nurseShiftOtMemoryStore.list()
  const totalOvertimeHours = records.reduce((sum, row) => sum + (row.overtimeHours ?? 0), 0)
  return {
    recordCount: records.length,
    totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
    pendingApprovalCount: records.filter((row) => row.overtimeHours > 0).length,
  }
}

/** Full dashboard payload for GET /dashboard — nursing, side turning, OT, alerts + summary rollup. */
export async function buildDashboard(): Promise<DashboardResponse> {
  const [summary, alerts] = await Promise.all([buildDashboardSummary(), nursingService.listAlerts()])
  const nursingRecords = nursingClinicalRecordsMemoryStore.list()
  const sideTurning = sideTurningMemoryStore.list()

  return {
    summary,
    nursingRecords,
    sideTurning,
    ot: buildOtSummary(),
    alerts,
    fetchedAt: new Date().toISOString(),
  }
}
