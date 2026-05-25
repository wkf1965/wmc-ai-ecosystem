/**
 * Stage 4 — /api/ot
 * Direct pg routes for the ot_records table.
 */
const express = require('express')
const { query, queryOne } = require('../db')

const router = express.Router()

// GET /api/ot — list OT records
// Optional: staff_name, status, date (YYYY-MM-DD), limit
router.get('/', async (req, res) => {
  try {
    const { staff_name, status, date, limit = 50 } = req.query
    let sql = 'SELECT * FROM ot_records WHERE 1=1'
    const params = []

    if (staff_name) {
      params.push(`%${staff_name}%`)
      sql += ` AND staff_name ILIKE $${params.length}`
    }
    if (status) {
      params.push(status)
      sql += ` AND status = $${params.length}`
    }
    if (date) {
      params.push(date)
      sql += ` AND DATE(created_at) = $${params.length}`
    }

    params.push(Math.min(Number(limit), 500))
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`

    const rows = await query(sql, params)
    res.json({ ok: true, count: rows.length, data: rows })
  } catch (err) {
    console.error('[ot GET]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/ot/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM ot_records WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ ok: false, error: 'OT record not found' })
    res.json({ ok: true, data: row })
  } catch (err) {
    console.error('[ot GET/:id]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/ot — create OT record
router.post('/', async (req, res) => {
  try {
    const {
      staff_name,
      shift_end_time,
      ot_start_time,
      ot_end_time,
      total_ot_hours = 0,
      ot_allowance = 0,
      status = 'pending',
    } = req.body

    if (!staff_name) {
      return res.status(400).json({ ok: false, error: 'staff_name is required' })
    }

    const row = await queryOne(
      `INSERT INTO ot_records
         (staff_name, shift_end_time, ot_start_time, ot_end_time, total_ot_hours, ot_allowance, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        staff_name,
        shift_end_time ?? null,
        ot_start_time ?? null,
        ot_end_time ?? null,
        total_ot_hours,
        ot_allowance,
        status,
      ]
    )

    res.status(201).json({ ok: true, data: row })
  } catch (err) {
    console.error('[ot POST]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// PATCH /api/ot/:id/approve — approve an OT record
router.patch('/:id/approve', async (req, res) => {
  try {
    const row = await queryOne(
      `UPDATE ot_records SET status = 'approved' WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ ok: false, error: 'OT record not found' })
    res.json({ ok: true, data: row })
  } catch (err) {
    console.error('[ot PATCH/:id/approve]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
