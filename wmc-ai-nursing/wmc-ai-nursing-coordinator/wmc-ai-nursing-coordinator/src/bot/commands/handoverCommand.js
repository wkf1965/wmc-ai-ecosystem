/**
 * Handover Command — Stage 4
 *
 * Flow:
 *   1. Nurse types /handover
 *   2. Bot replies "Generating today's AI handover summary..."
 *   3. Read all 7 tabs for today's records from Google Sheet
 *   4. If no records → "No nursing records found for today."
 *   5. Call OpenAI → return formatted handover
 *   6. If AI fails → "AI handover generation failed. Please contact admin."
 */

import { getAllTodayRecords, hasAnyRecords } from '../services/sheetReadService.js'
import { generateHandoverSummary }           from '../services/aiSummaryService.js'
import { log }                               from '../utils/logger.js'

const D = '━━━━━━━━━━━━━━━━━━━━━━━━━'

export function registerHandoverCommand(bot) {
  bot.onText(/^\/handover\b/i, async (msg) => {
    const chatId    = msg.chat.id
    const nurseName = msg.from?.first_name ?? msg.from?.username ?? 'Nurse'

    log.cmd('handover', chatId, msg.from?.username)

    // ── Step 1: Acknowledge immediately ──────────────────────────────────
    await bot.sendMessage(
      chatId,
      [
        '📋 *WMC AI Nursing Handover*',
        D,
        `👤 Requested by: ${nurseName}`,
        '⏳ Reading today\'s records from Google Sheet...',
        '_This may take a few seconds._',
      ].join('\n'),
      { parse_mode: 'Markdown' },
    )

    // ── Step 2: Fetch all today's records in parallel ─────────────────────
    let records
    try {
      records = await getAllTodayRecords()
    } catch (err) {
      log.error('[handover] failed to read sheet records:', err?.message)
      await bot.sendMessage(
        chatId,
        [
          '⚠️ *Could not read records from Google Sheet.*',
          '',
          'Please check Google Sheet credentials in .env',
          'or contact admin.',
        ].join('\n'),
        { parse_mode: 'Markdown' },
      )
      return
    }

    // ── Step 3: No records today ──────────────────────────────────────────
    if (!hasAnyRecords(records)) {
      await bot.sendMessage(
        chatId,
        [
          '📭 *No nursing records found for today.*',
          '',
          'No data has been entered yet for the current date.',
          'Records are added when nurses complete workflows',
          '(/vitals, /admit, /fall, etc.) and confirm with *yes*.',
        ].join('\n'),
        { parse_mode: 'Markdown' },
      )
      return
    }

    // ── Step 4: Count summary before AI call ─────────────────────────────
    const counts = [
      records.admissions.length && `${records.admissions.length} admission(s)`,
      records.vitals.length     && `${records.vitals.length} vitals`,
      records.falls.length      && `${records.falls.length} fall(s)`,
      records.turning.length    && `${records.turning.length} turning(s)`,
      records.rehab.length      && `${records.rehab.length} rehab session(s)`,
      records.medicine.length   && `${records.medicine.length} medication(s)`,
      records.alerts.length     && `${records.alerts.length} alert(s)`,
    ].filter(Boolean)

    await bot.sendMessage(
      chatId,
      `📊 Found: ${counts.join(', ')}\n🤖 Generating AI summary...`,
    )

    // ── Step 5: Generate AI handover ─────────────────────────────────────
    const result = await generateHandoverSummary(records)

    if (!result.success) {
      await bot.sendMessage(
        chatId,
        [
          '❌ *AI handover generation failed.*',
          '',
          'Please contact admin.',
          '',
          `_Error: ${result.error ?? 'Unknown error'}_`,
        ].join('\n'),
        { parse_mode: 'Markdown' },
      )
      return
    }

    // ── Step 6: Send summary (split if > Telegram 4096 char limit) ────────
    const summary = result.summary
    if (summary.length <= 4000) {
      await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' })
    } else {
      // Split into chunks at paragraph boundaries
      const chunks = splitMessage(summary, 4000)
      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' })
      }
    }

    log.info(`[handover] summary sent to chat:${chatId}`)
  })
}

// ── Helper: split long messages ──────────────────────────────────────────────

function splitMessage(text, maxLen) {
  const chunks = []
  let remaining = text
  while (remaining.length > maxLen) {
    // Find last newline before maxLen
    let cut = remaining.lastIndexOf('\n', maxLen)
    if (cut === -1) cut = maxLen
    chunks.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut).trimStart()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}
