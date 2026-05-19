import type { Request, Response } from 'express'
import { buildCommandCenterStatus } from './commandCenter.service.js'

export const commandCenterController = {
  async status(_req: Request, res: Response): Promise<void> {
    const out = await buildCommandCenterStatus()
    res.status(200).json(out)
  },
}
