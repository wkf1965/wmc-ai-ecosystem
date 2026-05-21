import { VITALS_WORKFLOW } from '../workflows/vitalsWorkflow.js'
import { startWorkflow }   from '../services/workflowEngine.js'
import { setState }        from '../services/stateManager.js'

export function registerVitalsCommand(bot) {
  bot.onText(/^\/vitals\b/i, (msg) => startWorkflow(bot, msg, VITALS_WORKFLOW, setState))
}
