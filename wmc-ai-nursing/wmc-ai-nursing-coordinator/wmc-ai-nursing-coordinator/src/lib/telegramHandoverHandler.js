/**
 * Telegram /handover command handler.
 *
 * Triggered when a nurse sends "/handover" (optionally followed by a shift keyword:
 *   /handover morning | /handover evening | /handover night).
 *
 * Data sources (in priority order):
 *   1. telegram-nursing-memory.json  — all Telegram-sourced nursing events today
 *   2. Google Sheet nursing_notes tab — formal sheet entries for today (if Sheet is live)
 *
 * Returns the formatted handover report string for Telegram reply.
 */

import { runHandoverPipeline } from './shiftHandoverEngine.js'
import { readTelegramNursingMemoryState } from '../../telegramNursingMemory.mjs'
import { fetchNursingNotesFromGoogleSheet } from '../../sheetWebhookRead.mjs'

/**
 * Detect whether the incoming text is the /handover command.
 * Accepts: "/handover", "/handover morning", "/handover night", etc.
 * @param {string} text
 * @returns {boolean}
 */
export function isTelegramHandoverCommand(text) {
  return /^\/handover\b/i.test(String(text || '').trim())
}

/**
 * Fetch today's nursing notes from Google Sheet (fails gracefully).
 * @returns {Promise<object[]>}
 */
async function loadSheetNotes() {
  try {
    const result = await fetchNursingNotesFromGoogleSheet()
    if (result.ok && Array.isArray(result.rows)) {
      return result.rows
    }
    console.log('[handover] Sheet notes unavailable:', result.error || 'unknown error')
    return []
  } catch (err) {
    console.log('[handover] Sheet fetch error:', String(err?.message || err))
    return []
  }
}

/**
 * Fetch all entries from the local nursing memory store (fails gracefully).
 * @returns {Promise<object[]>}
 */
async function loadMemoryEntries() {
  try {
    const state = await readTelegramNursingMemoryState()
    return Array.isArray(state.entries) ? state.entries : []
  } catch (err) {
    console.log('[handover] Memory read error:', String(err?.message || err))
    return []
  }
}

/**
 * Handle the /handover command end-to-end.
 *
 * @param {string} commandText — the full message text (e.g. "/handover night")
 * @returns {Promise<string>} — Telegram reply text
 */
export async function handleHandoverCommand(commandText) {
  console.log('[handover] command triggered:', commandText)

  // Fetch data sources in parallel
  const [memoryEntries, sheetNotes] = await Promise.all([
    loadMemoryEntries(),
    loadSheetNotes(),
  ])

  console.log('[handover] memory entries loaded:', memoryEntries.length)
  console.log('[handover] sheet notes loaded:', sheetNotes.length)

  const { report, totalEntries, shift } = runHandoverPipeline(memoryEntries, sheetNotes, {
    commandText,
    now: new Date(),
  })

  console.log('[handover] report generated:', { shift: shift.key, totalEntries })

  return report
}
