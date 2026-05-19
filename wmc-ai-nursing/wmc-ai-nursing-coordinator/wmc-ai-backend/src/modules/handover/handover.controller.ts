import type { Request, Response } from 'express'
import { buildHandoverAutoGenerate } from './handoverAutoGenerate.service.js'
import { generateShiftHandover } from './handover.service.js'
import { handoverGenerateBodySchema } from './handover.validation.js'

export const handoverController = {
  /** `POST /handover/generate` — builds rule-based narrative and task list from snapshots. */
  async generate(req: Request, res: Response): Promise<void> {
    const body = handoverGenerateBodySchema.parse(req.body)
    const out = generateShiftHandover(body)
    res.status(200).json(out)
  },

  /** `GET /handover/auto-generate` — facility-wide rule-based rollup (coordinators / engines). */
  async autoGenerate(_req: Request, res: Response): Promise<void> {
    const out = await buildHandoverAutoGenerate()
    res.status(200).json(out)
  },
}
