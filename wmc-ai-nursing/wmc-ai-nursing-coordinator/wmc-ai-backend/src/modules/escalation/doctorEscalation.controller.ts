import type { Request, Response } from 'express'
import { evaluateDoctorEscalation } from './doctorEscalation.service.js'
import { doctorEscalationBodySchema } from './doctorEscalation.validation.js'

export const doctorEscalationController = {
  async check(req: Request, res: Response): Promise<void> {
    const body = doctorEscalationBodySchema.parse(req.body)
    const out = evaluateDoctorEscalation(body)
    res.status(200).json(out)
  },
}
