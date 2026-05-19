import { Router } from 'express'
import { asyncHandler } from '../../middleware/asyncHandler.js'
import { requireRoles } from '../../middleware/auth.js'
import { nursingAnnouncementController } from './nursingAnnouncement.controller.js'

export const announcementsRouter = Router()

announcementsRouter.use(requireRoles('admin', 'doctor', 'nurse'))

announcementsRouter.post(
  '/create',
  asyncHandler(async (req, res) => nursingAnnouncementController.create(req, res)),
)

announcementsRouter.get(
  '/list',
  asyncHandler(async (_req, res) => nursingAnnouncementController.list(_req, res)),
)

announcementsRouter.post(
  '/acknowledge',
  asyncHandler(async (req, res) => nursingAnnouncementController.acknowledge(req, res)),
)
