/**
 * Stage 4 — /api/dashboard
 * Aggregated dashboard data from all 7 PostgreSQL tables.
 * Runs all queries in parallel for fast response.
 */
const express = require('express')
const { query } = require('../db')

const router = express.Router()

// GET /api/dashboard
router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    const [
      totalPatients,
      todayNursing,
      todaySideTurning,
      pendingOT,
      activeCrmLeads,
      latestRehab,
      latestAiMemory,
    ] = await Promise.all([
      // 1. Total active patients
      query("SELECT COUNT(*) AS count FROM patients WHERE status = 'active'"),

      // 2. Nursing records created today
      query(
        `SELECT COUNT(*) AS count FROM nursing_records WHERE DATE(created_at) = $1`,
        [today]
      ),

      // 3. Side turning records today
      query(
        `SELECT COUNT(*) AS count FROM side_turning_records WHERE DATE(created_at) = $1`,
        [today]
      ),

      // 4. Pending OT records
      query("SELECT COUNT(*) AS count FROM ot_records WHERE status = 'pending'"),

      // 5. Active CRM leads (new + contacted + visit_scheduled)
      query(
        `SELECT COUNT(*) AS count
         FROM crm_leads
         WHERE lead_status IN ('new', 'contacted', 'visit_scheduled')`
      ),

      // 6. Latest 5 rehab progress records with patient name
      query(
        `SELECT rp.id, rp.therapist_name, rp.treatment_type,
                rp.pain_score, rp.mobility_score, rp.created_at,
                p.name AS patient_name, p.room
         FROM rehab_progress rp
         LEFT JOIN patients p ON p.id = rp.patient_id
         ORDER BY rp.created_at DESC
         LIMIT 5`
      ),

      // 7. Latest 5 AI memory entries (highest risk first, then newest)
      query(
        `SELECT * FROM ai_memory
         ORDER BY
           CASE risk_level
             WHEN 'critical' THEN 1
             WHEN 'high'     THEN 2
             WHEN 'medium'   THEN 3
             ELSE 4
           END,
           created_at DESC
         LIMIT 5`
      ),
    ])

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      data: {
        total_patients:          Number(totalPatients[0]?.count ?? 0),
        today_nursing_records:   Number(todayNursing[0]?.count ?? 0),
        today_side_turning:      Number(todaySideTurning[0]?.count ?? 0),
        pending_ot_records:      Number(pendingOT[0]?.count ?? 0),
        active_crm_leads:        Number(activeCrmLeads[0]?.count ?? 0),
        latest_rehab_progress:   latestRehab,
        latest_ai_memory:        latestAiMemory,
      },
    })
  } catch (err) {
    console.error('[dashboard GET]', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
