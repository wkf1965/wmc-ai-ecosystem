import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { emergencyRespondController } from './emergencyRespond.controller.js'

export const emergencyRouter = Router()

emergencyRouter.use(requireRoles('admin', 'doctor', 'nurse'))

emergencyRouter.post('/respond', asyncHandler(async (req, res) => emergencyRespondController.respond(req, res)))
