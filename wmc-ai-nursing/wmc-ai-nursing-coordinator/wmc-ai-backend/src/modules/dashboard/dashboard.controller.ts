import type { Request, Response } from 'express'
import { buildDashboard, buildDashboardSummary } from './dashboard.service.js'

export const dashboardController = {
  async dashboard(_req: Request, res: Response): Promise<void> {
    const out = await buildDashboard()
    res.status(200).json(out)
  },

  async summary(_req: Request, res: Response): Promise<void> {
    const out = await buildDashboardSummary()
    res.status(200).json(out)
  },
}
