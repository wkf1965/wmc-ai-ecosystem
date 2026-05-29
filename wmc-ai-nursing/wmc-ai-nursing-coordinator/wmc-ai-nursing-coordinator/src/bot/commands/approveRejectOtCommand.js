/**
 * /approve_ot NurseName [Note]
 * /reject_ot  NurseName [Reason]
 *
 * Supervisor-only commands to approve or reject a nurse's most recent
 * pending OT completed record.
 *
 * Examples:
 *   /approve_ot Wong
 *   /approve_ot Wong Good work
 *   /reject_ot  Wong Late OT request
 */

import { log } from '../utils/logger.js'

const NURSING_WEB_BASE_URL = (process.env.WMC_NURSING_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

async function setApproval(nurseName, approvalStatus, approvedBy, extra = {}) {
  const response = await fetch(`${NURSING_WEB_BASE_URL}/api/ot-records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'set_approval_status',
      nurseName,
      approvalStatus,
      approvedBy,
      ...extra,
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text.slice(0, 200) || `HTTP ${response.status}`)
  }
  const payload = await response.json().catch(() => null)
  if (!payload?.ok) throw new Error(payload?.error || 'Unknown error')
  const rows = Array.isArray(payload.data) ? payload.data : []
  // Find the row we just updated
  const norm = nurseName.replace(/^@/, '').trim().toLowerCase()
  return rows.find((r) => r.nurseName.replace(/^@/, '').trim().toLowerCase() === norm && r.status === 'ot_completed') || null
}

export function registerApproveRejectOtCommands(bot) {
  // ── /approve_ot NurseName [Note] ─────────────────────────────────────────
  bot.onText(/^\/approve_ot\b/i, async (msg) => {
    const chatId      = msg.chat.id
    const supervisorName = msg.from?.first_name || msg.from?.username || 'Supervisor'
    const rest        = String(msg.text ?? '').replace(/^\/approve_ot\b/i, '').trim()
    const parts       = rest.split(/\s+/)
    const nurseName   = parts[0] || ''
    const note        = parts.slice(1).join(' ')

    if (!nurseName) {
      await bot.sendMessage(chatId, '⚠️ Usage: /approve_ot NurseName [optional note]')
      return
    }

    try {
      const updated = await setApproval(nurseName, 'approved', supervisorName, {
        approvalNote: note || undefined,
      })

      const amount = updated ? updated.totalOtAllowance : null
      const date   = updated ? updated.date : '—'

      await bot.sendMessage(
        chatId,
        [
          '✅ *OT Approved*',
          '',
          `Staff: ${nurseName}`,
          `Date: ${date}`,
          amount !== null ? `Amount: RM${Number(amount).toFixed(2)}` : '',
          `Approved by: ${supervisorName}`,
          note ? `Note: ${note}` : '',
          '',
          'This record is now included in the payroll export.',
        ].filter((l) => l !== '').join('\n'),
        { parse_mode: 'Markdown' },
      )
      log.info(`[approve_ot] ${nurseName} approved by ${supervisorName}`)
    } catch (err) {
      log.warn('[approve_ot] error:', err?.message ?? String(err))
      await bot.sendMessage(
        chatId,
        `⚠️ Could not approve OT for *${nurseName}*.\n${err?.message ?? ''}`,
        { parse_mode: 'Markdown' },
      )
    }
  })

  // ── /reject_ot NurseName [Reason] ─────────────────────────────────────────
  bot.onText(/^\/reject_ot\b/i, async (msg) => {
    const chatId      = msg.chat.id
    const supervisorName = msg.from?.first_name || msg.from?.username || 'Supervisor'
    const rest        = String(msg.text ?? '').replace(/^\/reject_ot\b/i, '').trim()
    const parts       = rest.split(/\s+/)
    const nurseName   = parts[0] || ''
    const reason      = parts.slice(1).join(' ')

    if (!nurseName) {
      await bot.sendMessage(chatId, '⚠️ Usage: /reject_ot NurseName [optional reason]')
      return
    }

    try {
      const updated = await setApproval(nurseName, 'rejected', supervisorName, {
        rejectionReason: reason || undefined,
      })

      const amount = updated ? updated.totalOtAllowance : null
      const date   = updated ? updated.date : '—'

      await bot.sendMessage(
        chatId,
        [
          '❌ *OT Rejected*',
          '',
          `Staff: ${nurseName}`,
          `Date: ${date}`,
          amount !== null ? `Amount: RM${Number(amount).toFixed(2)} (not payable)` : '',
          `Rejected by: ${supervisorName}`,
          reason ? `Reason: ${reason}` : '',
        ].filter((l) => l !== '').join('\n'),
        { parse_mode: 'Markdown' },
      )
      log.info(`[reject_ot] ${nurseName} rejected by ${supervisorName}${reason ? ` — ${reason}` : ''}`)
    } catch (err) {
      log.warn('[reject_ot] error:', err?.message ?? String(err))
      await bot.sendMessage(
        chatId,
        `⚠️ Could not reject OT for *${nurseName}*.\n${err?.message ?? ''}`,
        { parse_mode: 'Markdown' },
      )
    }
  })
}
