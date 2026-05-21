/**
 * Telegram /timeline command handler.
 *
 * Supported invocations:
 *   /timeline                  — full report for all patients (last 7 days)
 *   /timeline Room 2           — single room timeline
 *   /timeline Ali              — single patient timeline by name (partial match)
 *   /timeline 3d               — all patients, last 3 days window
 *   /timeline 14d              — all patients, last 14 days window
 *   /timeline Room 5 7d        — room filter + day window
 *
 * Data source: telegram-nursing-memory.json (local store, all Telegram nursing events).
 */

import { runTimelinePipeline } from './patientTimelineMemory.js'
import { readTelegramNursingMemoryState } from '../../telegramNursingMemory.mjs'

/** Default look-back window when no explicit day count is given. */
const DEFAULT_MAX_DAYS = 7

/**
 * Detect whether the incoming text is a /timeline command.
 * @param {string} text
 * @returns {boolean}
 */
export function isTelegramTimelineCommand(text) {
  return /^\/timeline\b/i.test(String(text || '').trim())
}

/**
 * Parse /timeline command arguments.
 *
 * @param {string} commandText — e.g. "/timeline Room 2 7d" or "/timeline Ali"
 * @returns {{ filterRoom: string|null, filterName: string|null, maxDays: number }}
 */
export function parseTimelineCommandArgs(commandText) {
  // Strip the /timeline prefix
  const args = String(commandText || '')
    .replace(/^\/timeline\b/i, '')
    .trim()

  let filterRoom = null
  let filterName = null
  let maxDays = DEFAULT_MAX_DAYS

  if (!args) return { filterRoom, filterName, maxDays }

  // Extract day window: "7d", "14d", "3d", "30d"
  const dayMatch = args.match(/\b(\d+)d\b/i)
  if (dayMatch) {
    const parsed = parseInt(dayMatch[1], 10)
    if (parsed > 0 && parsed <= 365) maxDays = parsed
  }
  const argsWithoutDays = args.replace(/\b\d+d\b/gi, '').trim()

  // Extract room: "Room 2", "room2", "rm 5", "#3"
  const roomMatch = argsWithoutDays.match(
    /\b(?:room|rm\.?|bed|ward)\s*[#:]?\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)\b/i,
  ) || argsWithoutDays.match(/^#?([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)$/)

  if (roomMatch?.[1] && /\d/.test(roomMatch[1])) {
    filterRoom = roomMatch[1].trim().toUpperCase()
  } else if (argsWithoutDays && !roomMatch) {
    // Treat remaining text as a name filter
    filterName = argsWithoutDays.trim()
  }

  return { filterRoom, filterName, maxDays }
}

/**
 * Load all entries from the local nursing memory store (fails gracefully).
 * @returns {Promise<object[]>}
 */
async function loadAllMemoryEntries() {
  try {
    const state = await readTelegramNursingMemoryState()
    return Array.isArray(state.entries) ? state.entries : []
  } catch (err) {
    console.log('[timeline] Memory read error:', String(err?.message || err))
    return []
  }
}

/**
 * Handle the /timeline command end-to-end.
 *
 * @param {string} commandText — raw message text (e.g. "/timeline Room 2 7d")
 * @returns {Promise<string>} — Telegram reply text
 */
export async function handleTimelineCommand(commandText) {
  console.log('[timeline] command triggered:', commandText)

  const { filterRoom, filterName, maxDays } = parseTimelineCommandArgs(commandText)

  const rawEntries = await loadAllMemoryEntries()
  console.log('[timeline] total memory entries:', rawEntries.length)

  const { report, total } = runTimelinePipeline(rawEntries, {
    filterRoom,
    filterName,
    maxDays,
    now: new Date(),
  })

  console.log('[timeline] timelines generated:', total, {
    filterRoom,
    filterName,
    maxDays,
  })

  return report
}
