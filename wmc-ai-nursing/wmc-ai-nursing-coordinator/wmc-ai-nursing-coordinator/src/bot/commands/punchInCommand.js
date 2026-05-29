/**
 * /punchin — Start of normal shift
 *
 * Safety rules:
 *   ✖ Prevent double punch-in on the same day.
 *   ✖ If a stale punch from a previous day exists, warn + flag missing punch-out.
 */

import { log }                  from '../utils/logger.js'
import { getState, setState }   from '../state/activePunchMap.js'
import { upsertAttendanceRecord } from '../services/attendanceSheetService.js'
import { syncDutyRosterFromPunchIn } from '../services/dutyRosterAttendanceService.js'
import {
  buildAttendanceRecord,
  fmtPunchIn,
  nowHhmm,
  todayString,
  RECORD_STATUS,
} from '../../lib/attendanceCalculation.js'

const NURSING_WEB_BASE_URL = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

async function syncOtRecordToNursingWeb(action, nurseName) {
  try {
    const response = await fetch(`${NURSING_WEB_BASE_URL}/api/ot-records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, nurseName, source: 'telegram' }),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      log.warn(`[ot-sync] punch in sync failed: ${errorText.slice(0, 120)}`)
      return
    }
    log.info(`[ot-sync] punch in synced: ${nurseName}`)
  } catch (error) {
    log.warn('[ot-sync] punch in sync error:', error?.message ?? String(error))
  }
}

export function registerPunchInCommand(bot) {
  bot.onText(/^\/punchin\b/i, async (msg) => {
    const chatId           = msg.chat.id
    const inputName        = String(msg.text ?? '').replace(/^\/punchin\b/i, '').trim()
    const telegram_username = msg.from?.username ?? ''
    const staff_name       = inputName || (telegram_username ? `@${telegram_username}` : (msg.from?.first_name ?? 'Staff'))
    const today            = todayString()
    const existing         = getState(chatId)

    // ── Prevent double punch-in ──────────────────────────────────────────
    if (existing && existing.date === today && existing.normal_punch_in) {
      await bot.sendMessage(chatId,
        `⚠️ Already punched in at ${existing.normal_punch_in}.\n\nUse /punchout when your shift ends.`,
      )
      return
    }

    // ── Warn about stale previous-day punch ──────────────────────────────
    if (existing && existing.date !== today) {
      log.warn(`[punchin] stale punch for chat:${chatId} — previous date:${existing.date}`)
      // Save the stale record as "Missing Punch Out" to Google Sheet (non-fatal)
      try {
        await upsertAttendanceRecord(buildAttendanceRecord({
          ...existing,
          record_status: RECORD_STATUS.MISSING_PUNCH_OUT,
          remarks:       'Missing punch out — auto-flagged on new punch in',
        }))
      } catch (e) {
        log.warn('[punchin] stale record sheet save failed:', e?.message)
      }
    }

    // ── Record punch-in ──────────────────────────────────────────────────
    const punch_in = nowHhmm()

    setState(chatId, {
      chatId: String(chatId),
      staff_name,
      telegram_username,
      date:             today,
      normal_punch_in:  punch_in,
      normal_punch_out: null,
      ot_in:            null,
    })

    log.info(`[punchin] ${staff_name} at ${punch_in}`)
    await bot.sendMessage(chatId, fmtPunchIn(staff_name, punch_in), { parse_mode: 'Markdown' })
    try {
      await syncDutyRosterFromPunchIn({
        date: today,
        staffName: staff_name,
        punchIn: punch_in,
      })
    } catch (error) {
      log.warn('[punchin] duty roster sync failed:', error?.message ?? String(error))
    }
    await syncOtRecordToNursingWeb('punch_in', staff_name)
  })
}
