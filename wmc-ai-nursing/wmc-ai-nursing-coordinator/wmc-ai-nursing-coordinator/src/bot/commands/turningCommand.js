import { TURNING_WORKFLOW } from '../workflows/turningWorkflow.js'
import { startWorkflow }    from '../services/workflowEngine.js'
import { setState }         from '../services/stateManager.js'

export function registerTurningCommand(bot) {
  bot.onText(/^\/turning\b/i, (msg) => { void startWorkflow(bot, msg, TURNING_WORKFLOW, setState) })
}
