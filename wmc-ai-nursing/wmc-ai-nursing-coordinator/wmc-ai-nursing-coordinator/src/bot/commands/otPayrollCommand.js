/**
 * /ot_payroll  — OT Payroll Lookup Command
 */

import { getState, setState, clearState, withSessionLock } from '../services/stateManager.js'
import { log }                            from '../utils/logger.js'
import {
  getOtRecordsForMonth,
  getOtPayrollSummary,
}                                         from '../services/sheetReadService.js'
import {
  buildMonthlyPayrollSummary,
  formatPayrollTelegramReply,
  formatMonthLabel,
  currentYearMonth,
}                                         from '../../lib/otPayrollCalculation.js'

const WORKFLOW = 'ot_payroll'

function isValidYearMonth(str) {
  return /^\d{4}-\d{2}$/.test(str)
}

async function fetchOtRecords(month) {
  try {
    const sheetRows = await getOtRecordsForMonth(month)
    if (sheetRows.length > 0) {
      log.info(`[ot_payroll] fetched ${sheetRows.length} records from Google Sheet`)
      return sheetRows
    }
  } catch (err) {
    log.warn('[ot_payroll] sheet read failed, falling back to localStorage:', err?.message)
  }
  try {
    const { getOtRecordsForMonth: localRead } = await import('../../db/otPayrollStorage.js')
    return localRead(month)
  } catch {
    return []
  }
}

export function registerOtPayrollCommand(bot) {
  bot.onText(/^\/ot_payroll\b/i, (msg) => {
    const chatId   = msg.chat.id
    const thisMonth = currentYearMonth()
    setState(msg, WORKFLOW, 0, {})
    bot.sendMessage(
      chatId,
      [
        '🧾 *OT Payroll Lookup*',
        '',
        'Enter the month to look up.',
        `Format: \`YYYY-MM\`  (e.g. \`${thisMonth}\`)`,
        'Or reply *this* for the current month.',
      ].join('\n'),
      { parse_mode: 'Markdown' },
    )
    log.info(`[ot_payroll] started by chat:${chatId}`)
  })

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return
    const state = getState(msg)
    if (!state || state.workflow !== WORKFLOW) return

    await withSessionLock(msg, async () => {
      const chatId = msg.chat.id
      const lockedState = getState(msg)
      if (!lockedState || lockedState.workflow !== WORKFLOW) return

      const text = msg.text.trim()

      if (lockedState.step === 0) {
        const month = text.toLowerCase() === 'this' ? currentYearMonth() : text

        if (!isValidYearMonth(month)) {
          bot.sendMessage(
            chatId,
            `❌ Invalid format. Please enter \`YYYY-MM\` (e.g. \`${currentYearMonth()}\`) or *this*.`,
            { parse_mode: 'Markdown' },
          )
          return
        }

        setState(msg, WORKFLOW, 1, { month })
        bot.sendMessage(
          chatId,
          [
            `📅 Month: *${formatMonthLabel(month)}*`,
            '',
            'Enter staff name to look up.',
            'Or reply *all* to see the full payroll summary.',
          ].join('\n'),
          { parse_mode: 'Markdown' },
        )
        return
      }

      if (lockedState.step === 1) {
        const { month } = lockedState.data
        const staffInput = text
        clearState(msg, 'ot_payroll complete')

        await bot.sendMessage(chatId, '⏳ Fetching OT records…')

        let records
        try {
          records = await fetchOtRecords(month)
        } catch (err) {
          log.error('[ot_payroll] fetchOtRecords error:', err?.message)
          bot.sendMessage(chatId, '❌ Could not fetch OT records. Please try again later.')
          return
        }

        const wantAll = staffInput.toLowerCase() === 'all'
        const filtered = wantAll
          ? records
          : records.filter((r) =>
              (r.staff_name ?? '').toLowerCase().includes(staffInput.toLowerCase()),
            )

        const summary = buildMonthlyPayrollSummary(filtered, month)

        if (summary.length === 0) {
          bot.sendMessage(
            chatId,
            [
              '🧾 OT Payroll Summary',
              `Month: ${formatMonthLabel(month)}`,
              `Staff: ${wantAll ? 'All' : staffInput}`,
              '',
              '❌ No *Approved* OT records found.',
              'Check that records exist and approval_status = Approved.',
            ].join('\n'),
            { parse_mode: 'Markdown' },
          )
          return
        }

        for (const row of summary) {
          await bot.sendMessage(chatId, formatPayrollTelegramReply(row, month))
        }

        if (wantAll && summary.length > 1) {
          const grandTotal = summary.reduce((s, r) => s + r.total_ot_amount, 0).toFixed(2)
          await bot.sendMessage(
            chatId,
            [
              `📊 *Grand Total — ${formatMonthLabel(month)}*`,
              `Staff count: ${summary.length}`,
              `Total OT Pay: RM${grandTotal}`,
              '',
              '_Status: For supervisor approval_',
            ].join('\n'),
            { parse_mode: 'Markdown' },
          )
        }

        log.info(`[ot_payroll] summary sent — month:${month} staff:${staffInput} rows:${summary.length}`)
      }
    })
  })
}
