import type { Request, Response } from 'express'
import { generatePressureUlcerRiskAssessment } from './pressureUlcer.service.js'
import { pressureUlcerBodySchema } from './pressureUlcer.validation.js'

export const pressureUlcerController = {
  async calculate(req: Request, res: Response): Promise<void> {
    const body = pressureUlcerBodySchema.parse(req.body)
    const out = generatePressureUlcerRiskAssessment(body)
    res.status(200).json(out)
  },
}
