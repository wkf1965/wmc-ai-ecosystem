/**
 * Command Router — hybrid architecture
 *
 *  /command  → COMMAND ROUTE (onText workflow handlers)
 *  free text → NLP ROUTER first, then WORKFLOW ROUTE if still active
 */

import {
  getState,
  blockIfActiveWorkflow,
  getSessionKey,
} from '../services/stateManager.js'
import { cancelAllSessionStates, CANCEL_FLOW_REPLY } from '../services/sessionReset.js'
import { routeNlpMessage } from '../services/nlpRouter.js'
import { processAnswer }        from '../services/workflowEngine.js'
import { prepareSessionForResume, buildStatusMessage } from '../services/workflowResume.js'
import { patchBotSendMessage, safeSendMessage } from '../utils/safeMessage.js'
import { log }                  from '../utils/logger.js'

import { registerStartCommand }     from './startCommand.js'
import { registerHelpCommand }      from './helpCommand.js'
import { registerAdmitCommand }     from './admitCommand.js'
import { registerVitalsCommand }    from './vitalsCommand.js'
import { registerFallCommand }      from './fallCommand.js'
import { registerTurningCommand }   from './turningCommand.js'
import { registerRehabCommand }     from './rehabCommand.js'
import { registerMedCommand }       from './medCommand.js'
import { registerAlertCommand }     from './alertCommand.js'
import { registerHandoverCommand }  from './handoverCommand.js'
import { registerOtPayrollCommand }  from './otPayrollCommand.js'
import { registerOtCheckCommand }    from './otCheckCommand.js'
import { registerPunchInCommand }    from './punchInCommand.js'
import { registerPunchOutCommand }   from './punchOutCommand.js'
import { registerOtInCommand }       from './otInCommand.js'
import { registerOtOutCommand }      from './otOutCommand.js'
import { registerAttendanceCommand }   from './attendanceCommand.js'
import { registerOtReportCommand }     from './otReportCommand.js'
import {
  registerSideTurningCommands,
  startOverdueChecker,
} from './sideTurningCommands.js'
import {
  registerInventoryCommands,
  handleInventoryStepIfActive,
} from './inventoryCommands.js'
import { registerAdminStockCommands } from './adminStockCommands.js'

const SELF_HANDLED_WORKFLOWS = new Set(['ot_payroll', 'ot_check', 'ot_report', 'inventory', 'admin_stock'])

function installCommandGuard(bot) {
  const originalOnText = bot.onText.bind(bot)
  bot.onText = (regexp, callback) => {
    originalOnText(regexp, async (msg, match) => {
      if (/^\/(cancel|status)\b/i.test(String(msg.text ?? ''))) {
        return callback(msg, match)
      }
      if (await blockIfActiveWorkflow(msg, bot)) return
      const cmd = String(msg.text ?? '').split(/\s+/)[0]
      console.log('[COMMAND ROUTE]', cmd)
      log.info('[COMMAND ROUTE]', cmd)
      return callback(msg, match)
    })
  }
}

export function registerAllCommands(bot) {
  patchBotSendMessage(bot)
  installCommandGuard(bot)

  registerStartCommand(bot)
  registerHelpCommand(bot)

  registerAdmitCommand(bot)
  registerVitalsCommand(bot)
  registerFallCommand(bot)
  registerTurningCommand(bot)
  registerRehabCommand(bot)
  registerMedCommand(bot)
  registerAlertCommand(bot)
  registerHandoverCommand(bot)

  registerOtPayrollCommand(bot)
  registerOtCheckCommand(bot)

  registerPunchInCommand(bot)
  registerPunchOutCommand(bot)
  registerOtInCommand(bot)
  registerOtOutCommand(bot)
  registerAttendanceCommand(bot)
  registerOtReportCommand(bot)

  registerSideTurningCommands(bot)
  startOverdueChecker(bot)

  registerInventoryCommands(bot)
  registerAdminStockCommands(bot)

  bot.onText(/^\/status\b/i, async (msg) => {
    const chatId = msg.chat.id
    const state = prepareSessionForResume(msg) ?? getState(msg)
    if (!state) {
      await safeSendMessage(bot, chatId, 'No active workflow. Send /help for commands.', { parse_mode: 'HTML' })
      return
    }
    await safeSendMessage(bot, chatId, buildStatusMessage(state), { parse_mode: 'HTML' })
  })

  bot.onText(/^\/cancel\b/i, async (msg) => {
    const chatId = msg.chat.id
    const state = getState(msg)
    log.info('[COMMAND ROUTE] /cancel')
    console.log('[COMMAND ROUTE] /cancel')
    await cancelAllSessionStates(msg)
    await bot.sendMessage(chatId, CANCEL_FLOW_REPLY)
    if (state) {
      log.info(`[cancel] workflow "${state.workflow ?? state.flow}" cancelled by ${getSessionKey(msg)}`)
    }
  })

  // ── Hybrid free-text router: NLP first, workflow second ───────────────────
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return

    const chatId = msg.chat.id
    const nurseName = msg.from?.first_name ?? msg.from?.username ?? 'Nurse'

    // 1. NLP ROUTER — always runs for free text (no workflow required)
    const nlpResult = await routeNlpMessage({
      text: msg.text,
      msg,
      bot,
      chatId,
      nurseName,
      clearWorkflowOnNursing: true,
    })
    if (nlpResult.handled) return

    const state = getState(msg)

    // 2. WORKFLOW ROUTE — inventory step-by-step
    if (await handleInventoryStepIfActive(bot, msg)) {
      console.log('[WORKFLOW ROUTE] inventory step')
      log.info('[WORKFLOW ROUTE] inventory step')
      return
    }

    // 3. WORKFLOW ROUTE — other self-handled modules
    if (state && SELF_HANDLED_WORKFLOWS.has(state.workflow)) return

    // 4. WORKFLOW ROUTE — nursing command forms (/admit, /vitals, …)
    if (state) {
      console.log('[WORKFLOW ROUTE]', state.workflow ?? state.flow, 'step', state.step)
      log.info('[WORKFLOW ROUTE]', state.workflow ?? state.flow, 'step', state.step)
      prepareSessionForResume(msg)
      await processAnswer(bot, msg)
      return
    }

    // 5. Unrecognised free text
    await bot.sendMessage(
      chatId,
      '💬 Type a nursing note naturally, e.g.\n' +
      '`Room 2 Ali poor appetite`\n\n' +
      'Or start a command: /vitals /admit /pampers /help',
      { parse_mode: 'Markdown' },
    )
  })

  console.log('[bot] hybrid router active — NLP + commands + workflows')
  log.info('[bot] hybrid router active — NLP + commands + workflows')
}
