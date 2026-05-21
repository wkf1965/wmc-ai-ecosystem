import { syncCommandToGoogleSheet } from '../commandSheetSync.js'
import { appendCommandRecord } from '../commandRecordStore.js'
import { getCommandDef } from '../commandRegistry.js'

export async function handleMedCommand(data, ctx = {}) {
  const def = getCommandDef('/med')
  const meta = { timestamp: new Date().toISOString(), chatId: ctx.chatId, nurseName: ctx.nurseName ?? '' }
  const dbRow = def.buildDbRow(data, meta)
  const record = await appendCommandRecord('/med', data, { ...ctx, dbRow })
  syncCommandToGoogleSheet('/med', data, { ...meta, id: record.id }).catch((e) => console.error('[med] sheet:', e?.message))
  return { reply: def.buildReply(data), record }
}
