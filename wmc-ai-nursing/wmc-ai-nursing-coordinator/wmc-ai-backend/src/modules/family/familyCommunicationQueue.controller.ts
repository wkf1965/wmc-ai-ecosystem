import type { Request, Response } from 'express'
import { buildFamilyCommunicationQueue } from './familyCommunicationQueue.service.js'

export const familyCommunicationQueueController = {
  async queue(_req: Request, res: Response): Promise<void> {
    const out = await buildFamilyCommunicationQueue()
    res.status(200).json(out)
  },
}
