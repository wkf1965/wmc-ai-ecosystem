const { randomUUID } = require('crypto')

const VALID_STATUSES = ['sent', 'queued', 'failed']

/** Supported WhatsApp use cases */
const VALID_MESSAGE_TYPES = [
  'Family Update',
  'Supervisor Urgent Alert',
  'Doctor Escalation',
  'CRM New Lead Alert',
  'Appointment Confirmation',
  'Shift Handover Summary',
]

const VALID_RECIPIENT_TYPES = ['Family', 'Supervisor', 'Lead', 'Patient', 'Staff', 'Other']

/** @type {Array<object>} */
const memoryLogs = []

function getMockDelayMs() {
  const configured = Number(process.env.WHATSAPP_MOCK_DELAY_MS ?? process.env.NOTIFICATION_MOCK_DELAY_MS)
  if (!Number.isNaN(configured) && configured >= 0) return configured
  return 350
}

function formatSentAt(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeMessageType(value) {
  const raw = String(value).trim()
  const found = VALID_MESSAGE_TYPES.find((t) => t.toLowerCase() === raw.toLowerCase())
  return found ?? null
}

function validateMockSendInput(body) {
  const errors = []
  if (!body || typeof body !== 'object') {
    return ['Request body must be a JSON object']
  }

  const { to, recipientType, messageType, message } = body

  if (!to || typeof to !== 'string' || !to.trim()) {
    errors.push('to (phone number) is required')
  }
  if (!messageType || !normalizeMessageType(messageType)) {
    errors.push(`messageType must be one of: ${VALID_MESSAGE_TYPES.join(', ')}`)
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    errors.push('message is required')
  }
  if (recipientType) {
    const rt = String(recipientType).trim()
    const ok = VALID_RECIPIENT_TYPES.some((t) => t.toLowerCase() === rt.toLowerCase())
    if (!ok) {
      errors.push(`recipientType must be one of: ${VALID_RECIPIENT_TYPES.join(', ')}`)
    }
  }

  return errors
}

function shouldSimulateFailure() {
  const rate = Number(process.env.WHATSAPP_MOCK_FAIL_RATE ?? process.env.NOTIFICATION_MOCK_FAIL_RATE ?? 0)
  if (Number.isNaN(rate) || rate <= 0) return false
  return Math.random() < Math.min(rate, 1)
}

function buildTemplatePreview(messageType, input) {
  const patient = input.patientName?.trim() ? ` · ${input.patientName.trim()}` : ''
  return `[WMC WhatsApp · ${messageType}${patient}] ${input.message.trim()}`
}

/**
 * @param {object} input
 */
async function mockSend(input) {
  const to = input.to.trim()
  const messageType = normalizeMessageType(input.messageType)
  const recipientType = input.recipientType
    ? VALID_RECIPIENT_TYPES.find(
        (t) => t.toLowerCase() === String(input.recipientType).trim().toLowerCase()
      ) ?? String(input.recipientType).trim()
    : 'Other'
  const patientName = input.patientName?.trim() ?? null
  const message = input.message.trim()
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const preview = buildTemplatePreview(messageType, { patientName, message })

  const queuedEntry = {
    id,
    status: 'queued',
    channel: 'whatsapp',
    to,
    recipientType,
    messageType,
    patientName,
    message,
    preview,
    sentAt: null,
    mock: true,
    createdAt,
  }

  memoryLogs.unshift(queuedEntry)
  await sleep(getMockDelayMs())

  const failed = shouldSimulateFailure()
  const sentAt = failed ? null : formatSentAt(new Date())
  const finalEntry = {
    ...queuedEntry,
    status: failed ? 'failed' : 'sent',
    sentAt,
  }

  const index = memoryLogs.findIndex((log) => log.id === id)
  if (index !== -1) memoryLogs[index] = finalEntry

  if (process.env.NODE_ENV !== 'test') {
    console.info('[MOCK WHATSAPP]', JSON.stringify({ to, messageType, status: finalEntry.status }))
  }

  return finalEntry
}

function toPublicResponse(entry) {
  return {
    id: entry.id,
    status: entry.status,
    channel: entry.channel,
    to: entry.to,
    recipientType: entry.recipientType,
    messageType: entry.messageType,
    patientName: entry.patientName,
    message: entry.message,
    sentAt: entry.sentAt,
    mock: entry.mock,
  }
}

function getWhatsAppLogs(filters = {}) {
  let results = [...memoryLogs]

  if (filters.messageType) {
    const mt = normalizeMessageType(filters.messageType)
    if (mt) results = results.filter((log) => log.messageType === mt)
  }

  if (filters.recipientType) {
    const rt = String(filters.recipientType).toLowerCase()
    results = results.filter((log) => String(log.recipientType).toLowerCase() === rt)
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
    logs: results.map(toPublicResponse),
  }
}

function clearWhatsAppLogs() {
  memoryLogs.length = 0
}

module.exports = {
  VALID_MESSAGE_TYPES,
  VALID_RECIPIENT_TYPES,
  VALID_STATUSES,
  validateMockSendInput,
  mockSend,
  getWhatsAppLogs,
  toPublicResponse,
  clearWhatsAppLogs,
}
