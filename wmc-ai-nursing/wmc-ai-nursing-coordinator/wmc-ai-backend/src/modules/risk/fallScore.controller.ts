import type { Request, Response } from 'express'
import { generateFallRiskAssessment } from './fallScore.service.js'
import { fallScoreBodySchema } from './fallScore.validation.js'

export const fallScoreController = {
  async calculate(req: Request, res: Response): Promise<void> {
    const body = fallScoreBodySchema.parse(req.body)
    const out = generateFallRiskAssessment(body)
    res.status(200).json(out)
  },
}
