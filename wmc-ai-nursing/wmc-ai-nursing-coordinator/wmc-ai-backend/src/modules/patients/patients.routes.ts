import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { routeParam } from '../../utils/routeParam.js'
import { patientService } from './patients.service.js'

export const patientsRouter = Router()

patientsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await patientService.list()
    res.json({ patients: rows })
  }),
)

patientsRouter.post(
  '/',
  requireRoles('admin', 'receptionist', 'doctor', 'nurse'),
  asyncHandler(async (req, res) => {
    const p = await patientService.create(req.body)
    res.status(201).json(p)
  }),
)

patientsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const p = await patientService.get(routeParam(req, 'id'))
    if (!p) {
      res.status(404).json({ error: 'Patient not found' })
      return
    }
    res.json(p)
  }),
)

patientsRouter.patch(
  '/:id',
  requireRoles('admin', 'doctor', 'nurse', 'receptionist'),
  asyncHandler(async (req, res) => {
    const p = await patientService.update(routeParam(req, 'id'), req.body)
    if (!p) {
      res.status(404).json({ error: 'Patient not found' })
      return
    }
    res.json(p)
  }),
)
