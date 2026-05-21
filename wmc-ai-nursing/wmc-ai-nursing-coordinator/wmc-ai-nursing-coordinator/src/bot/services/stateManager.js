/**
 * State Manager — Stage 2
 *
 * Tracks which workflow a nurse is in, the current step, collected data,
 * and whether the session is awaiting confirmation (yes / no).
 *
 * Stage 3+: swap the in-memory Map for Redis or a database.
 *
 * State shape:
 *   {
 *     workflow:             string   — active workflow name e.g. 'vitals'
 *     step:                 number   — current question index
 *     data:                 object   — collected answers so far
 *     awaitingConfirmation: boolean  — true after all questions answered
 *     startedAt:            string   — ISO timestamp
 *   }
 */

/** @type {Map<string, object>} keyed by chatId */
const sessions = new Map()

/**
 * Get the current state for a chat.
 * @param {number|string} chatId
 * @returns {object|null}
 */
export function getState(chatId) {
  return sessions.get(String(chatId)) ?? null
}

/**
 * Start a new workflow session.
 * @param {number|string} chatId
 * @param {string} workflowName
 * @param {number} [step=0]
 * @param {object} [data={}]
 * @param {{ chatId?: string, username?: string, firstName?: string }} [nurseInfo={}]
 */
export function setState(chatId, workflowName, step = 0, data = {}, nurseInfo = {}) {
  sessions.set(String(chatId), {
    workflow: workflowName,
    step,
    data,
    nurseInfo,
    awaitingConfirmation: false,
    startedAt: new Date().toISOString(),
  })
}

/**
 * Save the answer to the current step and advance to the next.
 * @param {number|string} chatId
 * @param {object} [newData={}]
 */
export function nextStep(chatId, newData = {}) {
  const s = sessions.get(String(chatId))
  if (!s) return
  sessions.set(String(chatId), {
    ...s,
    step: s.step + 1,
    data: { ...s.data, ...newData },
  })
}

/**
 * Mark the session as awaiting YES / NO confirmation.
 * @param {number|string} chatId
 */
export function setAwaitingConfirmation(chatId) {
  const s = sessions.get(String(chatId))
  if (!s) return
  sessions.set(String(chatId), { ...s, awaitingConfirmation: true })
}

/**
 * Clear the session (workflow finished or cancelled).
 * @param {number|string} chatId
 */
export function clearState(chatId) {
  sessions.delete(String(chatId))
}

/**
 * @param {number|string} chatId
 * @returns {boolean}
 */
export function hasActiveSession(chatId) {
  return sessions.has(String(chatId))
}

/**
 * Debug helper — list all active sessions.
 * @returns {object[]}
 */
export function listActiveSessions() {
  return Array.from(sessions.entries()).map(([chatId, s]) => ({
    chatId,
    workflow: s.workflow,
    step: s.step,
    awaitingConfirmation: s.awaitingConfirmation,
    startedAt: s.startedAt,
  }))
}
