/**
 * Google Apps Script webhook append for Telegram nursing memory rows.
 * Set GOOGLE_SHEET_MODE=live (and GOOGLE_SHEET_WEBHOOK_URL) on the Node/Vite process that runs the webhook.
 */

import { routeTelegramNursingSheetTabs } from './telegramSheetRouting.mjs'

/**
 * @param {object} memoryRecord — row from telegram-nursing-memory.json
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, status?: number, response?: unknown, error?: string }>}
 */
export async function saveTelegramNursingNoteToGoogleSheet(memoryRecord) {
  const mode = String(process.env.GOOGLE_SHEET_MODE || process.env.VITE_GOOGLE_SHEET_MODE || 'simulation')
    .toLowerCase()
    .trim()

  if (mode === 'simulation' || mode === 'off' || mode === 'disabled' || mode === '') {
    console.warn(
      '[google-sheet] Sync skipped — GOOGLE_SHEET_MODE=%s. Set GOOGLE_SHEET_MODE=live and GOOGLE_SHEET_WEBHOOK_URL to POST rows.',
      mode || 'simulation',
    )
    return {
      ok: true,
      skipped: true,
      reason: 'GOOGLE_SHEET_MODE is simulation — Apps Script webhook not called.',
    }
  }

  if (mode !== 'live' && mode !== 'production') {
    console.warn('[google-sheet] Unknown GOOGLE_SHEET_MODE=%s — skipping Sheet POST', mode)
    return { ok: true, skipped: true, reason: `unknown mode: ${mode}` }
  }

  const webhookUrl = String(process.env.GOOGLE_SHEET_WEBHOOK_URL || '').trim()
  if (!webhookUrl) {
    console.error('[google-sheet] GOOGLE_SHEET_WEBHOOK_URL is empty — cannot append Telegram nursing row')
    return { ok: false, skipped: false, error: 'GOOGLE_SHEET_WEBHOOK_URL missing' }
  }

  const targets = routeTelegramNursingSheetTabs(memoryRecord)

  const categoriesStr = String(memoryRecord.categories ?? '')
  const dashCats = Array.isArray(memoryRecord.dashboardCategories)
    ? memoryRecord.dashboardCategories.join('; ')
    : ''
  const payload = {
    source: 'telegram',
    routingVersion: 3,
    targets,
    timestamp: memoryRecord.timestamp || new Date().toISOString(),
    room: memoryRecord.room ?? '',
    patientName: String(memoryRecord.patientName ?? ''),
    nurseName: String(memoryRecord.nurseName ?? ''),
    category: categoriesStr,
    categories: categoriesStr,
    dashboardCategories: dashCats,
    riskLevel: String(memoryRecord.riskLevel ?? ''),
    riskScore: memoryRecord.riskScore ?? '',
    suggestedAction: String(memoryRecord.suggestedAction ?? ''),
    symptoms: String(memoryRecord.symptoms ?? ''),
    originalMessage: String(memoryRecord.originalMessage ?? ''),
  }

  console.log('[google-sheet] Google Sheet sync started (dynamic routing)')
  console.log('[google-sheet] webhook URL used:', webhookUrl)
  console.log('[google-sheet] target sheet tabs:', targets.join(', '))
  console.log('[google-sheet] payload sent:', JSON.stringify(payload))

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const text = await res.text()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }

    console.log('[google-sheet] Google response:', res.status, parsed)

    if (!res.ok) {
      return {
        ok: false,
        skipped: false,
        status: res.status,
        response: parsed,
      }
    }

    return {
      ok: true,
      skipped: false,
      status: res.status,
      response: parsed,
    }
  } catch (e) {
    console.error('[google-sheet] POST to Apps Script failed:', e?.message || e)
    return { ok: false, skipped: false, error: String(e?.message || e) }
  }
}
