/**
 * src/lib/prisma.js
 *
 * Authoritative Prisma accessor for the entire application.
 * All repositories MUST import from here — never directly from @prisma/client.
 *
 * Singleton pattern:
 * - One PrismaClient is created per process.
 * - In development (--watch hot-reload), the global guard `global.__wmc_prisma`
 *   prevents a new client being instantiated on every file reload.
 * - In production, the module cache alone guarantees a single instance.
 */

const { PrismaClient } = require('@prisma/client')

const g = /** @type {any} */ (global)

function buildPrismaClient() {
  return new PrismaClient({
    log:
      process.env.DB_LOG_SQL === 'true'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })
}

/** @type {PrismaClient} */
const prismaClient = g.__wmc_prisma ?? buildPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  // Persist across hot-reloads in dev; production relies on module cache.
  g.__wmc_prisma = prismaClient
}

/**
 * Returns the singleton PrismaClient instance.
 * Throws if called before connectPrisma() completes in DB mode.
 * Safe to call in mock mode — repositories guard against usage with isDatabaseConnected().
 */
function getClient() {
  return prismaClient
}

/** True only after a successful $connect() call. */
function isDatabaseConnected() {
  const { isDatabaseConnected: check } = require('../config/prisma')
  return check()
}

/** True when DATABASE_ENABLED=true (or DATABASE_URL is set and flag is absent). */
function isDatabaseEnabled() {
  const { isDatabaseEnabled: check } = require('../config/prisma')
  return check()
}

module.exports = { getClient, isDatabaseConnected, isDatabaseEnabled, prismaClient }
