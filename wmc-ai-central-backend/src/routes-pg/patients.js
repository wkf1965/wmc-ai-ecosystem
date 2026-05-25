/**
 * Stage 4 — /api/patients
 * Direct pg routes for the patients table.
 */
const express = require('express')
const { query, queryOne } = require('../db')

const router = express.Router()

// GET /api/patients — list all patients (filter by ?status=active)
router.get('/', async (req, res) => {
  try {
    const { status, room } = req.query
    let sql = 'SELECT * FROM patients WHERE 1=1'
    const params = []

    if (status) {
      params.push(status)
      sql += ` AND status = $${params.length}`
    }
    if (room) {
      params.push(room)
      sql += ` AND room = $${params.length}`
    }

    sql += ' ORDER BY created_at DESC'

    const rows = await query(sql, params)
    res.json({ ok: true, count: rows.length, data: rows })
  } catch (err) {
    console.error('[patients GET]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/patients/:id — single patient
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM patients WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ ok: false, error: 'Patient not found' })
    res.json({ ok: true, data: row })
  } catch (err) {
    console.error('[patients GET/:id]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/patients — create patient
router.post('/', async (req, res) => {
  try {
    const { name, room, diagnosis, status = 'active', admission_date } = req.body

    if (!name || !room) {
      return res.status(400).json({ ok: false, error: 'name and room are required' })
    }

    const row = await queryOne(
      `INSERT INTO patients (name, room, diagnosis, status, admission_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, room, diagnosis ?? null, status, admission_date ?? null]
    )

    res.status(201).json({ ok: true, data: row })
  } catch (err) {
    console.error('[patients POST]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// PUT /api/patients/:id — update patient
router.put('/:id', async (req, res) => {
  try {
    const { name, room, diagnosis, status, admission_date } = req.body
    const row = await queryOne(
      `UPDATE patients SET
         name           = COALESCE($1, name),
         room           = COALESCE($2, room),
         diagnosis      = COALESCE($3, diagnosis),
         status         = COALESCE($4, status),
         admission_date = COALESCE($5, admission_date)
       WHERE id = $6
       RETURNING *`,
      [name, room, diagnosis, status, admission_date, req.params.id]
    )
    if (!row) return res.status(404).json({ ok: false, error: 'Patient not found' })
    res.json({ ok: true, data: row })
  } catch (err) {
    console.error('[patients PUT/:id]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
