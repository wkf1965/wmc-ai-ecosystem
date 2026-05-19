import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { turningController } from './turning.controller.js'

export const turningRouter = Router()

turningRouter.use(requireRoles('admin', 'doctor', 'nurse'))

turningRouter.get('/records', asyncHandler(async (_req, res) => turningController.list(_req, res)))

turningRouter.post('/records', asyncHandler(async (req, res) => turningController.create(req, res)))
