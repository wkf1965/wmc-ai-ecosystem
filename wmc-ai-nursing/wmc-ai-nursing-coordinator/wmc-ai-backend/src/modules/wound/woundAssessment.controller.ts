import type { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { woundAssessmentMemoryStore } from './woundAssessment.store.js'
import { buildWoundAssessmentRecord } from './woundAssessment.service.js'
import { woundAssessmentBodySchema } from './woundAssessment.validation.js'

function nowIso(): string {
  return new Date().toISOString()
}

export const woundAssessmentController = {
  async create(req: Request, res: Response): Promise<void> {
    const body = woundAssessmentBodySchema.parse(req.body)

    const row = buildWoundAssessmentRecord(
      body,
      uuid(),
      nowIso(),
      req.auth?.sub,
    )

    woundAssessmentMemoryStore.append(row)

    res.status(201).json({
      message: 'Wound assessment created successfully',
      assessment: row,
      infectionRisk: row.infectionRisk,
      alerts: row.alerts,
      recommendations: row.recommendations,
    })
  },

  async list(_req: Request, res: Response): Promise<void> {
    res.json({ assessments: woundAssessmentMemoryStore.list() })
  },
}
