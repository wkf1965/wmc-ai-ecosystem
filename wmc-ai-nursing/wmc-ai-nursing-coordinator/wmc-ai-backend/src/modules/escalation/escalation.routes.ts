import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { doctorEscalationController } from './doctorEscalation.controller.js'

export const escalationRouter = Router()

escalationRouter.use(requireRoles('admin', 'doctor', 'nurse'))

escalationRouter.post('/check', asyncHandler(async (req, res) => doctorEscalationController.check(req, res)))
