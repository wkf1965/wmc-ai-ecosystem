import { syncCommandToGoogleSheet } from '../commandSheetSync.js'
import { appendCommandRecord } from '../commandRecordStore.js'
import { getCommandDef } from '../commandRegistry.js'

export async function handleAdmitCommand(data, ctx = {}) {
  const def = getCommandDef('/admit')
  const meta = { timestamp: new Date().toISOString(), chatId: ctx.chatId, nurseName: ctx.nurseName ?? '' }
  const dbRow = def.buildDbRow(data, meta)
  const record = await appendCommandRecord('/admit', data, { ...ctx, dbRow })
  syncCommandToGoogleSheet('/admit', data, { ...meta, id: record.id }).catch((e) => console.error('[admit] sheet:', e?.message))
  return { reply: def.buildReply(data), record }
}
