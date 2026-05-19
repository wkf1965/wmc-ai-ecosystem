import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { sheetDb } from '../../db/index.js'
import type { Patient } from '../../types/domain.js'

const patientCreateShape = z.object({
  mrn: z.string().optional(),
  fullName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  phone: z.string().optional(),
  medicalSummary: z.string().optional(),
})

/** Accepts frontend-friendly aliases: name→fullName, condition→medicalSummary, age appended to summary */
const patientCreate = z.preprocess(
  (raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const o = raw as Record<string, unknown>
    const fullName = (typeof o.fullName === 'string' && o.fullName.trim()
      ? o.fullName
      : typeof o.name === 'string'
        ? o.name.trim()
        : '') as string
    const baseSummary =
      typeof o.medicalSummary === 'string'
        ? o.medicalSummary.trim()
        : typeof o.condition === 'string'
          ? o.condition.trim()
          : ''
    const agePart = typeof o.age === 'number' && Number.isFinite(o.age) ? `Age: ${o.age}` : ''
    const medicalSummary = [baseSummary, agePart].filter(Boolean).join(' — ') || undefined
    return {
      mrn: o.mrn,
      fullName: fullName || undefined,
      dateOfBirth: o.dateOfBirth,
      gender: o.gender,
      phone: o.phone,
      medicalSummary,
    }
  },
  patientCreateShape,
)

const patientUpdate = patientCreateShape.partial()

function now(): string {
  return new Date().toISOString()
}

export const patientService = {
  async list(): Promise<Patient[]> {
    return sheetDb.list<Patient>('patients')
  },

  async get(id: string): Promise<Patient | null> {
    return sheetDb.findById<Patient>('patients', id)
  },

  async create(body: unknown): Promise<Patient> {
    const data = patientCreate.parse(body)
    const ts = now()
    const row: Patient = {
      id: uuid(),
      ...data,
      createdAt: ts,
      updatedAt: ts,
    }
    return sheetDb.append('patients', row)
  },

  async update(id: string, body: unknown): Promise<Patient | null> {
    const existing = await sheetDb.findById<Patient>('patients', id)
    if (!existing) return null
    const patch = patientUpdate.parse(body)
    const updated = await sheetDb.update<Patient>('patients', id, {
      ...patch,
      updatedAt: now(),
    } as Partial<Patient>)
    return updated
  },
}
