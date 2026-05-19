import type { Request, Response } from 'express'
import { buildSupervisorEscalationQueue } from './supervisorEscalationQueue.service.js'

export const supervisorEscalationQueueController = {
  async get(_req: Request, res: Response): Promise<void> {
    const out = buildSupervisorEscalationQueue()
    res.status(200).json(out)
  },
}
