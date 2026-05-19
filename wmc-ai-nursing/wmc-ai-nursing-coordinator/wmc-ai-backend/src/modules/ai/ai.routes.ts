import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { aiBodySchemas, aiService } from './ai.service.js'
import { aiSummaryController } from './ai.summary.controller.js'

export const aiRouter = Router()
aiRouter.use(requireRoles('admin', 'doctor', 'nurse', 'therapist', 'receptionist'))

aiRouter.post(
  '/patient-summary',
  asyncHandler(async (req, res) => {
    const { patientId } = aiBodySchemas.patientSummary.parse(req.body)
    const out = await aiService.patientSummary(patientId)
    res.status(201).json(out)
  }),
)

/** Rule-based nursing summary from structured vitals + ADLs, else legacy `{ patientName?, notes }` stub (+ persist). */
aiRouter.post('/summary', asyncHandler(async (req, res) => aiSummaryController.post(req, res)))

aiRouter.post(
  '/classify-lead',
  asyncHandler(async (req, res) => {
    const { notes } = aiBodySchemas.classifyLead.parse(req.body)
    const out = await aiService.classifyLead(notes)
    res.status(201).json(out)
  }),
)

aiRouter.post(
  '/follow-up-message',
  asyncHandler(async (req, res) => {
    const { context } = aiBodySchemas.followUp.parse(req.body)
    const out = await aiService.followUpMessage(context)
    res.status(201).json(out)
  }),
)

aiRouter.post(
  '/nursing-alert-summary',
  asyncHandler(async (req, res) => {
    const { description } = aiBodySchemas.nursingAlert.parse(req.body)
    const out = await aiService.nursingAlertSummary(description)
    res.status(201).json(out)
  }),
)

aiRouter.post(
  '/rehab-progress-report',
  asyncHandler(async (req, res) => {
    const { sessionIds } = aiBodySchemas.rehabReport.parse(req.body)
    const out = await aiService.rehabProgressReport(sessionIds)
    res.status(201).json(out)
  }),
)
