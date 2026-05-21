import { syncCommandToGoogleSheet } from '../commandSheetSync.js'
import { appendCommandRecord } from '../commandRecordStore.js'
import { getCommandDef } from '../commandRegistry.js'

export async function handleAlertCommand(data, ctx = {}) {
  const def = getCommandDef('/alert')
  const meta = { timestamp: new Date().toISOString(), chatId: ctx.chatId, nurseName: ctx.nurseName ?? '' }
  const dbRow = def.buildDbRow(data, meta)
  const record = await appendCommandRecord('/alert', data, { ...ctx, dbRow })
  syncCommandToGoogleSheet('/alert', data, { ...meta, id: record.id }).catch((e) => console.error('[alert] sheet:', e?.message))
  return { reply: def.buildReply(data), record }
}
