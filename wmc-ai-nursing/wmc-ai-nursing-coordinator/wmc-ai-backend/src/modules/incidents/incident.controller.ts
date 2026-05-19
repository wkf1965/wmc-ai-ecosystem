import type { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { incidentReportsMemoryStore } from './incident.store.js'
import { buildIncidentReportRecord } from './incident.service.js'
import { incidentReportBodySchema } from './incident.validation.js'

function nowIso(): string {
  return new Date().toISOString()
}

export const incidentController = {
  async create(req: Request, res: Response): Promise<void> {
    const body = incidentReportBodySchema.parse(req.body)

    const row = buildIncidentReportRecord(body, uuid(), nowIso(), req.auth?.sub)
    incidentReportsMemoryStore.append(row)

    res.status(201).json({
      message: 'Incident report created successfully',
      incidentSeverity: row.incidentSeverity,
      aiSummary: row.aiSummary,
      recommendedActions: row.recommendedActions,
      report: row,
    })
  },

  async list(_req: Request, res: Response): Promise<void> {
    res.json({ reports: incidentReportsMemoryStore.list() })
  },
}
