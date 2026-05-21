import { syncCommandToGoogleSheet } from '../commandSheetSync.js'
import { appendCommandRecord } from '../commandRecordStore.js'
import { getCommandDef } from '../commandRegistry.js'

export async function handleVitalsCommand(data, ctx = {}) {
  const def = getCommandDef('/vitals')
  const meta = { timestamp: new Date().toISOString(), chatId: ctx.chatId, nurseName: ctx.nurseName ?? '' }
  const dbRow = def.buildDbRow(data, meta)
  const record = await appendCommandRecord('/vitals', data, { ...ctx, dbRow })
  syncCommandToGoogleSheet('/vitals', data, { ...meta, id: record.id }).catch((e) => console.error('[vitals] sheet:', e?.message))
  return { reply: def.buildReply(data), record }
}
