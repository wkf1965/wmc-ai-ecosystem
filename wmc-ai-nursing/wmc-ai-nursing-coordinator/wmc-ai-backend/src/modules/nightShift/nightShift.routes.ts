import { Router } from 'express'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { requireRoles } from '../../middleware/auth.js'
import { nightShiftMonitorController } from './nightShiftMonitor.controller.js'

export const nightShiftRouter = Router()

nightShiftRouter.use(requireRoles('admin', 'doctor', 'nurse'))

nightShiftRouter.get(
  '/monitor',
  asyncHandler(async (_req, res) => nightShiftMonitorController.get(_req, res)),
)
