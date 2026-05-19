import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { routeParam } from '../../utils/routeParam.js'
import { crmService } from './crm.service.js'

export const crmRouter = Router()

crmRouter.get(
  '/leads',
  asyncHandler(async (_req, res) => {
    res.json({ leads: await crmService.list() })
  }),
)

crmRouter.post(
  '/leads',
  requireRoles('admin', 'receptionist', 'doctor'),
  asyncHandler(async (req, res) => {
    const lead = await crmService.create(req.body)
    res.status(201).json(lead)
  }),
)

crmRouter.get(
  '/leads/:id',
  asyncHandler(async (req, res) => {
    const lead = await crmService.get(routeParam(req, 'id'))
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' })
      return
    }
    res.json(lead)
  }),
)

crmRouter.patch(
  '/leads/:id',
  requireRoles('admin', 'receptionist', 'doctor'),
  asyncHandler(async (req, res) => {
    const lead = await crmService.update(routeParam(req, 'id'), req.body)
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' })
      return
    }
    res.json(lead)
  }),
)
