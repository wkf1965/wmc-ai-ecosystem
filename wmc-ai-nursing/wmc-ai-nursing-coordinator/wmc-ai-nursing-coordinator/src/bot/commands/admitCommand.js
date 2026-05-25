import { ADMIT_WORKFLOW } from '../workflows/admitWorkflow.js'
import { startWorkflow }  from '../services/workflowEngine.js'
import { setState }       from '../services/stateManager.js'

export function registerAdmitCommand(bot) {
  bot.onText(/^\/admit\b/i, (msg) => { void startWorkflow(bot, msg, ADMIT_WORKFLOW, setState) })
}
