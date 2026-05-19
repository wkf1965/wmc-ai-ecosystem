import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { medicationAlertController } from './medicationAlert.controller.js'

export const medicationRouter = Router()

medicationRouter.use(requireRoles('admin', 'doctor', 'nurse'))

medicationRouter.post(
  '/check-alert',
  asyncHandler(async (req, res) => medicationAlertController.checkAlert(req, res)),
)
