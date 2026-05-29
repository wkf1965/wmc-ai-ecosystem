/**
 * /monthly_ot [YYYY-MM] — Monthly OT Allowance Report
 *
 * Examples:
 *   /monthly_ot          → current month
 *   /monthly_ot 2026-05  → May 2026
 */

import { log } from '../utils/logger.js'
import { formatMonthLabel } from '../../lib/attendanceCalculation.js'

const NURSING_WEB_BASE_URL = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function registerMonthlyOtCommand(bot) {
  bot.onText(/^\/monthly_ot\b/i, async (msg) => {
    const chatId = msg.chat.id
    const raw    = String(msg.text ?? '').replace(/^\/monthly_ot\b/i, '').trim()
    const month  = /^\d{4}-\d{2}$/.test(raw) ? raw : currentYearMonth()

    try {
      const response = await fetch(`${NURSING_WEB_BASE_URL}/api/ot-monthly?month=${month}`)
      if (!response.ok) {
        const err = await response.text().catch(() => '')
        log.warn(`[monthly_ot] fetch failed: ${err.slice(0, 120)}`)
        await bot.sendMessage(chatId, `⚠️ Could not load OT report for ${month}. Please try again.`)
        return
      }

      const payload = await response.json().catch(() => null)
      if (!payload?.ok || !Array.isArray(payload.rows)) {
        await bot.sendMessage(chatId, `⚠️ No OT data available for ${month}.`)
        return
      }

      const { rows, totals } = payload
      const label = formatMonthLabel(month)

      if (rows.length === 0) {
        await bot.sendMessage(chatId, `📊 *Monthly OT Summary — ${label}*\n\nNo completed OT records found.`, { parse_mode: 'Markdown' })
        return
      }

      const lines = [
        `📊 *Monthly OT Summary — ${label}*`,
        '─────────────────────────────',
      ]

      rows.forEach((r, i) => {
        const approvalTag =
          r.approvedAmount > 0  ? '✅ Approved'  :
          r.rejectedAmount > 0  ? '❌ Rejected'  : '🕐 Pending'
        lines.push(
          `${i + 1}. *${r.nurseName}*\n` +
          `   ${r.totalSessions} session(s) · ${r.totalOtHours}h · RM${r.totalOtAllowance.toFixed(2)}\n` +
          `   ${approvalTag} · Payable: RM${r.finalPayable.toFixed(2)}`,
        )
      })

      lines.push('─────────────────────────────')
      lines.push(`Total nurses: ${rows.length}`)
      lines.push(`Total OT hours: ${totals.totalOtHours}h`)
      lines.push(`Total OT allowance: RM${totals.totalOtAllowance.toFixed(2)}`)
      lines.push(`✅ Approved: RM${totals.approvedAmount.toFixed(2)}`)
      lines.push(`🕐 Pending: RM${totals.pendingAmount.toFixed(2)}`)
      lines.push(`❌ Rejected: RM${totals.rejectedAmount.toFixed(2)}`)
      lines.push(`💰 *Final Payable: RM${totals.finalPayable.toFixed(2)}*`)

      log.info(`[monthly_ot] sent report for ${month} (${rows.length} nurses)`)
      await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' })
    } catch (err) {
      log.warn('[monthly_ot] error:', err?.message ?? String(err))
      await bot.sendMessage(chatId, `⚠️ Unable to generate monthly OT report. Please try again.`)
    }
  })
}
