import type { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { nursingAnnouncementMemoryStore } from './nursingAnnouncement.store.js'
import {
  announcementAlertText,
  buildAnnouncementRecord,
} from './nursingAnnouncement.service.js'
import {
  nursingAnnouncementAckBodySchema,
  nursingAnnouncementCreateBodySchema,
} from './nursingAnnouncement.validation.js'

function nowIso(): string {
  return new Date().toISOString()
}

export const nursingAnnouncementController = {
  async create(req: Request, res: Response): Promise<void> {
    const body = nursingAnnouncementCreateBodySchema.parse(req.body)
    const row = buildAnnouncementRecord(body, uuid(), nowIso())

    nursingAnnouncementMemoryStore.append(row)

    res.status(201).json({
      message: 'Announcement created successfully',
      announcement: row,
      alert: announcementAlertText(body.priority, body.targetShift),
    })
  },

  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ announcements: nursingAnnouncementMemoryStore.list() })
  },

  /** Append to `announcement.acknowledgements` (supports shift-wide acknowledgement tracking). */
  async acknowledge(req: Request, res: Response): Promise<void> {
    const body = nursingAnnouncementAckBodySchema.parse(req.body)
    const existing = nursingAnnouncementMemoryStore.findById(body.announcementId)
    if (!existing) {
      res.status(404).json({ error: 'Not found', message: 'Announcement not found' })
      return
    }

    nursingAnnouncementMemoryStore.addAcknowledgement(body.announcementId, {
      acknowledgedBy: body.acknowledgedBy.trim(),
      acknowledgedAt: nowIso(),
    })
    const updated = nursingAnnouncementMemoryStore.findById(body.announcementId)
    res.status(200).json({
      message: 'Acknowledgement recorded',
      announcement: updated,
    })
  },
}
