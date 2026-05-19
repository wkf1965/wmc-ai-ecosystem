import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { dailyFacilityReportController } from './dailyFacilityReport.controller.js'

export const reportsRouter = Router()

reportsRouter.use(requireRoles('admin', 'doctor', 'nurse'))

reportsRouter.get(
  '/daily-facility',
  asyncHandler(async (req, res) => dailyFacilityReportController.getDailyFacilityReport(req, res)),
)
