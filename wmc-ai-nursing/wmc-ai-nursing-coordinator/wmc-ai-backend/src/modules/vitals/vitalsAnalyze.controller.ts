import type { Request, Response } from 'express'
import { analyzeVitals } from './vitalsAnalyze.service.js'
import { vitalsAnalyzeBodySchema } from './vitalsAnalyze.validation.js'

export const vitalsAnalyzeController = {
  async analyze(req: Request, res: Response): Promise<void> {
    const body = vitalsAnalyzeBodySchema.parse(req.body)
    const out = analyzeVitals(body)
    res.status(200).json(out)
  },
}
