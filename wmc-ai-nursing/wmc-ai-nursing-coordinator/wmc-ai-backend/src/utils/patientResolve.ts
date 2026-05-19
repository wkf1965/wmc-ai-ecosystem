import { ZodError } from 'zod'
import { sheetDb } from '../db/index.js'
import type { Patient } from '../types/domain.js'

export type PatientIdInput = {
  patientId?: string | undefined
  patientName?: string | undefined
}

function patientNotFoundError(name: string): never {
  throw new ZodError([
    {
      code: 'custom',
      message: `No patient found matching "${name.trim()}"`,
      path: ['patientName'],
    },
  ])
}

/** Resolve UUID from `patientId` or lookup `patientName` in `patients` tab (exact then partial). */
export async function resolvePatientIdFromBody(input: PatientIdInput): Promise<string> {
  if (input.patientId) return input.patientId
  const rawName = input.patientName
  if (typeof rawName !== 'string' || !rawName.trim()) {
    throw new ZodError([
      {
        code: 'custom',
        message: 'Provide patientId (UUID) or patientName',
        path: ['patientName'],
      },
    ])
  }
  const needle = rawName.trim().toLowerCase()
  const patients = await sheetDb.list<Patient>('patients')
  const exact = patients.find((p) => p.fullName.trim().toLowerCase() === needle)
  if (exact) return exact.id
  const partial = patients.find((p) => p.fullName.trim().toLowerCase().includes(needle))
  if (partial) return partial.id
  patientNotFoundError(rawName)
}
