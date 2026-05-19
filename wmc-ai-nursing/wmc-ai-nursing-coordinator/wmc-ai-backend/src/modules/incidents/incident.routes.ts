import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { incidentController } from './incident.controller.js'

export const incidentsRouter = Router()

incidentsRouter.use(requireRoles('admin', 'doctor', 'nurse'))

incidentsRouter.post(
  '/report',
  asyncHandler(async (req, res) => incidentController.create(req, res)),
)

incidentsRouter.get(
  '/reports',
  asyncHandler(async (_req, res) => incidentController.list(_req, res)),
)
