/**
 * Form session store — persists multi-step command conversations per Telegram chat.
 *
 * Session lifecycle:
 *   active               → collecting fields step by step
 *   awaiting_confirmation → all fields collected; waiting for YES / NO
 *   completed            → confirmed and saved
 *   cancelled            → user cancelled or replied NO
 *   expired              → TTL elapsed without completion
 *
 * Storage: in-memory Map + JSON file (telegram-command-sessions.json at project root).
 *
 * PostgreSQL-ready:
 *   CREATE TABLE command_sessions (
 *     id UUID PRIMARY KEY,
 *     chat_id TEXT NOT NULL,
 *     command_name TEXT NOT NULL,
 *     current_step INTEGER DEFAULT 0,
 *     collected_data JSONB,
 *     status TEXT DEFAULT 'active',
 *     started_at TIMESTAMPTZ,
 *     expires_at TIMESTAMPTZ
 *   );
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const STORE_PATH = path.join(process.cwd(), 'telegram-command-sessions.json')
const SESSION_TTL_MS = 10 * 60 * 1000 // 10 minutes

/** @type {Map<string, object>} keyed by chatId */
const sessions = new Map()
let loaded = false

async function loadFromDisk() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8')
    const { sessions: saved } = JSON.parse(raw)
    if (Array.isArray(saved)) {
      const now = Date.now()
      for (const s of saved) {
        const alive = s.status === 'active' || s.status === 'awaiting_confirmation'
        if (alive && new Date(s.expires_at).getTime() > now) {
          sessions.set(String(s.chat_id), s)
        }
      }
    }
  } catch {
    // First run or file absent — normal
  }
}

async function saveToDisk() {
  try {
    await fs.writeFile(
      STORE_PATH,
      JSON.stringify({ sessions: Array.from(sessions.values()) }, null, 2),
      'utf8',
    )
  } catch (err) {
    console.error('[session-store] save failed:', err?.message)
  }
}

async function ensureLoaded() {
  if (!loaded) {
    await loadFromDisk()
    loaded = true
  }
}

function ttlDate() {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString()
}

/**
 * Return the active session for a chat, or null if none / expired.
 * @param {string|number} chatId
 * @returns {Promise<object|null>}
 */
export async function getActiveSession(chatId) {
  await ensureLoaded()
  const s = sessions.get(String(chatId))
  if (!s) return null
  const alive = s.status === 'active' || s.status === 'awaiting_confirmation'
  if (!alive || new Date(s.expires_at).getTime() <= Date.now()) {
    sessions.delete(String(chatId))
    return null
  }
  return s
}

/**
 * Start a new form session for a command.
 * @param {string|number} chatId
 * @param {string} commandName  e.g. '/admit'
 * @param {object} [initialData]
 * @returns {Promise<object>}
 */
export async function startSession(chatId, commandName, initialData = {}) {
  await ensureLoaded()
  const session = {
    id: randomUUID(),
    chat_id: String(chatId),
    command_name: commandName,
    current_step: 0,
    collected_data: { ...initialData },
    status: 'active',
    started_at: new Date().toISOString(),
    expires_at: ttlDate(),
  }
  sessions.set(String(chatId), session)
  await saveToDisk()
  return session
}

/**
 * Advance step / update collected data.
 * @param {string|number} chatId
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
export async function updateSession(chatId, updates) {
  await ensureLoaded()
  const s = sessions.get(String(chatId))
  if (!s) return null
  Object.assign(s, updates, { expires_at: ttlDate() })
  sessions.set(String(chatId), s)
  await saveToDisk()
  return s
}

/**
 * Transition session to awaiting_confirmation status.
 * @param {string|number} chatId
 * @param {object} finalData
 * @returns {Promise<object|null>}
 */
export async function setSessionAwaitingConfirmation(chatId, finalData) {
  return updateSession(chatId, {
    status: 'awaiting_confirmation',
    collected_data: finalData,
  })
}

/**
 * Remove a session (completed or cancelled).
 * @param {string|number} chatId
 * @param {'completed'|'cancelled'|'expired'} [status]
 */
export async function clearSession(chatId, status = 'completed') {
  await ensureLoaded()
  const s = sessions.get(String(chatId))
  if (s) {
    s.status = status
    sessions.delete(String(chatId))
    await saveToDisk()
  }
}
