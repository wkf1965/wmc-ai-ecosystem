/**
 * Active Punch Map — bot-side attendance state
 *
 * Tracks BOTH normal duty and OT per Telegram chatId.
 * Backed by a JSON file so state survives bot restarts.
 *
 * State shape per chatId:
 * {
 *   chatId:             string,
 *   staff_name:         string,   "@username" or first name
 *   telegram_username:  string,   raw username without @
 *   date:               string,   YYYY-MM-DD
 *   normal_punch_in:    string|null,   HH:mm — set by /punchin
 *   normal_punch_out:   string|null,   HH:mm — set by /punchout
 *   ot_in:              string|null,   HH:mm — set by /ot_in
 *   ot_rate:            number,
 *   savedAt:            string,   ISO timestamp
 * }
 *
 * The record is cleared when:
 *   - A new day's /punchin is received (stale record)
 *   - /ot_out is processed (full record saved to sheet)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname }                                   from 'path'
import { fileURLToPath }                                      from 'url'

const __dir    = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dir, '../data')
const FILE     = resolve(DATA_DIR, 'activePunches.json')

/** @type {Map<string, object>} chatId → attendance state */
const map = new Map()

// ── Load from disk on startup ─────────────────────────────────────────────────

try {
  if (existsSync(FILE)) {
    const entries = JSON.parse(readFileSync(FILE, 'utf8'))
    for (const [k, v] of Object.entries(entries ?? {})) map.set(k, v)
  }
} catch { /* fresh start */ }

// ── Persistence ───────────────────────────────────────────────────────────────

function persist() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(FILE, JSON.stringify(Object.fromEntries(map), null, 2), 'utf8')
  } catch { /* non-fatal */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Create or fully replace the state for a chat. */
export function setState(chatId, state) {
  map.set(String(chatId), { ...state, savedAt: new Date().toISOString() })
  persist()
}

/** Partially update the state for a chat (merges into existing). */
export function patchState(chatId, patch) {
  const existing = map.get(String(chatId)) ?? {}
  map.set(String(chatId), { ...existing, ...patch, savedAt: new Date().toISOString() })
  persist()
}

/** Get state for a chat, or null. */
export function getState(chatId) {
  return map.get(String(chatId)) ?? null
}

/** Remove all state for a chat. */
export function clearState(chatId) {
  map.delete(String(chatId))
  persist()
}

/** All states where normal_punch_in is set but normal_punch_out is not (currently on duty). */
export function getOnDutyToday(date) {
  return [...map.values()].filter(
    (s) => s.date === date && s.normal_punch_in && !s.normal_punch_out,
  )
}

/** All states where ot_in is set (currently working OT). */
export function getOnOtToday(date) {
  return [...map.values()].filter(
    (s) => s.date === date && s.ot_in,
  )
}

/** All states from a previous day (stale — potential missing punch-outs). */
export function getStalePunches(today) {
  return [...map.values()].filter((s) => s.date !== today)
}

/** Total number of tracked sessions. */
export function activeCount() {
  return map.size
}
