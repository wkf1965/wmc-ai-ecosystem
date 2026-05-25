/**
 * /ot_in — Start overtime
 *
 * Safety rules:
 *   ✖ Must have completed normal punch-out first.
 *   ✖ Prevent double OT-in on the same day.
 */

import { log }                  from '../utils/logger.js'
import { getState, patchState } from '../state/activePunchMap.js'
import {
  fmtOtIn,
  nowHhmm,
  todayString,
} from '../../lib/attendanceCalculation.js'

export function registerOtInCommand(bot) {
  bot.onText(/^\/ot_in\b/i, async (msg) => {
    const chatId   = msg.chat.id
    const today    = todayString()
    const existing = getState(chatId)

    // ── Must punch out from normal shift first ───────────────────────────
    if (!existing || !existing.normal_punch_in) {
      await bot.sendMessage(chatId,
        `⚠️ You have not started a normal shift today.\n\nPlease /punchin first, then /punchout before starting OT.`,
      )
      return
    }

    if (!existing.normal_punch_out) {
      await bot.sendMessage(chatId,
        `⚠️ You must punch out from normal duty first.\n\nUse /punchout to end your normal shift, then /ot_in.`,
      )
      return
    }

    // ── Prevent double OT-in ─────────────────────────────────────────────
    if (existing.ot_in) {
      await bot.sendMessage(chatId,
        `⚠️ OT already started at ${existing.ot_in}.\n\nUse /ot_out when overtime ends.`,
      )
      return
    }

    // ── Record OT start ──────────────────────────────────────────────────
    const ot_in = nowHhmm()
    patchState(chatId, { ot_in })

    log.info(`[ot_in] ${existing.staff_name} at ${ot_in}`)
    await bot.sendMessage(chatId, fmtOtIn(existing.staff_name, ot_in), { parse_mode: 'Markdown' })
  })
}
