import type { Request, Response } from 'express'
import { generateEmergencyResponse } from './emergencyRespond.service.js'
import { emergencyRespondBodySchema } from './emergencyRespond.validation.js'

export const emergencyRespondController = {
  async respond(req: Request, res: Response): Promise<void> {
    const body = emergencyRespondBodySchema.parse(req.body)
    const out = generateEmergencyResponse(body)
    res.status(200).json(out)
  },
}
