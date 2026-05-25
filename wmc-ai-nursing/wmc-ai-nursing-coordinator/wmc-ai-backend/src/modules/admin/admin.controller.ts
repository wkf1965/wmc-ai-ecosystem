import type { Request, Response } from 'express'
import { clearAllMockRecords, resetPatientRecords } from './admin.service.js'

export const adminController = {
  async clearRecords(_req: Request, res: Response): Promise<void> {
    const result = await clearAllMockRecords()
    res.status(200).json({ ok: true, ...result })
  },

  async reset(_req: Request, res: Response): Promise<void> {
    const result = await clearAllMockRecords()
    res.status(200).json({ ok: true, message: 'Records deleted successfully', ...result })
  },

  async resetPatients(_req: Request, res: Response): Promise<void> {
    const result = await resetPatientRecords()
    res.status(200).json({ ok: true, message: 'Patient records cleared', ...result })
  },
}
