import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { familyCommunicationQueueController } from './familyCommunicationQueue.controller.js'
import { familyUpdateController } from './familyUpdate.controller.js'

export const familyRouter = Router()

familyRouter.use(requireRoles('admin', 'doctor', 'nurse'))

familyRouter.post('/update', asyncHandler(async (req, res) => familyUpdateController.update(req, res)))

familyRouter.get(
  '/communication-queue',
  asyncHandler(async (_req, res) => familyCommunicationQueueController.queue(_req, res)),
)
