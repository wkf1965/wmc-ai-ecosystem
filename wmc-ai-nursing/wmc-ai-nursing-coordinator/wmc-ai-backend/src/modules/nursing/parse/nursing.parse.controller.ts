import type { Request, Response } from 'express'
import { nursingParseInputSchema } from './nursing.parse.validation.js'
import { parseAndPersistNursingMessage } from './nursing.parse.service.js'

export const nursingParseController = {
  async parse(req: Request, res: Response): Promise<void> {
    const input = nursingParseInputSchema.parse(req.body)
    const saved = await parseAndPersistNursingMessage(input)
    res.status(201).json({
      ok: true,
      ...saved,
    })
  },
}
