/**
 * /punchout — End of normal shift
 *
 * Safety rules:
 *   ✖ Prevent punch-out without punch-in.
 *   ✖ Prevent punch-out on a different day than punch-in.
 *
 * After punch-out:
 *   - Saves partial record (normal duty only) to Google Sheet.
 *   - Reminds nurse they can start OT with /otin if needed.
 */

import { log }                    from '../utils/logger.js'
import { getState, patchState }   from '../state/activePunchMap.js'
import { upsertAttendanceRecord } from '../services/attendanceSheetService.js'
import { syncDutyRosterFromPunchOut } from '../services/dutyRosterAttendanceService.js'
import {
  buildAttendanceRecord,
  fmtPunchOut,
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
      log.warn(`[ot-sync] punch out sync failed: ${errorText.slice(0, 120)}`)
      return
    }
    log.info(`[ot-sync] punch out synced: ${nurseName}`)
  } catch (error) {
    log.warn('[ot-sync] punch out sync error:', error?.message ?? String(error))
  }
}

async function setOtSyncStatus(nurseName, date, syncStatus, syncError = null) {
  try {
    await fetch(`${NURSING_WEB_BASE_URL}/api/ot-records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'set_sync_status',
        nurseName,
        recordDate: date,
        syncStatus,
        syncError,
      }),
    })
  } catch (error) {
    log.warn('[ot-sync] set sync status error:', error?.message ?? String(error))
  }
}

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
        `⚠️ Already punched out at ${existing.normal_punch_out}.\n\nIf you want to log overtime, use /otin`,
      )
      return
    }

    // ── Record punch-out ─────────────────────────────────────────────────
    const punch_out = nowHhmm()
    patchState(chatId, { normal_punch_out: punch_out })

    // Always sync local backend first so frontend updates even if sheet fails.
    await syncOtRecordToNursingWeb('punch_out', existing.staff_name)

    // Build + save partial record to Google Sheet
    const record = buildAttendanceRecord({
      ...existing,
      normal_punch_out: punch_out,
    })

    try {
      await upsertAttendanceRecord(record)
      await setOtSyncStatus(existing.staff_name, existing.date, 'synced', null)
    } catch (err) {
      await setOtSyncStatus(existing.staff_name, existing.date, 'pending_sync', err?.message ?? String(err))
      log.warn('[punchout] sheet save failed:', err?.message)
    }
    try {
      await syncDutyRosterFromPunchOut({
        date: existing.date,
        staffName: existing.staff_name,
        punchIn: existing.normal_punch_in,
        punchOut: punch_out,
        otHours: 0,
      })
    } catch (error) {
      log.warn('[punchout] duty roster sync failed:', error?.message ?? String(error))
    }

    log.info(`[punchout] ${existing.staff_name} at ${punch_out}`)
    await bot.sendMessage(
      chatId,
      fmtPunchOut(existing.staff_name, existing.normal_punch_in, punch_out),
      { parse_mode: 'Markdown' },
    )
  })
}
