/**
 * Command Router — Stage 2
 *
 * Registers all command handlers and owns the global message listener
 * that routes nurse text through the active workflow's step engine.
 */

import { getState, clearState } from '../services/stateManager.js'
import { processAnswer }        from '../services/workflowEngine.js'
import { log }                  from '../utils/logger.js'

import { registerStartCommand }    from './startCommand.js'
import { registerHelpCommand }     from './helpCommand.js'
import { registerAdmitCommand }    from './admitCommand.js'
import { registerVitalsCommand }   from './vitalsCommand.js'
import { registerFallCommand }     from './fallCommand.js'
import { registerTurningCommand }  from './turningCommand.js'
import { registerRehabCommand }    from './rehabCommand.js'
import { registerMedCommand }      from './medCommand.js'
import { registerAlertCommand }    from './alertCommand.js'
import { registerHandoverCommand } from './handoverCommand.js'

export function registerAllCommands(bot) {
  // ── Utility commands ────────────────────────────────────────────────────
  registerStartCommand(bot)
  registerHelpCommand(bot)

  // ── Workflow commands ────────────────────────────────────────────────────
  registerAdmitCommand(bot)
  registerVitalsCommand(bot)
  registerFallCommand(bot)
  registerTurningCommand(bot)
  registerRehabCommand(bot)
  registerMedCommand(bot)
  registerAlertCommand(bot)
  registerHandoverCommand(bot)

  // ── Global /cancel ───────────────────────────────────────────────────────
  bot.onText(/^\/cancel\b/i, (msg) => {
    const chatId = msg.chat.id
    const state = getState(chatId)
    if (state) {
      clearState(chatId)
      bot.sendMessage(chatId, '❌ Workflow cancelled.\n\nSend /help to see available commands.')
      log.info(`[cancel] workflow "${state.workflow}" cancelled by chat:${chatId}`)
    } else {
      bot.sendMessage(chatId, 'No active workflow to cancel. Send /help for commands.')
    }
  })

  // ── Global text handler — drives step-by-step collection ────────────────
  bot.on('message', async (msg) => {
    // Ignore non-text and Telegram commands (handled by their own onText listeners)
    if (!msg.text || msg.text.startsWith('/')) return

    const chatId = msg.chat.id
    const state = getState(chatId)

    if (!state) {
      // Nurse sent text with no active workflow
      bot.sendMessage(
        chatId,
        '💬 No active workflow.\n\nUse one of these commands to begin:\n' +
        '/vitals  /admit  /fall  /turning  /rehab  /med  /alert\n\n' +
        'Or send /help for more information.',
      )
      return
    }

    // Pass to workflow engine — it handles step progression and confirmation
    await processAnswer(bot, msg)
  })

  log.info('[bot] all commands registered — Stage 2 ready')
}
