/**
 * /ot_out — End overtime
 *
 * Safety rules:
 *   ✖ Must have started OT with /ot_in first.
 *
 * After OT-out:
 *   - Computes ot_hours and ot_amount.
 *   - Upserts the COMPLETE record (normal + OT) to Google Sheet.
 *   - Clears state (session complete for the day).
 *   - Replies with OT summary.
 */

import { log }                    from '../utils/logger.js'
import { getState, clearState }   from '../state/activePunchMap.js'
import { upsertAttendanceRecord } from '../services/attendanceSheetService.js'
import {
  buildAttendanceRecord,
  computeOtHours,
  computeOtAmount,
  fmtOtOut,
  nowHhmm,
  DEFAULT_OT_RATE,
} from '../../lib/attendanceCalculation.js'

export function registerOtOutCommand(bot) {
  bot.onText(/^\/ot_out\b/i, async (msg) => {
    const chatId   = msg.chat.id
    const existing = getState(chatId)

    // ── Must have started OT ─────────────────────────────────────────────
    if (!existing || !existing.ot_in) {
      await bot.sendMessage(chatId,
        `⚠️ No active overtime found.\n\nUse /ot_in to start overtime first.`,
      )
      return
    }

    // ── Compute OT ───────────────────────────────────────────────────────
    const ot_out    = nowHhmm()
    const ot_rate   = existing.ot_rate ?? DEFAULT_OT_RATE
    const ot_hours  = computeOtHours(existing.ot_in, ot_out)
    const ot_amount = computeOtAmount(ot_hours, ot_rate)

    // Build complete record
    const record = buildAttendanceRecord({
      ...existing,
      ot_out,
      ot_rate,
    })

    // Clear state immediately (prevents duplicate /ot_out)
    clearState(chatId)

    // ── Save to Google Sheet ─────────────────────────────────────────────
    try {
      await upsertAttendanceRecord(record)
      log.info(`[ot_out] saved — staff:${record.staff_name} ot_hours:${ot_hours} ot_amount:${ot_amount}`)
    } catch (err) {
      log.warn('[ot_out] sheet save failed:', err?.message)
      await bot.sendMessage(chatId,
        `⚠️ OT recorded but could not sync to Google Sheet.\n` +
        `Please inform your supervisor: OT ${existing.ot_in}–${ot_out} (${ot_hours}h, RM${ot_amount})`,
      )
    }

    // ── Reply ────────────────────────────────────────────────────────────
    await bot.sendMessage(
      chatId,
      fmtOtOut(existing.staff_name, existing.ot_in, ot_out, ot_hours, ot_amount),
      { parse_mode: 'Markdown' },
    )
  })
}
