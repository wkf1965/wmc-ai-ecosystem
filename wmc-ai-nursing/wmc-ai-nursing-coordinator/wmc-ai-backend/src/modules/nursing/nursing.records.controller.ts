import type { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import type { NursingClinicalRecord } from './nursing.records.types.js'
import { nursingRecordCreateSchema } from './nursing.records.validation.js'
import { nursingClinicalRecordsMemoryStore } from './nursing.records.store.js'

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeCreatedAt(input?: string): string {
  if (!input) return nowIso()
  const t = Date.parse(input)
  if (!Number.isNaN(t)) return new Date(t).toISOString()
  return nowIso()
}

export const nursingRecordsController = {
  async create(req: Request, res: Response): Promise<void> {
    const body = nursingRecordCreateSchema.parse(req.body)
    const createdAt = normalizeCreatedAt(body.createdAt ?? undefined)

    const row: NursingClinicalRecord = {
      id: uuid(),
      patientId: body.patientId,
      patientName: body.patientName,
      nurseName: body.nurseName,
      bloodPressure: body.bloodPressure,
      pulse: body.pulse,
      temperature: body.temperature,
      oxygen: body.oxygen,
      painScore: body.painScore,
      appetite: body.appetite,
      mood: body.mood,
      mobility: body.mobility,
      sideTurning: body.sideTurning,
      woundCondition: body.woundCondition,
      notes: body.notes,
      createdAt,
      ...(req.auth?.sub ? { recordedByUserId: req.auth.sub } : {}),
    }

    nursingClinicalRecordsMemoryStore.append(row)
    res.status(201).json(row)
  },

  async list(_req: Request, res: Response): Promise<void> {
    res.json({ records: nursingClinicalRecordsMemoryStore.list() })
  },
}
