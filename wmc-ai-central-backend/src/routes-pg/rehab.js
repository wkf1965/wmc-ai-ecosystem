/**
 * Stage 4 — /api/rehab/progress
 * Direct pg routes for the rehab_progress table.
 */
const express = require('express')
const { query, queryOne } = require('../db')

const router = express.Router()

// GET /api/rehab/progress — list progress records
// Optional: patient_id, therapist_name, treatment_type, limit
router.get('/progress', async (req, res) => {
  try {
    const { patient_id, therapist_name, treatment_type, limit = 50 } = req.query
    let sql = `
      SELECT rp.*, p.name AS patient_name, p.room
      FROM rehab_progress rp
      LEFT JOIN patients p ON p.id = rp.patient_id
      WHERE 1=1`
    const params = []

    if (patient_id) {
      params.push(patient_id)
      sql += ` AND rp.patient_id = $${params.length}`
    }
    if (therapist_name) {
      params.push(`%${therapist_name}%`)
      sql += ` AND rp.therapist_name ILIKE $${params.length}`
    }
    if (treatment_type) {
      params.push(treatment_type)
      sql += ` AND rp.treatment_type = $${params.length}`
    }

    params.push(Math.min(Number(limit), 500))
    sql += ` ORDER BY rp.created_at DESC LIMIT $${params.length}`

    const rows = await query(sql, params)
    res.json({ ok: true, count: rows.length, data: rows })
  } catch (err) {
    console.error('[rehab GET /progress]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/rehab/progress/:id
router.get('/progress/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT rp.*, p.name AS patient_name, p.room
       FROM rehab_progress rp
       LEFT JOIN patients p ON p.id = rp.patient_id
       WHERE rp.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ ok: false, error: 'Progress record not found' })
    res.json({ ok: true, data: row })
  } catch (err) {
    console.error('[rehab GET /progress/:id]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/rehab/progress — create progress record
router.post('/progress', async (req, res) => {
  try {
    const {
      patient_id,
      therapist_name,
      treatment_type,
      progress_notes,
      pain_score,
      mobility_score,
    } = req.body

    if (!treatment_type) {
      return res.status(400).json({ ok: false, error: 'treatment_type is required' })
    }

    const row = await queryOne(
      `INSERT INTO rehab_progress
         (patient_id, therapist_name, treatment_type, progress_notes, pain_score, mobility_score)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        patient_id ?? null,
        therapist_name ?? null,
        treatment_type,
        progress_notes ?? null,
        pain_score ?? null,
        mobility_score ?? null,
      ]
    )

    res.status(201).json({ ok: true, data: row })
  } catch (err) {
    console.error('[rehab POST /progress]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
