import { randomUUID } from 'node:crypto'
import { appendTelegramWebhookEntry } from './telegramMockStore.mjs'
import {
  appendTelegramNursingMemoryRecord,
  buildTelegramNursingMemoryRecord,
} from './telegramNursingMemory.mjs'
import { saveTelegramNursingNoteToGoogleSheet } from './telegramGoogleSheetSync.mjs'

/**
 * Persist webhook mock-store row + nursing memory + optional Sheet hook (simulation-safe).
 * @param {object} processed — processTelegramInboundUpdate result
 * @param {object} o
 * @param {string} o.mode
 * @param {boolean} o.telegramSent
 * @param {string|null} o.telegramError
 * @param {object} o.parsePreview
 */
export async function persistTelegramInboundBundle(processed, o) {
  try {
    const { extracted, rawUpdate, nursingRecord, brainSignals, replyText } = processed

    const id = randomUUID()
    const receivedAt = new Date().toISOString()

    const entry = {
      id,
      receivedAt,
      mode: o.mode,
      extracted,
      rawTelegramPayload: rawUpdate,
      nursingRecord,
      brainSignals,
      replyText,
      telegramSent: o.telegramSent,
      telegramError: o.telegramError,
      parsePreview: o.parsePreview,
      memoryId: null,
    }

    const memoryRecord = buildTelegramNursingMemoryRecord(processed, {
      webhookEntryId: id,
      receivedAt,
      mode: o.mode,
      telegramSent: o.telegramSent,
    })

    entry.memoryId = memoryRecord.id

    await appendTelegramWebhookEntry(entry)
    await appendTelegramNursingMemoryRecord(memoryRecord)

    saveTelegramNursingNoteToGoogleSheet(memoryRecord).catch((err) => {
      console.error('[google-sheet] Async sync error:', err?.message || err)
    })

    return { entry, memoryRecord }
  } catch (err) {
    console.error('[telegram] persistTelegramInboundBundle failed:', err?.stack || err)
    return { entry: null, memoryRecord: null }
  }
}
