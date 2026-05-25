const { createApp } = require('./app')
const { config } = require('./config/env')
const { connectPrisma, isDatabaseEnabled } = require('./config/prisma')
const { bootstrapEventListeners } = require('./core/events/event-listeners')
// Stage 4: import pg pool so the 'connect' event fires on first use
const { pool: pgPool } = require('./db')

async function startServer() {
  const dbEnabled = isDatabaseEnabled()

  // ── Database connection ────────────────────────────────────────────────
  await connectPrisma()

  // ── Event bus — register all domain listeners ─────────────────────────
  bootstrapEventListeners()

  // ── Startup diagnostics ───────────────────────────────────────────────
  console.info('[Repository Layer] Active')
  console.info(
    dbEnabled
      ? '[Database Mode] PRISMA — connected to PostgreSQL'
      : '[Database Mode] MOCK — DATABASE_ENABLED=false, mock fallback active'
  )

  // ── Express app ───────────────────────────────────────────────────────
  const app = createApp()

  app.listen(config.port, () => {
    console.info(
      `[${config.serviceName}] listening on http://localhost:${config.port}${config.apiPrefix}`
    )
    console.info(`[API Gateway] http://localhost:${config.port}${config.apiPrefix}/v1`)
  })
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[server] Failed to start:', err)
    process.exit(1)
  })
}

module.exports = { startServer }
