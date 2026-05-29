/**
 * Turning Photo Session Manager
 *
 * Tracks the 2-step turning workflow state per chatId:
 *   awaiting_room  → nurse sent /turn_right (no room) — waiting for room number
 *
 * Once the room is received, this session is cleared and the standard
 * turningPhotoPendingStore takes over for the awaiting_photo step.
 *
 * Sessions auto-expire after SESSION_TIMEOUT_MS of inactivity.
 */

const SESSION_TIMEOUT_MS = 10 * 60 * 1000  // 10 minutes

/** @type {Map<string, object>} */
const sessions = new Map()

/**
 * Create or replace the turning session for a chatId.
 * @param {string|number} chatId
 * @param {{ chatId: string, userId: string, command: string, position: string, nurseName: string, state: string }} data
 */
export function setTurningSession(chatId, data) {
  const key = String(chatId)
  const session = { ...data, createdAt: Date.now() }
  sessions.set(key, session)
  console.log(`[turning-session] SET chatId=${key} state=${data.state} position="${data.position}" nurse="${data.nurseName}"`)
  console.log(`[turning-session] currentSessionState:`, JSON.stringify(session))
}

/**
 * Get the active turning session for a chatId.
 * Returns null if no session or session has expired.
 * @param {string|number} chatId
 * @returns {object|null}
 */
export function getTurningSession(chatId) {
  const key = String(chatId)
  const session = sessions.get(key)
  if (!session) return null
  if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
    sessions.delete(key)
    console.log(`[turning-session] EXPIRED chatId=${key}`)
    return null
  }
  console.log(`[turning-session] GET chatId=${key} state=${session.state}`)
  return session
}

/**
 * Clear the turning session for a chatId (called after room input or /cancel).
 * @param {string|number} chatId
 */
export function clearTurningSession(chatId) {
  const key = String(chatId)
  const existed = sessions.has(key)
  sessions.delete(key)
  if (existed) {
    console.log(`[turning-session] CLEARED chatId=${key}`)
  }
}

/**
 * Returns true if chatId has an active turning session.
 * @param {string|number} chatId
 */
export function hasTurningSession(chatId) {
  return getTurningSession(chatId) !== null
}

/**
 * Return all active sessions (for debugging).
 */
export function getAllTurningSessions() {
  const result = {}
  for (const [key, session] of sessions.entries()) {
    if (Date.now() - session.createdAt <= SESSION_TIMEOUT_MS) {
      result[key] = session
    }
  }
  return result
}
