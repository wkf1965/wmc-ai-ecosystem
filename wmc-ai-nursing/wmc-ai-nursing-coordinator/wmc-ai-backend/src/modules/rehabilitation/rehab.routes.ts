import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { routeParam } from '../../utils/routeParam.js'
import { rehabService } from './rehab.service.js'

export const rehabRouter = Router()
rehabRouter.use(requireRoles('admin', 'doctor', 'therapist'))

rehabRouter.get(
  '/sessions',
  asyncHandler(async (_req, res) => {
    res.json({ sessions: await rehabService.list() })
  }),
)

/** Friendly fields (`patientName`, `mobility`, `therapistNote`) → same store as `/sessions`. */
rehabRouter.post(
  '/progress',
  asyncHandler(async (req, res) => {
    const s = await rehabService.createProgress(req.auth!.sub, req.body)
    res.status(201).json({ session: s })
  }),
)

rehabRouter.post(
  '/sessions',
  asyncHandler(async (req, res) => {
    const s = await rehabService.create(req.auth!.sub, req.body)
    res.status(201).json(s)
  }),
)

rehabRouter.get(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const s = await rehabService.get(routeParam(req, 'id'))
    if (!s) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    res.json(s)
  }),
)

rehabRouter.patch(
  '/sessions/:id/ai-summary',
  asyncHandler(async (req, res) => {
    const s = await rehabService.attachAiSummary(routeParam(req, 'id'), req.body)
    if (!s) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    res.json(s)
  }),
)
