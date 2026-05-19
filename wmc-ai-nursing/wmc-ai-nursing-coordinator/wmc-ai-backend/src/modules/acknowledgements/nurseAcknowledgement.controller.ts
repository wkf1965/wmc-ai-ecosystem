import type { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { nurseAcknowledgementMemoryStore } from './nurseAcknowledgement.store.js'
import { buildAcknowledgementRecord, acknowledgementStatus } from './nurseAcknowledgement.service.js'
import { nurseAcknowledgementConfirmBodySchema } from './nurseAcknowledgement.validation.js'

function nowIso(): string {
  return new Date().toISOString()
}

export const nurseAcknowledgementController = {
  async confirm(req: Request, res: Response): Promise<void> {
    const body = nurseAcknowledgementConfirmBodySchema.parse(req.body)
    const row = buildAcknowledgementRecord(body, uuid(), nowIso())

    nurseAcknowledgementMemoryStore.append(row)

    res.status(201).json({
      message: 'Acknowledgement recorded successfully',
      record: row,
      status: acknowledgementStatus(body),
    })
  },

  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ acknowledgements: nurseAcknowledgementMemoryStore.list() })
  },
}
