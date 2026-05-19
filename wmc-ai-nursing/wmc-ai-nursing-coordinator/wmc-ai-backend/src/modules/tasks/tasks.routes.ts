import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { tasksController } from './tasks.controller.js'

export const tasksRouter = Router()

tasksRouter.use(requireRoles('admin', 'doctor', 'nurse'))

tasksRouter.get('/queue', asyncHandler(async (req, res) => tasksController.queue(req, res)))
