import type { Request, Response } from 'express'
import { buildDailyFacilityReport } from './dailyFacilityReport.service.js'

export const dailyFacilityReportController = {
  async getDailyFacilityReport(_req: Request, res: Response): Promise<void> {
    const out = await buildDailyFacilityReport()
    res.status(200).json(out)
  },
}
