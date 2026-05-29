/**
 * /otin — Start overtime
 *
 * Safety rules:
 *   ✖ Must have completed normal punch-out first.
 *   ✖ Prevent double OT-in on the same day.
 */

import { log }                  from '../utils/logger.js'
import { getState, patchState } from '../state/activePunchMap.js'
import {
  fmtOtIn,
  nowHhmm,
  todayString,
  DEFAULT_OT_RATE,
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
      log.warn(`[ot-sync] OT in sync failed: ${errorText.slice(0, 120)}`)
      return
    }
    log.info(`[ot-sync] OT in synced: ${nurseName}`)
  } catch (error) {
    log.warn('[ot-sync] OT in sync error:', error?.message ?? String(error))
  }
}

async function getLatestOtRateFromNursingWeb() {
  try {
    const response = await fetch(`${NURSING_WEB_BASE_URL}/api/settings/ot-rate`, {
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) return DEFAULT_OT_RATE
    return Math.max(0, Number(payload?.rate ?? DEFAULT_OT_RATE) || DEFAULT_OT_RATE)
  } catch {
    return DEFAULT_OT_RATE
  }
}

export function registerOtInCommand(bot) {
  bot.onText(/^\/(?:ot_in|otin)\b/i, async (msg) => {
    const chatId   = msg.chat.id
    const today    = todayString()
    const existing = getState(chatId)
    const inputName = String(msg.text ?? '').replace(/^\/(?:ot_in|otin)\b/i, '').trim()
    const nurseName = inputName || existing?.staff_name || (msg.from?.first_name ?? 'Staff')

    console.log("OT IN nurse:", nurseName)

    // ── Must punch out from normal shift first ───────────────────────────
    if (!inputName && (!existing || !existing.normal_punch_in)) {
      await bot.sendMessage(chatId,
        `⚠️ You have not started a normal shift today.\n\nPlease /punchin first, then /punchout before starting OT.`,
      )
      return
    }

    if (!inputName && !existing.normal_punch_out) {
      await bot.sendMessage(chatId,
        `⚠️ You must punch out from normal duty first.\n\nUse /punchout to end your normal shift, then /otin.`,
      )
      return
    }

    // ── Prevent double OT-in ─────────────────────────────────────────────
    if (!inputName && existing.ot_in) {
      await bot.sendMessage(chatId,
        `⚠️ OT already started at ${existing.ot_in}.\n\nUse /otout when overtime ends.`,
      )
      return
    }

    // ── Record OT start ──────────────────────────────────────────────────
    const latestOtRate = await getLatestOtRateFromNursingWeb()
    const ot_in = nowHhmm()
    patchState(chatId, {
      date: existing?.date || today,
      staff_name: nurseName,
      ot_in,
      ot_rate: latestOtRate,
      active_ot_session: {
        nurse_name: nurseName,
        ot_punch_in: ot_in,
        ot_rate: latestOtRate,
        status: 'OT active',
      },
    })

    log.info(`[ot_in] ${nurseName} at ${ot_in}`)
    await bot.sendMessage(chatId, fmtOtIn(nurseName, ot_in), { parse_mode: 'Markdown' })
    await syncOtRecordToNursingWeb('ot_punch_in', nurseName)
  })
}
