import type { Request, Response } from 'express'
import { generateMedicationAlerts } from './medicationAlert.service.js'
import { medicationCheckAlertBodySchema } from './medicationAlert.validation.js'

export const medicationAlertController = {
  async checkAlert(req: Request, res: Response): Promise<void> {
    const body = medicationCheckAlertBodySchema.parse(req.body)
    const out = generateMedicationAlerts(body)
    res.status(200).json(out)
  },
}
