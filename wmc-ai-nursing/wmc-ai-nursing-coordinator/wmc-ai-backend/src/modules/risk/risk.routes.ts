import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { fallScoreController } from './fallScore.controller.js'
import { pressureUlcerController } from './pressureUlcer.controller.js'
import { wanderingRiskController } from './wanderingRisk.controller.js'
import { bedExitAlertController } from './bedExitAlert.controller.js'

export const riskRouter = Router()

riskRouter.use(requireRoles('admin', 'doctor', 'nurse', 'therapist', 'receptionist'))

riskRouter.post(
  '/fall-score',
  asyncHandler(async (req, res) => fallScoreController.calculate(req, res)),
)

riskRouter.post(
  '/pressure-ulcer',
  asyncHandler(async (req, res) => pressureUlcerController.calculate(req, res)),
)

riskRouter.post(
  '/wandering',
  asyncHandler(async (req, res) => wanderingRiskController.calculate(req, res)),
)

riskRouter.post(
  '/bed-exit',
  asyncHandler(async (req, res) => bedExitAlertController.calculate(req, res)),
)
