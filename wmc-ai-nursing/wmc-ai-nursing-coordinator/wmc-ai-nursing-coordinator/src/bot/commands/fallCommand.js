import { FALL_WORKFLOW } from '../workflows/fallWorkflow.js'
import { startWorkflow } from '../services/workflowEngine.js'
import { setState }      from '../services/stateManager.js'

export function registerFallCommand(bot) {
  bot.onText(/^\/fall\b/i, (msg) => startWorkflow(bot, msg, FALL_WORKFLOW, setState))
}
