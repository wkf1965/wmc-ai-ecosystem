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
      `📋 *Attendance — ${dateLabel}*`,
      '',
    ]

    // ── Currently on duty (live state) ────────────────────────────────────
    if (onDuty.length > 0) {
      lines.push('🟢 *On Duty*')
      for (const s of onDuty) {
        lines.push(`  ${s.staff_name}  IN: ${formatTime12h(s.normal_punch_in)}`)
      }
      lines.push('')
    }

    // ── Currently in OT (live state) ─────────────────────────────────────
    if (onOt.length > 0) {
      lines.push('🟡 *On OT*')
      for (const s of onOt) {
        lines.push(`  ${s.staff_name}  OT since: ${formatTime12h(s.ot_in)}`)
      }
      lines.push('')
    }

    // ── Completed records from Google Sheet ───────────────────────────────
    if (sheetRecords.length > 0) {
      lines.push('📄 *Completed Records*')
      for (const r of sheetRecords) {
        lines.push(`  ${fmtAttendanceRow(r)}`)
      }
      lines.push('')
    }

    // ── Missing punch-out alerts ──────────────────────────────────────────
    if (stale.length > 0) {
      lines.push('🔴 *Missing Punch Out (previous day)*')
      for (const s of stale) {
        lines.push(`  ${s.staff_name}  ${s.date}  IN: ${formatTime12h(s.normal_punch_in)}`)
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

    await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' })
    log.info(`[attendance] shown — duty:${onDuty.length} ot:${onOt.length} sheet:${sheetRecords.length}`)
  })
}
