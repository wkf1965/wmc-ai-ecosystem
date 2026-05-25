const { randomUUID } = require('crypto')

const VALID_CHANNELS = ['telegram', 'whatsapp', 'dashboard']
const VALID_STATUSES = ['sent', 'queued', 'failed']

/** @type {Array<NotificationLogEntry>} */
const memoryLogs = []

/**
 * @typedef {Object} SendNotificationInput
 * @property {string} channel
 * @property {string} target
 * @property {string} type
 * @property {string} message
 */

/**
 * @typedef {Object} NotificationLogEntry
 * @property {string} id
 * @property {string} status
 * @property {string} channel
 * @property {string} target
 * @property {string} type
 * @property {string} message
 * @property {string} sentAt
 * @property {boolean} mock
 * @property {string} createdAt
 */

function getMockDelayMs() {
  const configured = Number(process.env.NOTIFICATION_MOCK_DELAY_MS)
  if (!Number.isNaN(configured) && configured >= 0) return configured
  return 400
}

function formatSentAt(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function validateSendInput(body) {
  const errors = []
  if (!body || typeof body !== 'object') {
    return ['Request body must be a JSON object']
  }
  const { channel, target, type, message } = body
  if (!channel || !VALID_CHANNELS.includes(String(channel).toLowerCase())) {
    errors.push(`channel must be one of: ${VALID_CHANNELS.join(', ')}`)
  }
  if (!target || typeof target !== 'string' || !target.trim()) {
    errors.push('target is required')
  }
  if (!type || typeof type !== 'string' || !type.trim()) {
    errors.push('type is required')
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    errors.push('message is required')
  }
  return errors
}

function shouldSimulateFailure() {
  const rate = Number(process.env.NOTIFICATION_MOCK_FAIL_RATE ?? 0)
  if (Number.isNaN(rate) || rate <= 0) return false
  return Math.random() < Math.min(rate, 1)
}

/**
 * Mock send: queue → delay → sent (or failed if simulated).
 * @param {SendNotificationInput} input
 * @returns {Promise<NotificationLogEntry>}
 */
async function sendNotification(input) {
  const channel = String(input.channel).toLowerCase()
  const target = input.target.trim()
  const type = input.type.trim()
  const message = input.message.trim()
  const id = randomUUID()
  const createdAt = new Date().toISOString()

  const queuedEntry = {
    id,
    status: 'queued',
    channel,
    target,
    type,
    message,
    sentAt: null,
    mock: true,
    createdAt,
  }

  memoryLogs.unshift(queuedEntry)

  await sleep(getMockDelayMs())

  const failed = shouldSimulateFailure()
  const sentAt = formatSentAt(new Date())
  const finalEntry = {
    ...queuedEntry,
    status: failed ? 'failed' : 'sent',
    sentAt: failed ? null : sentAt,
  }

  const index = memoryLogs.findIndex((log) => log.id === id)
  if (index !== -1) {
    memoryLogs[index] = finalEntry
  }

  if (process.env.NODE_ENV !== 'test') {
    console.info('[MOCK NOTIFY]', JSON.stringify(finalEntry))
  }

  return finalEntry
}

/**
 * @param {{ channel?: string, status?: string, limit?: number }} [filters]
 */
async function listNotifications(filters = {}) {
  const { getPrisma } = require('../../config/prisma')
  const { withDatabaseOrMock } = require('../../shared/utils/data-source')
  const { MOCK_NOTIFICATIONS } = require('../../shared/mocks/domain-mock-data')

  function filterNotifications() {
    let results = [...MOCK_NOTIFICATIONS]

    if (filters.channel) {
      const ch = String(filters.channel).toLowerCase()
      results = results.filter((n) => n.channel === ch)
    }

    if (filters.status) {
      const st = String(filters.status).toLowerCase()
      results = results.filter((n) => n.status === st)
    }

    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 100
    return results.slice(0, limit)
  }

  const { data, source } = await withDatabaseOrMock(
    async () => {
      const prisma = getPrisma()
      const where = {}

      if (filters.channel) {
        where.channel = String(filters.channel).toLowerCase()
      }

      if (filters.status) {
        where.status = String(filters.status).toLowerCase()
      }

      const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 100

      return prisma.notification.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { id: true, fullName: true } },
        },
      })
    },
    () => filterNotifications()
  )

  const notifications = Array.isArray(data) ? data : filterNotifications()
  return {
    total: notifications.length,
    count: notifications.length,
    notifications,
    source,
    mock: source === 'mock',
  }
}

/**
 * @param {{ channel?: string, status?: string, limit?: number }} [filters]
 */
function getNotificationLogs(filters = {}) {
  let results = [...memoryLogs]

  if (filters.channel) {
    const ch = String(filters.channel).toLowerCase()
    results = results.filter((log) => log.channel === ch)
  }

  if (filters.status) {
    const st = String(filters.status).toLowerCase()
    if (VALID_STATUSES.includes(st)) {
      results = results.filter((log) => log.status === st)
    }
  }

  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 100
  results = results.slice(0, limit)

  return {
    total: memoryLogs.length,
    count: results.length,
    logs: results,
  }
}

function toPublicResponse(entry) {
  return {
    id: entry.id,
    status: entry.status,
    channel: entry.channel,
    target: entry.target,
    type: entry.type,
    message: entry.message,
    sentAt: entry.sentAt,
    mock: entry.mock,
  }
}

/** Test helper — clear in-memory store */
function clearNotificationLogs() {
  memoryLogs.length = 0
}

module.exports = {
  VALID_CHANNELS,
  VALID_STATUSES,
  validateSendInput,
  sendNotification,
  listNotifications,
  getNotificationLogs,
  toPublicResponse,
  clearNotificationLogs,
}
