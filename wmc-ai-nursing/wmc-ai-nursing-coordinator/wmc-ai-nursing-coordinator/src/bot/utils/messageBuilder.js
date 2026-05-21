/**
 * Message Builder — Stage 1
 * Formats all Telegram bot messages consistently.
 */

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━'

/**
 * Build the info card shown when a nurse first triggers a command.
 * @param {{ icon: string, title: string, purpose: string, fields: string[] }} workflow
 * @returns {string}
 */
export function buildWorkflowInfoMessage({ icon, title, purpose, fields }) {
  const fieldLines = fields.map((f, i) => `  ${i + 1}. ${f}`)
  return [
    `${icon} *${title}*`,
    DIVIDER,
    `📌 *Purpose:* ${purpose}`,
    '',
    '📋 *Required fields:*',
    ...fieldLines,
    '',
    DIVIDER,
    '💬 Please enter details step by step.',
    'Send /cancel at any time to stop.',
  ].join('\n')
}

/**
 * Build the /start welcome message.
 * @param {string} [firstName]
 * @returns {string}
 */
export function buildWelcomeMessage(firstName) {
  const name = firstName ? ` ${firstName}` : ''
  return [
    `👋 *Welcome${name} to WMC AI Nursing Coordinator*`,
    DIVIDER,
    '🏥 This bot helps nursing staff submit structured records quickly and accurately.',
    '',
    '📋 *Available Commands:*',
    '',
    '  🏥 /admit      — New patient admission',
    '  💓 /vitals     — Record vital signs',
    '  🚨 /fall       — Fall incident report',
    '  🔄 /turning    — Side turning record',
    '  🏃 /rehab      — Rehab session progress',
    '  💊 /med        — Medication record (MAR)',
    '  🆘 /alert      — Emergency clinical alert',
    '  📊 /handover   — AI shift handover summary',
    '',
    DIVIDER,
    '💡 *How to use:*',
    'Type any command above to begin.',
    'The bot will guide you step by step.',
    '',
    'Send /help to see the full command list.',
  ].join('\n')
}

/**
 * Build the /help reference message.
 * @param {object[]} workflows — array of workflow definitions
 * @returns {string}
 */
export function buildHelpMessage(workflows) {
  const lines = [
    '📋 *WMC AI Nursing Coordinator — Command Reference*',
    DIVIDER,
    '',
  ]
  for (const w of workflows) {
    lines.push(`${w.icon} */${w.name}* — ${w.purpose}`)
    lines.push(`   Fields: ${w.fields.slice(0, 3).join(', ')}${w.fields.length > 3 ? '...' : ''}`)
    lines.push('')
  }
  lines.push(DIVIDER)
  lines.push('/cancel — Cancel current workflow')
  lines.push('/help   — Show this help')
  return lines.join('\n')
}

/**
 * Build the active-workflow reminder shown when nurse sends text mid-workflow.
 * @param {string} workflowTitle
 * @param {string} workflowName
 * @returns {string}
 */
export function buildActiveWorkflowReminder(workflowTitle, workflowName) {
  return [
    `📝 *You are inside the ${workflowTitle} workflow.*`,
    '',
    'Step-by-step data entry will be available in Stage 2.',
    '',
    `Send /${workflowName} again to restart, or /cancel to exit.`,
  ].join('\n')
}

/**
 * Build the cancel confirmation message.
 * @param {string} workflowTitle
 * @returns {string}
 */
export function buildCancelMessage(workflowTitle) {
  return [
    `❌ *${workflowTitle} workflow cancelled.*`,
    '',
    'No data was saved.',
    'Send any command to start again.',
  ].join('\n')
}

/**
 * Build a simple error message.
 * @param {string} details
 * @returns {string}
 */
export function buildErrorMessage(details) {
  return `⚠️ *Something went wrong.*\n\n${details}\n\nPlease try again or contact your supervisor.`
}
