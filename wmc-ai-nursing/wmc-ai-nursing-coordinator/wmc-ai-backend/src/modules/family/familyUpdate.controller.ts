import type { Request, Response } from 'express'
import { generateFamilyUpdate } from './familyUpdate.service.js'
import { familyUpdateBodySchema } from './familyUpdate.validation.js'

export const familyUpdateController = {
  async update(req: Request, res: Response): Promise<void> {
    const body = familyUpdateBodySchema.parse(req.body)
    const out = generateFamilyUpdate(body)
    res.status(200).json(out)
  },
}
