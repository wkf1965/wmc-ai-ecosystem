import { syncCommandToGoogleSheet } from '../commandSheetSync.js'
import { appendCommandRecord } from '../commandRecordStore.js'
import { getCommandDef } from '../commandRegistry.js'

export async function handleFallCommand(data, ctx = {}) {
  const def = getCommandDef('/fall')
  const meta = { timestamp: new Date().toISOString(), chatId: ctx.chatId, nurseName: ctx.nurseName ?? '' }
  const dbRow = def.buildDbRow(data, meta)
  const record = await appendCommandRecord('/fall', data, { ...ctx, dbRow })
  syncCommandToGoogleSheet('/fall', data, { ...meta, id: record.id }).catch((e) => console.error('[fall] sheet:', e?.message))
  return { reply: def.buildReply(data), record }
}
