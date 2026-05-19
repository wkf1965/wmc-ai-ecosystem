import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { woundAssessmentController } from './woundAssessment.controller.js'

export const woundRouter = Router()

woundRouter.use(requireRoles('admin', 'doctor', 'nurse'))

woundRouter.post(
  '/assessment',
  asyncHandler(async (req, res) => woundAssessmentController.create(req, res)),
)

woundRouter.get(
  '/assessments',
  asyncHandler(async (req, res) => woundAssessmentController.list(req, res)),
)
