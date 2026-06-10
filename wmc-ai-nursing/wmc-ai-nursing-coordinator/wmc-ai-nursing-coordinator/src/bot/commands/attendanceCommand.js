/**
 * /attendance — Today's attendance overview
 *
 * Shows:
 *   - Staff currently on normal duty (punch_in, no punch_out)
 *   - Staff currently on OT (ot_in, no ot_out)
 *   - Completed records for today (from Google Sheet)
 *   - Missing punch-out alerts (stale states from previous days)
 */

import { log }                                    from '../utils/logger.js'
import { getOnDutyToday, getOnOtToday,
         getStalePunches }                        from '../state/activePunchMap.js'
import { getTodayRecords }                        from '../services/attendanceSheetService.js'
import {
  formatTime12h,
  fmtAttendanceRow,
  todayString,
  RECORD_STATUS,
} from '../../lib/attendanceCalculation.js'

/**
 * Strip characters that break Telegram legacy Markdown parsing.
 * Legacy Markdown does not support backslash escaping, so any unbalanced
 * `* _ ` [` in dynamic data (e.g. a staff name) throws
 * "can't parse entities". Removing them from interpolated values is safe.
 */
function mdSafe(value) {
  return String(value ?? '').replace(/[*_`[\]]/g, '')
}

export function registerAttendanceCommand(bot) {
  bot.onText(/^\/attendance\b/i, async (msg) => {
    const chatId = msg.chat.id
    const today  = todayString()

    await bot.sendMessage(chatId, '⏳ Fetching attendance…')

    const onDuty  = getOnDutyToday(today)
    const onOt    = getOnOtToday(today)
    const stale   = getStalePunches(today)

    let sheetRecords = []
    try {
      sheetRecords = await getTodayRecords()
    } catch (err) {
      log.warn('[attendance] sheet read failed:', err?.message)
    }

    const dateLabel = new Date(`${today}T00:00:00`).toLocaleDateString('en-MY', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur',
    })

    const lines = [
      `📋 *Attendance — ${mdSafe(dateLabel)}*`,
      '',
    ]

    // ── Currently on duty (live state) ────────────────────────────────────
    if (onDuty.length > 0) {
      lines.push('🟢 *On Duty*')
      for (const s of onDuty) {
        lines.push(`  ${mdSafe(s.staff_name)}  IN: ${mdSafe(formatTime12h(s.normal_punch_in))}`)
      }
      lines.push('')
    }

    // ── Currently in OT (live state) ─────────────────────────────────────
    if (onOt.length > 0) {
      lines.push('🟡 *On OT*')
      for (const s of onOt) {
        lines.push(`  ${mdSafe(s.staff_name)}  OT since: ${mdSafe(formatTime12h(s.ot_in))}`)
      }
      lines.push('')
    }

    // ── Completed records from Google Sheet ───────────────────────────────
    if (sheetRecords.length > 0) {
      lines.push('📄 *Completed Records*')
      for (const r of sheetRecords) {
        lines.push(`  ${mdSafe(fmtAttendanceRow(r))}`)
      }
      lines.push('')
    }

    // ── Missing punch-out alerts ──────────────────────────────────────────
    if (stale.length > 0) {
      lines.push('🔴 *Missing Punch Out (previous day)*')
      for (const s of stale) {
        lines.push(`  ${mdSafe(s.staff_name)}  ${mdSafe(s.date)}  IN: ${mdSafe(formatTime12h(s.normal_punch_in))}`)
      }
      lines.push('')
    }

    // ── Summary ───────────────────────────────────────────────────────────
    const total = onDuty.length + onOt.length + sheetRecords.length
    if (total === 0) {
      lines.push('No attendance records found for today.')
    } else {
      const otToday = sheetRecords.reduce((s, r) => s + (Number(r.ot_hours) || 0), 0)
      lines.push('─────────────────────────────')
      lines.push(`On duty: ${onDuty.length}  |  On OT: ${onOt.length}  |  Completed: ${sheetRecords.length}`)
      if (otToday > 0) lines.push(`OT hours today: ${Math.round(otToday * 100) / 100}h`)
    }

    const body = lines.join('\n')
    try {
      await bot.sendMessage(chatId, body, { parse_mode: 'Markdown' })
    } catch (err) {
      // Last-resort fallback: send as plain text (strip bold markers) so the
      // nurse always gets the data even if Markdown parsing fails.
      log.warn('[attendance] Markdown send failed, retrying as plain text:', err?.message)
      await bot.sendMessage(chatId, body.replace(/\*/g, ''))
    }
    log.info(`[attendance] shown — duty:${onDuty.length} ot:${onOt.length} sheet:${sheetRecords.length}`)
  })
}
