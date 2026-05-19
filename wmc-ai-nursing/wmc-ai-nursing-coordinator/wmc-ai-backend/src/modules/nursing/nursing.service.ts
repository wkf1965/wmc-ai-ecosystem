import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { sheetDb } from '../../db/index.js'
import { resolvePatientIdFromBody } from '../../utils/patientResolve.js'
import type {
  DoctorReviewItem,
  MedicationRecord,
  NursingAlert,
  NursingDailyReport,
  VitalSignRecord,
} from '../../types/domain.js'

function now(): string {
  return new Date().toISOString()
}

function parseTemperature(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = parseFloat(raw.replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function parseBloodPressure(raw: unknown): { sys?: number; dia?: number } {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  const m = raw.trim().match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!m) return {}
  const sys = parseInt(m[1], 10)
  const dia = parseInt(m[2], 10)
  if (!Number.isFinite(sys) || !Number.isFinite(dia)) return {}
  return { sys, dia }
}

const dailyReport = z.object({
  patientId: z.string().uuid(),
  shiftDate: z.string(),
  narrative: z.string().min(1),
})

const vitalShape = z.object({
  patientId: z.string().uuid(),
  temperature: z.number().optional(),
  bloodPressureSys: z.number().optional(),
  bloodPressureDia: z.number().optional(),
  heartRate: z.number().optional(),
  spo2: z.number().optional(),
  notes: z.string().optional(),
})

const vital = vitalShape

/** Friendly combined vitals + notes (patientName → lookup patientId; BP string "120/80"; temp string ok) */
const nursingRecordInput = z
  .object({
    patientId: z.string().uuid().optional(),
    patientName: z.string().optional(),
    temperature: z.union([z.number(), z.string()]).optional(),
    bloodPressure: z.string().optional(),
    bloodPressureSys: z.number().optional(),
    bloodPressureDia: z.number().optional(),
    condition: z.string().optional(),
    nurseNote: z.string().optional(),
    notes: z.string().optional(),
    heartRate: z.number().optional(),
    spo2: z.number().optional(),
  })
  .refine((d) => Boolean(d.patientId?.trim()) || Boolean(d.patientName?.trim()), {
    message: 'Provide patientId or patientName',
    path: ['patientName'],
  })

const med = z.object({
  patientId: z.string().uuid(),
  medicationName: z.string().min(1),
  dose: z.string().optional(),
  route: z.string().optional(),
  scheduledAt: z.string().optional(),
  administeredAt: z.string().optional(),
  notes: z.string().optional(),
})

const alert = z.object({
  patientId: z.string().uuid(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string().min(1),
  description: z.string().min(1),
  photoUrlPlaceholder: z.string().optional(),
})

const review = z.object({
  patientId: z.string().uuid(),
  sourceAlertId: z.string().uuid().optional(),
  priority: z.enum(['routine', 'urgent']),
  summary: z.string().min(1),
})

export const nursingService = {
  async listDailyReports(): Promise<NursingDailyReport[]> {
    return sheetDb.list('nursing_daily_reports')
  },

  async createDailyReport(userId: string, body: unknown): Promise<NursingDailyReport> {
    const data = dailyReport.parse(body)
    const row: NursingDailyReport = {
      id: uuid(),
      patientId: data.patientId,
      nurseUserId: userId,
      shiftDate: data.shiftDate,
      narrative: data.narrative,
      createdAt: now(),
    }
    return sheetDb.append('nursing_daily_reports', row)
  },

  async createNursingRecord(userId: string, body: unknown): Promise<VitalSignRecord> {
    const raw = nursingRecordInput.parse(body)
    const patientId = await resolvePatientIdFromBody(raw)

    let bloodPressureSys = raw.bloodPressureSys
    let bloodPressureDia = raw.bloodPressureDia
    const fromBp = parseBloodPressure(raw.bloodPressure)
    if (fromBp.sys !== undefined) bloodPressureSys = fromBp.sys
    if (fromBp.dia !== undefined) bloodPressureDia = fromBp.dia

    const temperature = parseTemperature(raw.temperature)

    const noteParts: string[] = []
    if (raw.condition?.trim()) noteParts.push(`Condition: ${raw.condition.trim()}`)
    if (raw.nurseNote?.trim()) noteParts.push(raw.nurseNote.trim())
    if (raw.notes?.trim()) noteParts.push(raw.notes.trim())
    if (
      typeof raw.bloodPressure === 'string' &&
      raw.bloodPressure.trim() &&
      (bloodPressureSys === undefined || bloodPressureDia === undefined)
    ) {
      noteParts.push(`BP (raw): ${raw.bloodPressure.trim()}`)
    }

    const data = vitalShape.parse({
      patientId,
      temperature,
      bloodPressureSys,
      bloodPressureDia,
      heartRate: raw.heartRate,
      spo2: raw.spo2,
      notes: noteParts.length ? noteParts.join('\n') : undefined,
    })

    const row: VitalSignRecord = {
      id: uuid(),
      patientId: data.patientId,
      recordedByUserId: userId,
      recordedAt: now(),
      temperature: data.temperature,
      bloodPressureSys: data.bloodPressureSys,
      bloodPressureDia: data.bloodPressureDia,
      heartRate: data.heartRate,
      spo2: data.spo2,
      notes: data.notes,
    }
    return sheetDb.append('vital_signs', row)
  },

  async createVital(userId: string, body: unknown): Promise<VitalSignRecord> {
    const data = vital.parse(body)
    const row: VitalSignRecord = {
      id: uuid(),
      patientId: data.patientId,
      recordedByUserId: userId,
      recordedAt: now(),
      temperature: data.temperature,
      bloodPressureSys: data.bloodPressureSys,
      bloodPressureDia: data.bloodPressureDia,
      heartRate: data.heartRate,
      spo2: data.spo2,
      notes: data.notes,
    }
    return sheetDb.append('vital_signs', row)
  },

  async listVitals(): Promise<VitalSignRecord[]> {
    return sheetDb.list('vital_signs')
  },

  async createMedication(userId: string, body: unknown): Promise<MedicationRecord> {
    const data = med.parse(body)
    const row: MedicationRecord = {
      id: uuid(),
      patientId: data.patientId,
      medicationName: data.medicationName,
      dose: data.dose,
      route: data.route,
      scheduledAt: data.scheduledAt,
      administeredAt: data.administeredAt,
      administeredByUserId: data.administeredAt ? userId : undefined,
      notes: data.notes,
    }
    return sheetDb.append('medications', row)
  },

  async listMedications(): Promise<MedicationRecord[]> {
    return sheetDb.list('medications')
  },

  async createAlert(body: unknown): Promise<NursingAlert> {
    const data = alert.parse(body)
    const row: NursingAlert = {
      id: uuid(),
      patientId: data.patientId,
      severity: data.severity,
      category: data.category,
      description: data.description,
      photoUrlPlaceholder: data.photoUrlPlaceholder || undefined,
      createdAt: now(),
    }
    return sheetDb.append('nursing_alerts', row)
  },

  async listAlerts(): Promise<NursingAlert[]> {
    return sheetDb.list('nursing_alerts')
  },

  async createDoctorReview(body: unknown): Promise<DoctorReviewItem> {
    const data = review.parse(body)
    const row: DoctorReviewItem = {
      id: uuid(),
      patientId: data.patientId,
      sourceAlertId: data.sourceAlertId,
      priority: data.priority,
      summary: data.summary,
      status: 'pending',
      createdAt: now(),
    }
    return sheetDb.append('doctor_review_queue', row)
  },

  async listDoctorQueue(): Promise<DoctorReviewItem[]> {
    return sheetDb.list('doctor_review_queue')
  },

  async patchDoctorReview(id: string, status: DoctorReviewItem['status']): Promise<DoctorReviewItem | null> {
    return sheetDb.update<DoctorReviewItem>('doctor_review_queue', id, { status })
  },
}
