import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { adminController } from './admin.controller.js'

export const adminRouter = Router()

adminRouter.use(requireRoles('admin'))

adminRouter.post(
  '/clear-records',
  asyncHandler(async (req, res) => adminController.clearRecords(req, res)),
)

adminRouter.delete(
  '/reset',
  asyncHandler(async (req, res) => adminController.reset(req, res)),
)

adminRouter.delete(
  '/reset-patients',
  asyncHandler(async (req, res) => adminController.resetPatients(req, res)),
)
