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
    '  🏥 /admit        — New patient admission',
    '  💓 /vitals       — Record vital signs',
    '  🚨 /fall         — Fall incident report',
    '  🔄 /turning      — Side turning record',
    '  🏃 /rehab        — Rehab session progress',
    '  💊 /med          — Medication record (MAR)',
    '  🆘 /alert        — Emergency clinical alert',
    '  📊 /handover     — AI shift handover summary',
    '',
    '  ⏰ /punchin      — Normal duty: clock in',
    '  🔴 /punchout     — Normal duty: clock out',
    '  🟡 /ot_in        — Overtime: start OT (after /punchout)',
    '  🧾 /ot_out       — Overtime: end OT + get summary',
    '  📋 /attendance   — Today\'s attendance overview',
    '  📈 /ot_report    — Monthly OT payroll report',
    '  🧾 /ot_payroll   — Monthly OT payroll lookup',
    '  🔍 /ot_check     — Check individual OT record',
    '',
    '  👶 /pampers     — Log pampers usage for a patient',
    '  🧻 /wet         — Log wet tissue usage',
    '  🥛 /milk        — Log milk powder usage',
    '  🧤 /gloves      — Log gloves usage',
    '  📦 /stock           — Current stock balance + low-stock alerts',
    '  📊 /usage           — Usage report (today or by month)',
    '  📊 /daily_usage     — Daily inventory usage report',
    '  📅 /monthly_usage   — Monthly usage summary (patients + nurses)',
    '  📦 /low_stock       — Low stock report',
    '  🚨 /abnormal_usage  — Abnormal usage detection',
    '  💰 /billing         — Patient billing summary (e.g. /billing Ali)',
    '  🧾 /audit           — Audit trail (e.g. /audit Nurse Aina, /audit Ali, /audit pampers)',
    '',
    '  📦 /add_stock       — Add new stock (restock / delivery)',
    '  🔧 /adjust_stock    — Manually correct stock balance',
    '  ⚠️ /set_minimum     — Set minimum stock alert level',
    '  💰 /set_price       — Set item unit price for billing',
    '',
    '  ⬅️ /turn_left   — Record LEFT side turn (e.g. /turn_left Room 2)',
    '  ➡️ /turn_right  — Record RIGHT side turn',
    '  🔼 /turn_supine — Record SUPINE (back) position',
    '  ✔️ /turn_done   — Mark turn as done',
    '  📊 /turn_status — Check turning status by room',
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
  lines.push(`⏰ */punchin* — Normal duty: clock in`)
  lines.push(`   Prevents double punch-in`)
  lines.push('')
  lines.push(`🔴 */punchout* — Normal duty: clock out`)
  lines.push(`   Saves normal shift. Prompt to /ot_in if needed.`)
  lines.push('')
  lines.push(`🟡 */ot_in* — Start overtime (after /punchout only)`)
  lines.push(`   Requires completed normal shift`)
  lines.push('')
  lines.push(`🧾 */ot_out* — End overtime + get payroll summary`)
  lines.push(`   OT hours = ot_out − ot_in`)
  lines.push('')
  lines.push(`📋 */attendance* — Today's attendance overview`)
  lines.push(`   Live duty + OT status + completed records`)
  lines.push('')
  lines.push(`📈 */ot_report* — Monthly OT payroll report`)
  lines.push(`   Fields: month (YYYY-MM or "this")`)
  lines.push('')
  lines.push(`🧾 */ot_payroll* — Monthly OT payroll lookup`)
  lines.push(`   Fields: month (YYYY-MM), staff name`)
  lines.push('')
  lines.push(`🔍 */ot_check* — Individual OT record check`)
  lines.push(`   Fields: staff name, date (YYYY-MM-DD)`)
  lines.push('')
  lines.push(`⬅️ */turn_left [Room] NUMBER [Patient]* — Record LEFT side turn`)
  lines.push(`   Example: /turn_left Room 2   or   /turn_left 2 Ali`)
  lines.push('')
  lines.push(`➡️ */turn_right [Room] NUMBER [Patient]* — Record RIGHT side turn`)
  lines.push('')
  lines.push(`🔼 */turn_supine [Room] NUMBER [Patient]* — Record SUPINE position`)
  lines.push('')
  lines.push(`✔️ */turn_done [Room] NUMBER* — Mark turning as done`)
  lines.push('')
  lines.push(`📊 */turn_status [[Room] NUMBER]* — Show turning status`)
  lines.push(`   No room → shows all rooms. With room → shows that room.`)
  lines.push(`   Status: ✅ OK | ⚠️ DUE | 🔴 OVERDUE`)
  lines.push('')
  lines.push(`👶 */pampers* — Log pampers usage (step-by-step: patient, room, size, qty)`)
  lines.push('')
  lines.push(`🧻 */wet* — Log wet tissue usage (patient, room, qty)`)
  lines.push('')
  lines.push(`🥛 */milk* — Log milk powder usage (patient, room, type, qty)`)
  lines.push('')
  lines.push(`🧤 */gloves* — Log gloves usage (size, qty)`)
  lines.push('')
  lines.push(`📦 */stock* — Current stock balance for all items`)
  lines.push(`   Shows low-stock alerts if any item is below minimum.`)
  lines.push('')
  lines.push(`📊 */usage [YYYY-MM | today]* — Usage report`)
  lines.push(`   Example: /usage   /usage today   /usage 2026-05`)
  lines.push('')
  lines.push(`📊 */daily_usage [date]* — Daily inventory usage report`)
  lines.push(`   Example: /daily_usage   /daily_usage 2026-05-22`)
  lines.push('')
  lines.push(`📅 */monthly_usage [YYYY-MM]* — Monthly usage summary`)
  lines.push(`   Example: /monthly_usage   /monthly_usage 2026-05`)
  lines.push('')
  lines.push(`📦 */low_stock* — Items below minimum level`)
  lines.push('')
  lines.push(`🚨 */abnormal_usage [date]* — Detect abnormal patient usage`)
  lines.push(`   Flags patients using more than 2× their average daily usage`)
  lines.push('')
  lines.push(`💰 */billing [patient name]* — Generate monthly billing summary`)
  lines.push(`   Example: /billing Ali   /billing Ali Bin Ahmad   /billing Ali 2026-05`)
  lines.push('')
  lines.push(`🧾 */audit [search]* — Staff accountability & audit trail`)
  lines.push(`   /audit Ali          — search records by patient`)
  lines.push(`   /audit Nurse Aina   — search by nurse (+ suspicious usage check)`)
  lines.push(`   /audit pampers      — search by item`)
  lines.push('')
  lines.push(`📦 */add_stock* — Add new stock (delivery / restock)`)
  lines.push(`🔧 */adjust_stock* — Manually correct stock balance`)
  lines.push(`⚠️ */set_minimum* — Set minimum stock alert level per item`)
  lines.push(`💰 */set_price* — Update item unit price for billing`)
  lines.push('')
  lines.push(`🤖 *NLP Mode* — type naturally without commands:`)
  lines.push(`   "Room 2 Ali pampers 3"  →  auto-saved`)
  lines.push(`   "wet tissue 2 Siti Room 3"  →  auto-saved`)
  lines.push('')
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
