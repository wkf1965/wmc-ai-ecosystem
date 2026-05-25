import { MED_WORKFLOW }  from '../workflows/medWorkflow.js'
import { startWorkflow } from '../services/workflowEngine.js'
import { setState }      from '../services/stateManager.js'

export function registerMedCommand(bot) {
  bot.onText(/^\/med\b/i, (msg) => { void startWorkflow(bot, msg, MED_WORKFLOW, setState) })
}
