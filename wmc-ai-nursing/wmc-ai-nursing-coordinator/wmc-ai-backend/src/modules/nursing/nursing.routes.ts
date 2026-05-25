import { Router } from 'express'
import { z } from 'zod'
import { requireRoles } from '../../middleware/auth.js'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { routeParam } from '../../utils/routeParam.js'
import { nursingRecordsController } from './nursing.records.controller.js'
import { nursingService } from './nursing.service.js'
import { nursingParseController } from './parse/nursing.parse.controller.js'

export const nursingRouter = Router()
nursingRouter.use(requireRoles('admin', 'doctor', 'nurse'))

nursingRouter.get(
  '/daily-reports',
  asyncHandler(async (_req, res) => {
    res.json({ reports: await nursingService.listDailyReports() })
  }),
)

nursingRouter.post(
  '/daily-reports',
  asyncHandler(async (req, res) => {
    const r = await nursingService.createDailyReport(req.auth!.sub, req.body)
    res.status(201).json(r)
  }),
)

nursingRouter.get('/vitals', asyncHandler(async (_req, res) => {
  res.json({ vitals: await nursingService.listVitals() })
}))

nursingRouter.post('/vitals', asyncHandler(async (req, res) => {
  const r = await nursingService.createVital(req.auth!.sub, req.body)
  res.status(201).json(r)
}))

/** Structured assessments (in-memory store). Body → `nursing.records.validation.ts`. */
nursingRouter.get(
  '/records',
  asyncHandler(async (req, res) => {
    await nursingRecordsController.list(req, res)
  }),
)

nursingRouter.post(
  '/records',
  asyncHandler(async (req, res) => {
    await nursingRecordsController.create(req, res)
  }),
)

/** Natural language nursing note parser — LLM/rules → structured JSON → storage + alerts. */
nursingRouter.post(
  '/parse',
  asyncHandler(async (req, res) => nursingParseController.parse(req, res)),
)

/** Legacy: friendly vitals + optional `patientName` → persists to `vital_signs`. */
nursingRouter.post('/quick-record', asyncHandler(async (req, res) => {
  const r = await nursingService.createNursingRecord(req.auth!.sub, req.body)
  res.status(201).json({ vitals: r })
}))

nursingRouter.get('/medications', asyncHandler(async (_req, res) => {
  res.json({ medications: await nursingService.listMedications() })
}))

nursingRouter.post('/medications', asyncHandler(async (req, res) => {
  const r = await nursingService.createMedication(req.auth!.sub, req.body)
  res.status(201).json(r)
}))

nursingRouter.get('/alerts', asyncHandler(async (_req, res) => {
  res.json({ alerts: await nursingService.listAlerts() })
}))

nursingRouter.post('/alerts', asyncHandler(async (req, res) => {
  const r = await nursingService.createAlert(req.body)
  res.status(201).json(r)
}))

nursingRouter.get('/doctor-review-queue', requireRoles('admin', 'doctor'), asyncHandler(async (_req, res) => {
  res.json({ queue: await nursingService.listDoctorQueue() })
}))

nursingRouter.post('/doctor-review-queue', requireRoles('admin', 'nurse'), asyncHandler(async (req, res) => {
  const r = await nursingService.createDoctorReview(req.body)
  res.status(201).json(r)
}))

const statusSchema = z.object({ status: z.enum(['pending', 'reviewed', 'escalated']) })

nursingRouter.patch('/doctor-review-queue/:id', requireRoles('admin', 'doctor'), asyncHandler(async (req, res) => {
  const { status } = statusSchema.parse(req.body)
  const row = await nursingService.patchDoctorReview(routeParam(req, 'id'), status)
  if (!row) {
    res.status(404).json({ error: 'Queue item not found' })
    return
  }
  res.json(row)
}))
