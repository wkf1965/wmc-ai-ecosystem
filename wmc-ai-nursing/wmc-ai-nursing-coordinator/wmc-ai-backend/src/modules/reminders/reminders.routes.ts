import { Router } from 'express'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { requireRoles } from '../../middleware/auth.js'
import { nurseReminderController } from './nurseReminder.controller.js'

export const remindersRouter = Router()

remindersRouter.use(requireRoles('admin', 'doctor', 'nurse'))

remindersRouter.post(
  '/create',
  asyncHandler(async (req, res) => nurseReminderController.create(req, res)),
)

remindersRouter.get(
  '/list',
  asyncHandler(async (_req, res) => nurseReminderController.list(_req, res)),
)
