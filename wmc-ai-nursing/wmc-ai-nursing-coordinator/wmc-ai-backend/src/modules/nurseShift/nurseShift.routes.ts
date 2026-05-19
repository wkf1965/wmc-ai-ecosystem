import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { nurseShiftController } from './nurseShift.controller.js'

export const nurseShiftRouter = Router()

nurseShiftRouter.use(requireRoles('admin', 'doctor', 'nurse'))

nurseShiftRouter.post(
  '/calculate-ot',
  asyncHandler(async (req, res) => nurseShiftController.calculateOt(req, res)),
)

nurseShiftRouter.get('/records', asyncHandler(async (_req, res) => nurseShiftController.list(_req, res)))
