import type { Request, Response } from 'express'
import { generateBedExitAlert } from './bedExitAlert.service.js'
import { bedExitAlertBodySchema } from './bedExitAlert.validation.js'

export const bedExitAlertController = {
  async calculate(req: Request, res: Response): Promise<void> {
    const body = bedExitAlertBodySchema.parse(req.body)
    const out = generateBedExitAlert(body)
    res.status(200).json(out)
  },
}
