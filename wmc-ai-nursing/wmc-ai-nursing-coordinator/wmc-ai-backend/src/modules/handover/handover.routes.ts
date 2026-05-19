import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { handoverController } from './handover.controller.js'

export const handoverRouter = Router()

handoverRouter.use(requireRoles('admin', 'doctor', 'nurse'))

handoverRouter.post(
  '/generate',
  asyncHandler(async (req, res) => handoverController.generate(req, res)),
)

handoverRouter.get(
  '/auto-generate',
  asyncHandler(async (_req, res) => handoverController.autoGenerate(_req, res)),
)
