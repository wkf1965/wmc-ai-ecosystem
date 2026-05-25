/**
 * Stage 4 — /api/ai/memory
 * Direct pg routes for the ai_memory table.
 */
const express = require('express')
const { query, queryOne } = require('../db')

const router = express.Router()

// GET /api/ai/memory — list AI memory entries
// Optional: module, risk_level, limit
router.get('/memory', async (req, res) => {
  try {
    const { module, risk_level, limit = 20 } = req.query
    let sql = 'SELECT * FROM ai_memory WHERE 1=1'
    const params = []

    if (module) {
      params.push(module)
      sql += ` AND module = $${params.length}`
    }
    if (risk_level) {
      params.push(risk_level)
      sql += ` AND risk_level = $${params.length}`
    }

    params.push(Math.min(Number(limit), 200))
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`

    const rows = await query(sql, params)
    res.json({ ok: true, count: rows.length, data: rows })
  } catch (err) {
    console.error('[ai-memory GET /memory]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/ai/memory/:id
router.get('/memory/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM ai_memory WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ ok: false, error: 'Memory record not found' })
    res.json({ ok: true, data: row })
  } catch (err) {
    console.error('[ai-memory GET /memory/:id]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/ai/memory — create memory entry
router.post('/memory', async (req, res) => {
  try {
    const {
      module,
      related_id,
      summary,
      risk_level = 'low',
      next_action,
    } = req.body

    if (!module || !summary) {
      return res.status(400).json({ ok: false, error: 'module and summary are required' })
    }

    const row = await queryOne(
      `INSERT INTO ai_memory (module, related_id, summary, risk_level, next_action)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        module,
        related_id ?? null,
        summary,
        risk_level,
        next_action ?? null,
      ]
    )

    res.status(201).json({ ok: true, data: row })
  } catch (err) {
    console.error('[ai-memory POST /memory]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
