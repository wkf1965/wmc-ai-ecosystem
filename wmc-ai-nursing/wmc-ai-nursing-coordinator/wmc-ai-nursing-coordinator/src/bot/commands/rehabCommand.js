import { REHAB_WORKFLOW } from '../workflows/rehabWorkflow.js'
import { startWorkflow }  from '../services/workflowEngine.js'
import { setState }       from '../services/stateManager.js'

export function registerRehabCommand(bot) {
  bot.onText(/^\/rehab\b/i, (msg) => startWorkflow(bot, msg, REHAB_WORKFLOW, setState))
}
