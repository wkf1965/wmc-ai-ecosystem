import type { Request, Response } from 'express'
import { aiService } from './ai.service.js'
import { generateNursingRecordSummary } from './ai.summary.service.js'
import { nursingStructuredSummarySchema } from './ai.summary.validation.js'

export const aiSummaryController = {
  /**
   * `POST /ai/summary` — structured nursing observation → `{ summary, riskLevel, nextAction }`;
   * otherwise falls back to legacy `{ patientId?|patientName?, notes }` stub that persists `ai_results`.
   */
  async post(req: Request, res: Response): Promise<void> {
    const structured = nursingStructuredSummarySchema.safeParse(req.body)
    if (structured.success) {
      const out = generateNursingRecordSummary(structured.data)
      res.status(200).json(out)
      return
    }
    const out = await aiService.clinicalNotesSummary(req.body)
    res.status(201).json(out)
  },
}
