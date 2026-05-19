import { Router } from 'express'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { requireRoles } from '../../middleware/auth.js'
import { nurseAcknowledgementController } from './nurseAcknowledgement.controller.js'

export const acknowledgementsRouter = Router()

acknowledgementsRouter.use(requireRoles('admin', 'doctor', 'nurse'))

acknowledgementsRouter.post(
  '/confirm',
  asyncHandler(async (req, res) => nurseAcknowledgementController.confirm(req, res)),
)

acknowledgementsRouter.get(
  '/list',
  asyncHandler(async (_req, res) => nurseAcknowledgementController.list(_req, res)),
)
