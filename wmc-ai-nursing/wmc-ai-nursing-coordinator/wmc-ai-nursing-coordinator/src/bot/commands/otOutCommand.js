/**
 * /otout — End overtime
 *
 * Safety rules:
 *   ✖ Must have started OT with /otin first.
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
  calculateOT,
  fmtOtOut,
  nowHhmm,
  DEFAULT_OT_RATE,
} from '../../lib/attendanceCalculation.js'

const NURSING_WEB_BASE_URL = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

async function syncOtRecordToNursingWeb(action, nurseName, extra = {}) {
  try {
    const response = await fetch(`${NURSING_WEB_BASE_URL}/api/ot-records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, nurseName, source: 'telegram', ...extra }),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      log.warn(`[ot-sync] OT out sync failed: ${errorText.slice(0, 120)}`)
      return
    }
    log.info(`[ot-sync] OT out synced: ${nurseName}`)
  } catch (error) {
    log.warn('[ot-sync] OT out sync error:', error?.message ?? String(error))
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

export function registerOtOutCommand(bot) {
  bot.onText(/^\/(?:ot_out|otout)\b/i, async (msg) => {
    console.log("OT OUT command received")
    const chatId   = msg.chat.id
    const existing = getState(chatId)
    const inputName = String(msg.text ?? '').replace(/^\/(?:ot_out|otout)\b/i, '').trim()
    const nurseName = inputName || existing?.staff_name || (msg.from?.first_name ?? 'Staff')
    console.log("Finding active OT record for nurse:", nurseName)
    const activeSession = existing?.active_ot_session
      ? {
          ...existing.active_ot_session,
          nurse_name: existing.active_ot_session.nurse_name || nurseName,
          status: existing.active_ot_session.status || 'OT active',
        }
      : existing?.ot_in
        ? {
            nurse_name: existing.staff_name || nurseName,
            ot_punch_in: existing.ot_in,
            ot_rate: existing.ot_rate ?? DEFAULT_OT_RATE,
            status: 'OT active',
          }
        : null
    console.log("Found record:", activeSession)

    // ── Must have started OT ─────────────────────────────────────────────
    if (!existing || !activeSession || !activeSession.ot_punch_in) {
      await bot.sendMessage(chatId,
        `⚠️ No active overtime found.\n\nUse /otin to start overtime first.`,
      )
      return
    }

    // ── Compute OT ───────────────────────────────────────────────────────
    const ot_out  = nowHhmm()
    const ot_rate = Number(activeSession.ot_rate ?? existing.ot_rate ?? DEFAULT_OT_RATE)
    const ot_in   = String(activeSession.ot_punch_in || existing.ot_in || '')

    // Single shared function: round hours to 2dp first, then multiply rate
    const { otHoursRounded: ot_hours, allowanceRounded: ot_amount } = calculateOT(ot_in, ot_out, ot_rate)

    // Build complete record
    const record = buildAttendanceRecord({
      ...existing,
      staff_name: nurseName,
      date: existing?.date || new Date().toISOString().slice(0, 10),
      ot_in,
      ot_out,
      ot_rate,
    })

    // Clear state immediately (prevents duplicate /ot_out)
    clearState(chatId)

    // Pass the bot-computed values so the backend stores exactly what was shown to the nurse.
    await syncOtRecordToNursingWeb('ot_punch_out', nurseName, {
      otHours: ot_hours,
      otAllowance: ot_amount,
      otRate: ot_rate,
      otInHhmm: ot_in,
      otOutHhmm: ot_out,
    })

    // ── Save to Google Sheet ─────────────────────────────────────────────
    try {
      await upsertAttendanceRecord(record)
      await setOtSyncStatus(nurseName, record.date, 'synced', null)
      log.info(`[ot_out] saved — staff:${record.staff_name} ot_hours:${ot_hours} ot_amount:${ot_amount}`)
    } catch (err) {
      await setOtSyncStatus(nurseName, record.date, 'pending_sync', err?.message ?? String(err))
      log.warn(
        `[ot_out] sheet save failed staff:${record.staff_name} date:${record.date} tab:attendance_records reason:${
          err?.message ?? String(err)
        }`,
      )
      await bot.sendMessage(chatId,
        `⚠️ OT recorded but could not sync to Google Sheet.\n` +
        `Record saved locally. Cloud sync pending.\n` +
        `OT ${ot_in}–${ot_out} (${ot_hours}h, RM${ot_amount})`,
      )
    }

    // ── Reply ────────────────────────────────────────────────────────────
    console.log("Saved OT record:", {
      nurse_name: nurseName,
      date: record.date,
      duty_punch_in: record.normal_in ?? '',
      duty_punch_out: record.normal_out ?? '',
      ot_punch_in: ot_in,
      ot_punch_out: ot_out,
      ot_hours,
      ot_rate,
      total_ot_allowance: ot_amount,
    })
    await bot.sendMessage(
      chatId,
      fmtOtOut(nurseName, ot_in, ot_out, ot_hours, ot_amount),
      { parse_mode: 'Markdown' },
    )
  })
}
