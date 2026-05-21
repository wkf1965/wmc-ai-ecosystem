import { syncCommandToGoogleSheet } from '../commandSheetSync.js'
import { appendCommandRecord } from '../commandRecordStore.js'
import { getCommandDef } from '../commandRegistry.js'

export async function handleRehabCommand(data, ctx = {}) {
  const def = getCommandDef('/rehab')
  const meta = { timestamp: new Date().toISOString(), chatId: ctx.chatId, nurseName: ctx.nurseName ?? '' }
  const dbRow = def.buildDbRow(data, meta)
  const record = await appendCommandRecord('/rehab', data, { ...ctx, dbRow })
  syncCommandToGoogleSheet('/rehab', data, { ...meta, id: record.id }).catch((e) => console.error('[rehab] sheet:', e?.message))
  return { reply: def.buildReply(data), record }
}
