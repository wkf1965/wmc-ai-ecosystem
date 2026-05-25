/**
 * Workflow concurrency — one active flow per chatId:userId.
 * Prevents duplicate message processing and overlapping steps.
 */

/** @type {Map<string, boolean>} */
export const workflowLocks = new Map()

/** @type {Set<string>} */
const processedMessages = new Set()

const DEDUP_TTL_MS = 10 * 60 * 1000
/** @type {Map<string, number>} messageKey → expiresAt */
const dedupExpiry = new Map()

function messageKey(msg) {
  const chatId = msg?.chat?.id ?? 'unknown'
  const userId = msg?.from?.id ?? chatId
  const messageId = msg?.message_id ?? 'unknown'
  return `${chatId}:${userId}:${messageId}`
}

function sessionKeyFromMsg(msg) {
  const chatId = msg?.chat?.id
  const userId = msg?.from?.id ?? chatId
  return `${chatId}:${userId}`
}

function pruneDedup() {
  const now = Date.now()
  for (const [key, expiresAt] of dedupExpiry) {
    if (expiresAt <= now) {
      dedupExpiry.delete(key)
      processedMessages.delete(key)
    }
  }
}

export function hasProcessedMessage(msg) {
  pruneDedup()
  return processedMessages.has(messageKey(msg))
}

export function markMessageProcessed(msg) {
  pruneDedup()
  const key = messageKey(msg)
  processedMessages.add(key)
  dedupExpiry.set(key, Date.now() + DEDUP_TTL_MS)
}

/**
 * Returns false when this Telegram message was already handled.
 * @param {import('node-telegram-bot-api').Message} msg
 */
export function shouldProcessMessage(msg) {
  if (hasProcessedMessage(msg)) {
    console.log('[workflow] duplicate prevented', sessionKeyFromMsg(msg), 'message_id', msg.message_id)
    return false
  }
  console.log('[workflow] message received', sessionKeyFromMsg(msg), 'message_id', msg.message_id)
  return true
}

export function acquireWorkflowLock(key) {
  if (workflowLocks.get(key)) {
    console.log('[workflow] duplicate prevented', key, 'lock busy')
    return false
  }
  workflowLocks.set(key, true)
  console.log('[workflow] lock acquired', key)
  return true
}

export function releaseWorkflowLock(key) {
  if (workflowLocks.get(key)) {
    workflowLocks.delete(key)
    console.log('[workflow] lock released', key)
  }
}

export async function withWorkflowLock(msg, fn) {
  const key = sessionKeyFromMsg(msg)
  if (!acquireWorkflowLock(key)) return undefined
  try {
    return await fn()
  } finally {
    releaseWorkflowLock(key)
  }
}
