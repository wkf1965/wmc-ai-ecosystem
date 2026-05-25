/**
 * Stage 4 — /api/crm/leads
 * Direct pg routes for the crm_leads table.
 */
const express = require('express')
const { query, queryOne } = require('../db')

const router = express.Router()

// GET /api/crm/leads — list leads
// Optional: lead_status, service_interest, limit
router.get('/leads', async (req, res) => {
  try {
    const { lead_status, service_interest, limit = 50 } = req.query
    let sql = 'SELECT * FROM crm_leads WHERE 1=1'
    const params = []

    if (lead_status) {
      params.push(lead_status)
      sql += ` AND lead_status = $${params.length}`
    }
    if (service_interest) {
      params.push(`%${service_interest}%`)
      sql += ` AND service_interest ILIKE $${params.length}`
    }

    params.push(Math.min(Number(limit), 500))
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`

    const rows = await query(sql, params)
    res.json({ ok: true, count: rows.length, data: rows })
  } catch (err) {
    console.error('[crm GET /leads]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/crm/leads/:id
router.get('/leads/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM crm_leads WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ ok: false, error: 'Lead not found' })
    res.json({ ok: true, data: row })
  } catch (err) {
    console.error('[crm GET /leads/:id]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/crm/leads — create lead
router.post('/leads', async (req, res) => {
  try {
    const {
      customer_name,
      phone,
      service_interest,
      lead_status = 'new',
      next_follow_up,
      notes,
    } = req.body

    if (!customer_name) {
      return res.status(400).json({ ok: false, error: 'customer_name is required' })
    }

    const row = await queryOne(
      `INSERT INTO crm_leads
         (customer_name, phone, service_interest, lead_status, next_follow_up, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        customer_name,
        phone ?? null,
        service_interest ?? null,
        lead_status,
        next_follow_up ?? null,
        notes ?? null,
      ]
    )

    res.status(201).json({ ok: true, data: row })
  } catch (err) {
    console.error('[crm POST /leads]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// PATCH /api/crm/leads/:id/status — update lead status
router.patch('/leads/:id/status', async (req, res) => {
  try {
    const { lead_status } = req.body
    if (!lead_status) {
      return res.status(400).json({ ok: false, error: 'lead_status is required' })
    }
    const row = await queryOne(
      'UPDATE crm_leads SET lead_status = $1 WHERE id = $2 RETURNING *',
      [lead_status, req.params.id]
    )
    if (!row) return res.status(404).json({ ok: false, error: 'Lead not found' })
    res.json({ ok: true, data: row })
  } catch (err) {
    console.error('[crm PATCH /leads/:id/status]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
