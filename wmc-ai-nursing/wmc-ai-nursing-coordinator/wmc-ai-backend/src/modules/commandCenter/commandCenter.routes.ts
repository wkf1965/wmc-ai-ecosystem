import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { commandCenterController } from './commandCenter.controller.js'

export const commandCenterRouter = Router()

commandCenterRouter.use(requireRoles('admin', 'doctor', 'nurse'))

commandCenterRouter.get(
  '/status',
  asyncHandler(async (req, res) => commandCenterController.status(req, res)),
)
