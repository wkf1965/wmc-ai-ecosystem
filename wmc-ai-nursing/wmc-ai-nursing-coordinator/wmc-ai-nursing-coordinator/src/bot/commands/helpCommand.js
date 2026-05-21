import { buildHelpMessage } from '../utils/messageBuilder.js'
import { log } from '../utils/logger.js'
import { ADMIT_WORKFLOW }    from '../workflows/admitWorkflow.js'
import { VITALS_WORKFLOW }   from '../workflows/vitalsWorkflow.js'
import { FALL_WORKFLOW }     from '../workflows/fallWorkflow.js'
import { TURNING_WORKFLOW }  from '../workflows/turningWorkflow.js'
import { REHAB_WORKFLOW }    from '../workflows/rehabWorkflow.js'
import { MED_WORKFLOW }      from '../workflows/medWorkflow.js'
import { ALERT_WORKFLOW }    from '../workflows/alertWorkflow.js'
import { HANDOVER_WORKFLOW } from '../workflows/handoverWorkflow.js'

const ALL_WORKFLOWS = [
  ADMIT_WORKFLOW,
  VITALS_WORKFLOW,
  FALL_WORKFLOW,
  TURNING_WORKFLOW,
  REHAB_WORKFLOW,
  MED_WORKFLOW,
  ALERT_WORKFLOW,
  HANDOVER_WORKFLOW,
]

/**
 * /help — Full command reference.
 * @param {import('node-telegram-bot-api').default} bot
 */
export function registerHelpCommand(bot) {
  bot.onText(/^\/help\b/i, (msg) => {
    const chatId = msg.chat.id
    log.cmd('help', chatId, msg.from?.username)
    bot.sendMessage(chatId, buildHelpMessage(ALL_WORKFLOWS), { parse_mode: 'Markdown' })
  })
}
