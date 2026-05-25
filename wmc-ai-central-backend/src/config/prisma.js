const { PrismaClient } = require('@prisma/client')

/** @type {PrismaClient | null} */
let prisma = null

let connected = false

function isDatabaseEnabled() {
  const flag = process.env.DATABASE_ENABLED
  if (flag === 'true') return true
  if (flag === 'false') return false
  return Boolean(process.env.DATABASE_URL)
}

/**
 * Connect Prisma when DATABASE_URL is set and DATABASE_ENABLED is not false.
 * On failure, logs a warning and leaves mock fallback active.
 */
async function connectPrisma() {
  if (!isDatabaseEnabled() || !process.env.DATABASE_URL) {
    console.info('[prisma] Database disabled or DATABASE_URL missing — mock fallback active')
    return { connected: false, prisma: null }
  }

  try {
    prisma = new PrismaClient({
      log: process.env.DB_LOG_SQL === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    })
    await prisma.$connect()
    connected = true
    console.info('[prisma] Connected to PostgreSQL')
    return { connected: true, prisma }
  } catch (err) {
    console.warn('[prisma] Connection failed — mock fallback active:', err.message)
    if (prisma) {
      await prisma.$disconnect().catch(() => {})
    }
    prisma = null
    connected = false
    return { connected: false, prisma: null }
  }
}

function getPrisma() {
  if (!prisma) {
    throw new Error('Prisma client is not initialized. Call connectPrisma() first.')
  }
  return prisma
}

function isDatabaseConnected() {
  return connected && prisma !== null
}

async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect()
    prisma = null
    connected = false
  }
}

module.exports = {
  connectPrisma,
  getPrisma,
  isDatabaseConnected,
  isDatabaseEnabled,
  disconnectPrisma,
}
