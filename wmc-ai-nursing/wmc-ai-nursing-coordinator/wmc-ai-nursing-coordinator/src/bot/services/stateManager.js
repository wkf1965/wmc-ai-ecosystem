/**
 * Workflow State Manager
 *
 * Persistent sessions keyed by chatId + userId so group chats keep
 * per-nurse workflow state. Survives bot restarts via JSON file.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dir, '../data')
const FILE = resolve(DATA_DIR, 'workflowSessions.json')

/** @type {Map<string, object>} */
const sessions = new Map()

/** @type {Map<string, Promise>} */
const locks = new Map()

function touchSessionMeta(state, msgOrKey) {
  if (typeof msgOrKey === 'object' && msgOrKey?.chat) {
    state.chatId = msgOrKey.chat.id
    state.userId = msgOrKey.from?.id ?? msgOrKey.chat.id
    if (!state.nurseInfo || Object.keys(state.nurseInfo).length === 0) {
      state.nurseInfo = nurseInfoFromMsg(msgOrKey)
    }
  }
  if (state.awaitingReply == null) state.awaitingReply = true
  if (state.processing == null) state.processing = false
  if (state.sessionGeneration == null) state.sessionGeneration = 0
  if (state.lastCommandWarnKey == null) state.lastCommandWarnKey = null
  return state
}

function persist() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(FILE, JSON.stringify(Object.fromEntries(sessions), null, 2), 'utf8')
    console.log('[workflow] save', `${sessions.size} session(s) persisted`)
  } catch (err) {
    console.error('[workflow] save failed', err.message)
  }
}

function loadSessions() {
  try {
    if (!existsSync(FILE)) return
    const entries = JSON.parse(readFileSync(FILE, 'utf8'))
    for (const [key, state] of Object.entries(entries ?? {})) {
      const normalized = touchSessionMeta({
        ...state,
        processing: false,
        awaitingReply: state.awaitingConfirmation ? true : (state.awaitingReply ?? true),
      })
      sessions.set(key, normalized)
      console.log('[workflow] restored', key, normalized.workflow, 'step', normalized.step)
    }
  } catch {
    /* fresh start */
  }
}

loadSessions()

/**
 * Composite session key for group + private chats.
 * @param {import('node-telegram-bot-api').Message} msg
 */
export function getSessionKey(msg) {
  const chatId = msg?.chat?.id
  if (chatId == null) throw new Error('getSessionKey requires msg.chat.id')
  const userId = msg.from?.id ?? chatId
  return `${chatId}:${userId}`
}

function resolveKey(msgOrKey) {
  if (typeof msgOrKey === 'string') return msgOrKey
  if (typeof msgOrKey === 'number') return String(msgOrKey)
  if (msgOrKey?.chat?.id != null) return getSessionKey(msgOrKey)
  return String(msgOrKey)
}

function nurseInfoFromMsg(msg) {
  return {
    chatId: String(msg.chat.id),
    userId: String(msg.from?.id ?? msg.chat.id),
    username: msg.from?.username ?? '',
    firstName: msg.from?.first_name ?? 'Nurse',
  }
}

/**
 * Serialize async handlers for one nurse session.
 * @template T
 * @param {import('node-telegram-bot-api').Message|string} msgOrKey
 * @param {() => Promise<T>|T} fn
 * @returns {Promise<T>}
 */
export function withSessionLock(msgOrKey, fn) {
  const key = resolveKey(msgOrKey)
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev
    .catch(() => {})
    .then(() => fn())
  locks.set(key, run)
  return run.finally(() => {
    if (locks.get(key) === run) locks.delete(key)
  })
}

export function beginProcessing(msgOrKey) {
  const key = resolveKey(msgOrKey)
  const current = sessions.get(key)
  if (!current || current.processing) return false
  sessions.set(key, touchSessionMeta({ ...current, processing: true, awaitingReply: false }, msgOrKey))
  persist()
  return true
}

export function finishProcessing(msgOrKey, patch = {}) {
  const key = resolveKey(msgOrKey)
  const current = sessions.get(key)
  if (!current) return
  sessions.set(key, touchSessionMeta({
    ...current,
    ...patch,
    processing: false,
  }, msgOrKey))
  persist()
}

export function patchSession(msgOrKey, patch) {
  const key = resolveKey(msgOrKey)
  const current = sessions.get(key)
  if (!current) return null
  const next = touchSessionMeta({ ...current, ...patch }, msgOrKey)
  sessions.set(key, next)
  persist()
  return next
}

export function setAwaitingReply(msgOrKey, awaitingReply = true) {
  const key = resolveKey(msgOrKey)
  const current = sessions.get(key)
  if (!current) return
  sessions.set(key, { ...current, awaitingReply, processing: false })
  persist()
  console.log('[workflow] current step', key, current.workflow, 'step', current.step, 'awaitingReply', awaitingReply)
}

/**
 * @param {import('node-telegram-bot-api').Message|string|number} msgOrKey
 */
export function getState(msgOrKey) {
  const state = sessions.get(resolveKey(msgOrKey)) ?? null
  if (!state) return null
  if (state.step == null && !state.flow && !state.workflow && !state.pendingInventory) return null
  return state
}

/**
 * Start or replace a workflow session.
 * Supports both positional nursing-workflow args and full object updates.
 */
export function setState(msgOrKey, workflowOrState, step = 0, data = {}, nurseInfo = {}) {
  const key = resolveKey(msgOrKey)
  let state

  if (
    typeof workflowOrState === 'object'
    && workflowOrState !== null
    && 'workflow' in workflowOrState
  ) {
    state = touchSessionMeta({
      awaitingConfirmation: false,
      awaitingReply: false,
      processing: false,
      sessionGeneration: 0,
      lastProcessedMessageId: null,
      startedAt: new Date().toISOString(),
      flow: workflowOrState.flow ?? workflowOrState.workflow ?? null,
      pendingInventory: workflowOrState.pendingInventory ?? null,
      ...workflowOrState,
    }, msgOrKey)
  } else {
    state = touchSessionMeta({
      workflow: workflowOrState,
      step,
      data,
      nurseInfo,
      awaitingConfirmation: false,
      awaitingReply: false,
      processing: false,
      sessionGeneration: 0,
      lastProcessedMessageId: null,
      startedAt: new Date().toISOString(),
    }, msgOrKey)
  }

  sessions.set(key, state)
  persist()
  console.log('[workflow] started', key, state.workflow, 'step', state.step)
}

/**
 * @param {import('node-telegram-bot-api').Message|string|number} msgOrKey
 * @param {object} [newData={}]
 */
export function nextStep(msgOrKey, newData = {}) {
  const key = resolveKey(msgOrKey)
  const current = sessions.get(key)
  if (!current) return

  const next = touchSessionMeta({
    ...current,
    step: current.step + 1,
    data: { ...current.data, ...newData },
    sessionGeneration: (current.sessionGeneration ?? 0) + 1,
    awaitingReply: false,
    processing: false,
    lastProcessedMessageId: current.lastProcessedMessageId ?? null,
  }, msgOrKey)
  sessions.set(key, next)
  persist()
  console.log('[workflow] current step', key, next.workflow, 'step', next.step)
}

/**
 * @param {import('node-telegram-bot-api').Message|string|number} msgOrKey
 */
export function setAwaitingConfirmation(msgOrKey) {
  const key = resolveKey(msgOrKey)
  const current = sessions.get(key)
  if (!current) return
  sessions.set(key, {
    ...current,
    awaitingConfirmation: true,
    awaitingReply: true,
    processing: false,
  })
  persist()
  console.log('[workflow] current step', key, current.workflow, 'awaiting confirmation')
}

/**
 * Clear flow-related session fields, then remove the session entirely.
 * @param {import('node-telegram-bot-api').Message|string|number} msgOrKey
 * @param {string} [reason='cleared']
 */
export function clearSessionFlowFields(msgOrKey, reason = 'cleared') {
  const key = resolveKey(msgOrKey)
  const current = sessions.get(key)
  if (!current) return

  const cleared = {
    ...current,
    step: null,
    flow: null,
    workflow: null,
    pendingInventory: null,
    awaitingConfirmation: false,
    awaitingReply: false,
    processing: false,
    answers: null,
    subtype: null,
  }
  sessions.set(key, cleared)
  console.log('[workflow] session cleared', key, reason, {
    step: cleared.step,
    flow: cleared.flow,
    pendingInventory: cleared.pendingInventory,
  })
  sessions.delete(key)
  persist()
}

/**
 * @param {import('node-telegram-bot-api').Message|string|number} msgOrKey
 * @param {string} [reason='cleared']
 */
export function clearState(msgOrKey, reason = 'cleared') {
  clearSessionFlowFields(msgOrKey, reason)
}

/**
 * Finish an inventory workflow — ensures no stale inventory session remains.
 * @param {import('node-telegram-bot-api').Message|string|number} msgOrKey
 * @param {string} [reason='inventory complete']
 */
export function finishInventorySession(msgOrKey, reason = 'inventory complete') {
  clearSessionFlowFields(msgOrKey, reason)
}

/**
 * @param {import('node-telegram-bot-api').Message|string|number} msgOrKey
 */
export function hasActiveSession(msgOrKey) {
  return sessions.has(resolveKey(msgOrKey))
}

/**
 * Block command handlers while a workflow is active.
 * @returns {boolean} true when blocked
 */
export async function blockIfActiveWorkflow(msg, bot) {
  const state = getState(msg)
  if (!state?.workflow && !state?.flow) return false

  const { safeSendMessage } = await import('../utils/safeMessage.js')
  const { shouldShowCommandWarning, markCommandWarningShown, prepareSessionForResume } = await import('./workflowResume.js')

  prepareSessionForResume(msg)
  const fresh = getState(msg)
  if (!fresh?.workflow) return false

  if (shouldShowCommandWarning(msg)) {
    const workflowName = typeof fresh.workflow === 'string' ? fresh.workflow : 'workflow'
    await safeSendMessage(
      bot,
      msg.chat.id,
      [
        `⚠️ You have an active <b>${workflowName}</b> workflow in progress.`,
        '',
        'Please continue answering the current question, or send /cancel to stop.',
        'Send /status to see the current step.',
      ].join('\n'),
      { parse_mode: 'HTML' },
    )
    markCommandWarningShown(msg)
  }

  setAwaitingReply(msg, true)
  return true
}

export function listActiveSessions() {
  return Array.from(sessions.entries()).map(([key, state]) => ({
    key,
    chatId: state.chatId,
    userId: state.userId,
    workflow: state.workflow,
    step: state.step,
    awaitingConfirmation: state.awaitingConfirmation,
    startedAt: state.startedAt,
  }))
}

/** Admin reset — clears all in-memory workflow sessions and persists empty file. */
export function clearAllSessions() {
  const count = sessions.size
  sessions.clear()
  locks.clear()
  persist()
  console.log('[workflow] cleared all sessions', count)
  return count
}
