import type { Request, Response } from 'express'
import { buildTasksQueue } from './tasksQueue.service.js'

export const tasksController = {
  async queue(_req: Request, res: Response): Promise<void> {
    const out = buildTasksQueue()
    res.status(200).json(out)
  },
}
