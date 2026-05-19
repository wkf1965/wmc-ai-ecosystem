import type { Request, Response } from 'express'
import { generateWanderingRiskAssessment } from './wanderingRisk.service.js'
import { wanderingRiskBodySchema } from './wanderingRisk.validation.js'

export const wanderingRiskController = {
  async calculate(req: Request, res: Response): Promise<void> {
    const body = wanderingRiskBodySchema.parse(req.body)
    const out = generateWanderingRiskAssessment(body)
    res.status(200).json(out)
  },
}
