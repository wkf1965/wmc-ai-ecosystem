import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { dashboardController } from './dashboard.controller.js'

export const dashboardRouter = Router()

dashboardRouter.use(requireRoles('admin', 'doctor', 'nurse'))

dashboardRouter.get('/', asyncHandler(async (req, res) => dashboardController.dashboard(req, res)))

dashboardRouter.get('/summary', asyncHandler(async (req, res) => dashboardController.summary(req, res)))
