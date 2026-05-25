/**
 * /ot_report — Monthly OT payroll report
 */

import { getState, setState, clearState, withSessionLock } from '../services/stateManager.js'
import { log }                            from '../utils/logger.js'
import { getMonthlyOtSummary }            from '../services/attendanceSheetService.js'
import {
  fmtOtReport,
  formatMonthLabel,
  currentYearMonth,
} from '../../lib/attendanceCalculation.js'

const WORKFLOW = 'ot_report'

export function registerOtReportCommand(bot) {
  bot.onText(/^\/ot_report\b/i, (msg) => {
    const chatId = msg.chat.id
    setState(msg, WORKFLOW, 0, {})
    bot.sendMessage(
      chatId,
      [
        '📊 *OT Monthly Report*',
        '',
        `Enter month (e.g. \`${currentYearMonth()}\`) or reply *this*:`,
      ].join('\n'),
      { parse_mode: 'Markdown' },
    )
  })

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return
    const state = getState(msg)
    if (!state || state.workflow !== WORKFLOW) return

    await withSessionLock(msg, async () => {
      const chatId = msg.chat.id
      const lockedState = getState(msg)
      if (!lockedState || lockedState.workflow !== WORKFLOW) return

      const month = msg.text.trim().toLowerCase() === 'this'
        ? currentYearMonth()
        : msg.text.trim()

      if (!/^\d{4}-\d{2}$/.test(month)) {
        bot.sendMessage(chatId, `❌ Invalid format. Use YYYY-MM (e.g. \`${currentYearMonth()}\`) or *this*.`, { parse_mode: 'Markdown' })
        return
      }

      clearState(msg, 'ot_report complete')

      await bot.sendMessage(chatId, `⏳ Fetching OT records for ${formatMonthLabel(month)}…`)

      let summary = []
      try {
        summary = await getMonthlyOtSummary(month)
      } catch (err) {
        log.warn('[ot_report] fetch failed:', err?.message)
      }

      await bot.sendMessage(chatId, fmtOtReport(summary, month))
      log.info(`[ot_report] sent — month:${month} rows:${summary.length}`)
    })
  })
}
