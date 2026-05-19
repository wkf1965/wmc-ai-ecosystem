import type { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { addHoursToClockHm, photoPendingAlert } from './turning.service.js'
import type { SideTurningRecord } from './turning.types.js'
import { sideTurningMemoryStore } from './turning.store.js'
import { sideTurningCreateSchema } from './turning.validation.js'

function nowIso(): string {
  return new Date().toISOString()
}

export const turningController = {
  async create(req: Request, res: Response): Promise<void> {
    const body = sideTurningCreateSchema.parse(req.body)
    const nextTurningTime = addHoursToClockHm(body.turningTime, 2)

    const row: SideTurningRecord = {
      id: uuid(),
      patientId: body.patientId,
      patientName: body.patientName,
      nurseName: body.nurseName,
      turningTime: body.turningTime.trim(),
      turningPosition: body.turningPosition,
      skinCondition: body.skinCondition,
      photoRequired: body.photoRequired,
      photoUploaded: body.photoUploaded,
      notes: body.notes ?? '',
      nextTurningTime,
      createdAt: nowIso(),
      ...(req.auth?.sub ? { recordedByUserId: req.auth.sub } : {}),
    }

    sideTurningMemoryStore.append(row)

    const alert = photoPendingAlert(body.photoRequired, body.photoUploaded)

    const out: Record<string, unknown> = {
      message: 'Side turning record created successfully',
      record: row,
    }
    if (alert !== null) out.alert = alert
    out.nextTurningTime = nextTurningTime
    res.status(201).json(out)
  },

  async list(_req: Request, res: Response): Promise<void> {
    res.json({ records: sideTurningMemoryStore.list() })
  },
}
