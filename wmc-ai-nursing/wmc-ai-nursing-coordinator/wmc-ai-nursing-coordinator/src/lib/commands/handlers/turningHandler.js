import { syncCommandToGoogleSheet } from '../commandSheetSync.js'
import { appendCommandRecord } from '../commandRecordStore.js'
import { getCommandDef } from '../commandRegistry.js'

export async function handleTurningCommand(data, ctx = {}) {
  const def = getCommandDef('/turning')
  const meta = { timestamp: new Date().toISOString(), chatId: ctx.chatId, nurseName: ctx.nurseName ?? '' }
  const dbRow = def.buildDbRow(data, meta)
  const record = await appendCommandRecord('/turning', data, { ...ctx, dbRow })
  syncCommandToGoogleSheet('/turning', data, { ...meta, id: record.id }).catch((e) => console.error('[turning] sheet:', e?.message))
  return { reply: def.buildReply(data), record }
}
