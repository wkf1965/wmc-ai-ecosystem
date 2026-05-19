import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { vitalsAnalyzeController } from './vitalsAnalyze.controller.js'

export const vitalsRouter = Router()

vitalsRouter.use(requireRoles('admin', 'doctor', 'nurse'))

vitalsRouter.post('/analyze', asyncHandler(async (req, res) => vitalsAnalyzeController.analyze(req, res)))
