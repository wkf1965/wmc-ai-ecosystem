import type { Request, Response } from 'express'
import { buildDashboardSummary } from './dashboard.service.js'

export const dashboardController = {
  async summary(_req: Request, res: Response): Promise<void> {
    const out = await buildDashboardSummary()
    res.status(200).json(out)
  },
}
