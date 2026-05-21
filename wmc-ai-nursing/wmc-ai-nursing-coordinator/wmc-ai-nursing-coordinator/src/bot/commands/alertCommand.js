import { ALERT_WORKFLOW } from '../workflows/alertWorkflow.js'
import { startWorkflow }  from '../services/workflowEngine.js'
import { setState }       from '../services/stateManager.js'

export function registerAlertCommand(bot) {
  bot.onText(/^\/alert\b/i, (msg) => startWorkflow(bot, msg, ALERT_WORKFLOW, setState))
}
