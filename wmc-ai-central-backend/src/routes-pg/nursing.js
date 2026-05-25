/**
 * Stage 4 — /api/nursing/records
 * Direct pg routes for the nursing_records table.
 */
const express = require('express')
const { query, queryOne } = require('../db')

const router = express.Router()

// GET /api/nursing/records — list records
// Optional query params: patient_id, record_type, date (YYYY-MM-DD), limit
router.get('/records', async (req, res) => {
  try {
    const { patient_id, record_type, date, limit = 50 } = req.query
    let sql = `
      SELECT nr.*, p.name AS patient_name, p.room
      FROM nursing_records nr
      LEFT JOIN patients p ON p.id = nr.patient_id
      WHERE 1=1`
    const params = []

    if (patient_id) {
      params.push(patient_id)
      sql += ` AND nr.patient_id = $${params.length}`
    }
    if (record_type) {
      params.push(record_type)
      sql += ` AND nr.record_type = $${params.length}`
    }
    if (date) {
      params.push(date)
      sql += ` AND DATE(nr.created_at) = $${params.length}`
    }

    params.push(Math.min(Number(limit), 500))
    sql += ` ORDER BY nr.created_at DESC LIMIT $${params.length}`

    const rows = await query(sql, params)
    res.json({ ok: true, count: rows.length, data: rows })
  } catch (err) {
    console.error('[nursing GET /records]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/nursing/records/:id
router.get('/records/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT nr.*, p.name AS patient_name, p.room
       FROM nursing_records nr
       LEFT JOIN patients p ON p.id = nr.patient_id
       WHERE nr.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ ok: false, error: 'Record not found' })
    res.json({ ok: true, data: row })
  } catch (err) {
    console.error('[nursing GET /records/:id]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/nursing/records — create record
router.post('/records', async (req, res) => {
  try {
    const { patient_id, record_type, notes, nurse_name } = req.body

    if (!record_type) {
      return res.status(400).json({ ok: false, error: 'record_type is required' })
    }

    const row = await queryOne(
      `INSERT INTO nursing_records (patient_id, record_type, notes, nurse_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [patient_id ?? null, record_type, notes ?? null, nurse_name ?? null]
    )

    res.status(201).json({ ok: true, data: row })
  } catch (err) {
    console.error('[nursing POST /records]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
