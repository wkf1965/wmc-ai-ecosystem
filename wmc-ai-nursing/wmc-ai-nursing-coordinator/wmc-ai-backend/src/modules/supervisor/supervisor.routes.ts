import { Router } from 'express'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { requireRoles } from '../../middleware/auth.js'
import { supervisorEscalationQueueController } from './supervisorEscalationQueue.controller.js'

export const supervisorRouter = Router()

supervisorRouter.use(requireRoles('admin', 'doctor', 'nurse'))

supervisorRouter.get(
  '/escalation-queue',
  asyncHandler(async (_req, res) => supervisorEscalationQueueController.get(_req, res)),
)
