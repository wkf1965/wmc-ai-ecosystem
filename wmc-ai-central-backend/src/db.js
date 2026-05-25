/**
 * Stage 4 — PostgreSQL direct connection pool (raw pg driver).
 * Used by the /api/* routes for WMC AI modules.
 * The Prisma client (config/prisma.js) is kept for the /api/v1/* routes.
 */
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Reasonable connection limits for a nursing-home service
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('connect', () => {
  console.info('[pg] ✅ PostgreSQL connection established — Stage 4 database ready')
})

pool.on('error', (err) => {
  console.error('[pg] Pool error:', err.message)
})

/**
 * Convenience wrapper: resolves to rows array or throws.
 * @param {string} text  SQL string
 * @param {any[]}  [params]
 */
async function query(text, params) {
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result.rows
  } finally {
    client.release()
  }
}

/**
 * Same as query() but returns the first row or null.
 */
async function queryOne(text, params) {
  const rows = await query(text, params)
  return rows[0] ?? null
}

module.exports = { pool, query, queryOne }
