const taskService = require('./task.service')
const { emitEvent } = require('../../core/events/event-bus')
const { EVENT_TYPES } = require('../../core/events/event-types')

const taskController = {
  async list(req, res) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined
      const result = await taskService.listTasks({
        status:    req.query.status,
        patientId: req.query.patientId,
        domain:    req.query.domain,
        limit,
      })
      res.json(result)
    } catch (err) {
      console.error('[tasks GET]', err)
      res.status(500).json({ error: 'Failed to list tasks' })
    }
  },

  async complete(req, res) {
    try {
      const { id } = req.params

      emitEvent(EVENT_TYPES.TASK_COMPLETED, {
        taskId:    id,
        userId:    req.user?.id,
        userRole:  req.user?.role ?? 'nurse',
        userName:  req.user?.fullName,
        ipAddress: req.ip,
      })

      res.json({
        taskId:      id,
        completed:   true,
        completedBy: req.user?.id ?? null,
        mock:        true,
      })
    } catch (err) {
      console.error('[tasks PATCH /complete]', err)
      res.status(500).json({ error: 'Failed to complete task' })
    }
  },
}

module.exports = { taskController }
