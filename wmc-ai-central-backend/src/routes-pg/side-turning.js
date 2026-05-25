/**
 * Stage 4 — /api/side-turning
 * Direct pg routes for the side_turning_records table.
 */
const express = require('express')
const { query, queryOne } = require('../db')

const router = express.Router()

// GET /api/side-turning — list records
// Optional: patient_id, room, date (YYYY-MM-DD), limit
router.get('/', async (req, res) => {
  try {
    const { patient_id, room, date, limit = 100 } = req.query
    let sql = `
      SELECT st.*, p.name AS patient_name
      FROM side_turning_records st
      LEFT JOIN patients p ON p.id = st.patient_id
      WHERE 1=1`
    const params = []

    if (patient_id) {
      params.push(patient_id)
      sql += ` AND st.patient_id = $${params.length}`
    }
    if (room) {
      params.push(room)
      sql += ` AND st.room = $${params.length}`
    }
    if (date) {
      params.push(date)
      sql += ` AND DATE(st.created_at) = $${params.length}`
    }

    params.push(Math.min(Number(limit), 500))
    sql += ` ORDER BY st.created_at DESC LIMIT $${params.length}`

    const rows = await query(sql, params)
    res.json({ ok: true, count: rows.length, data: rows })
  } catch (err) {
    console.error('[side-turning GET]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/side-turning/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT st.*, p.name AS patient_name
       FROM side_turning_records st
       LEFT JOIN patients p ON p.id = st.patient_id
       WHERE st.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ ok: false, error: 'Record not found' })
    res.json({ ok: true, data: row })
  } catch (err) {
    console.error('[side-turning GET/:id]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/side-turning — create record
router.post('/', async (req, res) => {
  try {
    const { patient_id, room, position, photo_url, score, nurse_name } = req.body

    if (!position) {
      return res.status(400).json({ ok: false, error: 'position is required' })
    }

    const row = await queryOne(
      `INSERT INTO side_turning_records (patient_id, room, position, photo_url, score, nurse_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        patient_id ?? null,
        room ?? null,
        position,
        photo_url ?? null,
        score ?? null,
        nurse_name ?? null,
      ]
    )

    res.status(201).json({ ok: true, data: row })
  } catch (err) {
    console.error('[side-turning POST]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
