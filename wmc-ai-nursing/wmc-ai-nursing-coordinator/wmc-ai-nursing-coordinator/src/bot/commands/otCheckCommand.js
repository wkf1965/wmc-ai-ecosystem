/**
 * /ot_check — OT Record Check Command
 */

import { getState, setState, clearState, withSessionLock } from '../services/stateManager.js'
import { log }                            from '../utils/logger.js'
import { formatOtCheckReply }             from '../../lib/otPayrollCalculation.js'
import { getOtRecordsByStaffDate }        from '../../db/otPayrollStorage.js'
import { getOtRecordsForMonth }           from '../services/sheetReadService.js'

const WORKFLOW = 'ot_check'

function todayDateString() {
  return new Date().toISOString().slice(0, 10)
}

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str).getTime())
}

async function fetchRecordsForStaffDate(staffName, date) {
  try {
    const month     = date.slice(0, 7)
    const sheetRows = await getOtRecordsForMonth(month)
    const filtered  = sheetRows.filter(
      (r) =>
        r.date === date &&
        (r.staff_name ?? '').toLowerCase().includes(staffName.toLowerCase()),
    )
    if (filtered.length > 0) {
      log.info(`[ot_check] ${filtered.length} record(s) found in sheet for ${staffName} / ${date}`)
      return filtered
    }
  } catch (err) {
    log.warn('[ot_check] sheet read failed, falling back to localStorage:', err?.message)
  }

  return getOtRecordsByStaffDate(staffName, date)
}

export function registerOtCheckCommand(bot) {
  bot.onText(/^\/ot_check\b/i, (msg) => {
    const chatId = msg.chat.id
    setState(msg, WORKFLOW, 0, {})
    bot.sendMessage(
      chatId,
      [
        '🔍 *OT Record Check*',
        '',
        'Enter the *staff name* to look up:',
      ].join('\n'),
      { parse_mode: 'Markdown' },
    )
    log.info(`[ot_check] started by chat:${chatId}`)
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
        setState(msg, WORKFLOW, 1, { staffName: text })
        bot.sendMessage(
          chatId,
          [
            `👤 Staff: *${text}*`,
            '',
            'Enter the *date* to check.',
            'Format: `YYYY-MM-DD`  (e.g. `' + todayDateString() + '`)',
            'Or reply *today*.',
          ].join('\n'),
          { parse_mode: 'Markdown' },
        )
        return
      }

      if (lockedState.step === 1) {
        const { staffName } = lockedState.data
        const date = text.toLowerCase() === 'today' ? todayDateString() : text

        if (!isValidDate(date)) {
          bot.sendMessage(
            chatId,
            `❌ Invalid date format. Please use \`YYYY-MM-DD\` (e.g. \`${todayDateString()}\`).`,
            { parse_mode: 'Markdown' },
          )
          return
        }

        clearState(msg, 'ot_check complete')

        await bot.sendMessage(chatId, '⏳ Looking up OT record…')

        let records
        try {
          records = await fetchRecordsForStaffDate(staffName, date)
        } catch (err) {
          log.error('[ot_check] fetch error:', err?.message)
          bot.sendMessage(chatId, '❌ Could not retrieve records. Please try again later.')
          return
        }

        if (records.length === 0) {
          bot.sendMessage(
            chatId,
            [
              'OT Record Check',
              `Staff: ${staffName}`,
              `Date: ${date}`,
              '',
              'No record found for this staff / date.',
              'The shift may not have been logged yet.',
            ].join('\n'),
          )
          return
        }

        for (const record of records) {
          await bot.sendMessage(chatId, formatOtCheckReply(record))
        }

        log.info(`[ot_check] replied — staff:${staffName} date:${date} records:${records.length}`)
      }
    })
  })
}
