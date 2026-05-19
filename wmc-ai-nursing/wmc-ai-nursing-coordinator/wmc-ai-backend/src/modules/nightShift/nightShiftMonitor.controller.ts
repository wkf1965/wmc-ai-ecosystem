import type { Request, Response } from 'express'
import { buildNightShiftMonitor } from './nightShiftMonitor.service.js'

export const nightShiftMonitorController = {
  async get(_req: Request, res: Response): Promise<void> {
    res.status(200).json(buildNightShiftMonitor())
  },
}
