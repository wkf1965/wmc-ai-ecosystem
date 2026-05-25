const express = require('express')
const { taskController } = require('./task.controller')
const { requireAuth } = require('../../shared/middleware/auth.middleware')
const { clinicalStaff, supervisorOrAbove } = require('../../shared/middleware/role.middleware')

const router = express.Router()

router.get('/', (req, res) => taskController.list(req, res))

/**
 * GET /api/v1/tasks/queue
 * Pending tasks formatted as a prioritised queue for the supervisor dashboard.
 */
router.get('/queue', requireAuth, supervisorOrAbove, async (req, res) => {
  try {
    const taskRepo = require('../../repositories/task.repository')
    const { data: tasks } = await taskRepo.getAll({})

    const pending = tasks.filter((t) => !t.completed)
    const urgent  = pending.filter((t) => t.priority === 'urgent' || t.priority === 'high')
    const normal  = pending.filter((t) => t.priority !== 'urgent' && t.priority !== 'high')

    res.json({
      totalPending: pending.length,
      urgent:       urgent.length,
      normal:       normal.length,
      queue:        [...urgent, ...normal].slice(0, 20),
      source: 'mock',
      mock:   true,
    })
  } catch (err) {
    console.error('[tasks/queue]', err)
    res.status(500).json({ error: 'Failed to build task queue' })
  }
})

/** PATCH /api/v1/tasks/:id/complete — clinical staff only, audited */
router.patch('/:id/complete', requireAuth, clinicalStaff, (req, res) =>
  taskController.complete(req, res)
)

module.exports = router
