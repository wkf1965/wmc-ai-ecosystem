/**
 * /punchout — End of normal shift
 *
 * Safety rules:
 *   ✖ Prevent punch-out without punch-in.
 *   ✖ Prevent punch-out on a different day than punch-in.
 *
 * After punch-out:
 *   - Saves partial record (normal duty only) to Google Sheet.
 *   - Reminds nurse they can start OT with /ot_in if needed.
 */

import { log }                    from '../utils/logger.js'
import { getState, patchState }   from '../state/activePunchMap.js'
import { upsertAttendanceRecord } from '../services/attendanceSheetService.js'
import {
  buildAttendanceRecord,
  fmtPunchOut,
  nowHhmm,
  todayString,
  RECORD_STATUS,
} from '../../lib/attendanceCalculation.js'

export function registerPunchOutCommand(bot) {
  bot.onText(/^\/punchout\b/i, async (msg) => {
    const chatId   = msg.chat.id
    const today    = todayString()
    const existing = getState(chatId)

    // ── Must have punched in first ───────────────────────────────────────
    if (!existing || !existing.normal_punch_in) {
      await bot.sendMessage(chatId,
        `⚠️ You have not punched in today.\n\nUse /punchin to start your shift.`,
      )
      return
    }

    // ── Must be same day ─────────────────────────────────────────────────
    if (existing.date !== today) {
      await bot.sendMessage(chatId,
        `⚠️ Your punch-in was on *${existing.date}*, not today.\n\nPlease contact your supervisor to correct the record.`,
        { parse_mode: 'Markdown' },
      )
      return
    }

    // ── Prevent double punch-out ─────────────────────────────────────────
    if (existing.normal_punch_out) {
      await bot.sendMessage(chatId,
        `⚠️ Already punched out at ${existing.normal_punch_out}.\n\nIf you want to log overtime, use /ot_in`,
      )
      return
    }

    // ── Record punch-out ─────────────────────────────────────────────────
    const punch_out = nowHhmm()
    patchState(chatId, { normal_punch_out: punch_out })

    // Build + save partial record to Google Sheet
    const record = buildAttendanceRecord({
      ...existing,
      normal_punch_out: punch_out,
    })

    try {
      await upsertAttendanceRecord(record)
    } catch (err) {
      log.warn('[punchout] sheet save failed:', err?.message)
    }

    log.info(`[punchout] ${existing.staff_name} at ${punch_out}`)
    await bot.sendMessage(
      chatId,
      fmtPunchOut(existing.staff_name, existing.normal_punch_in, punch_out),
      { parse_mode: 'Markdown' },
    )
  })
}
