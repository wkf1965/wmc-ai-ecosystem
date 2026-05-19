import type { Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { nurseReminderMemoryStore } from './nurseReminder.store.js'
import {
  buildReminderRecord,
  nextReminderTimeHm,
  priorityAlertText,
} from './nurseReminder.service.js'
import { nurseReminderCreateBodySchema } from './nurseReminder.validation.js'

function nowIso(): string {
  return new Date().toISOString()
}

export const nurseReminderController = {
  async create(req: Request, res: Response): Promise<void> {
    const body = nurseReminderCreateBodySchema.parse(req.body)
    const row = buildReminderRecord(body, uuid(), nowIso())

    nurseReminderMemoryStore.append(row)

    const nextReminderTime = nextReminderTimeHm(body)
    const alert = priorityAlertText(body.priority)

    const out: Record<string, unknown> = {
      message: 'Reminder created successfully',
      reminder: row,
    }
    if (nextReminderTime !== undefined) out.nextReminderTime = nextReminderTime
    if (alert !== undefined) out.alert = alert

    res.status(201).json(out)
  },

  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ reminders: nurseReminderMemoryStore.list() })
  },
}
