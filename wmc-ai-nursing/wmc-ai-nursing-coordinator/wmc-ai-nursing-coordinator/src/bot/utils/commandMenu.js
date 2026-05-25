/**
 * Telegram Command Menu
 *
 * Registers the command list shown in Telegram's "/" menu (the blue pill
 * suggestions that appear as users type). Calls setMyCommands() once on
 * bot startup — idempotent, safe to call every time the bot restarts.
 *
 * Groups (shown as section labels in Telegram Desktop / iOS / Android):
 *   NURSING       — utility + clinical workflow commands
 *   SIDE TURNING  — quick one-shot room turning commands
 *   ATTENDANCE/OT — punch-in/out and payroll report commands
 *
 * Note: Telegram limits command names to a–z, 0–9, _ and max 32 chars.
 *       Descriptions max 256 chars. Max 100 commands per scope.
 */

import { log } from './logger.js'

// ── Command definitions ───────────────────────────────────────────────────────

/**
 * Full ordered list passed to setMyCommands().
 * Telegram does not natively render group headers — we put the group label
 * in the description of the first command in each block as context.
 */
const BOT_COMMANDS = [
  // ── NURSING ──────────────────────────────────────────────────────────────
  {
    command:     'start',
    description: '🏥 Welcome — show all available commands',
  },
  {
    command:     'help',
    description: '📋 Full command reference with usage examples',
  },
  {
    command:     'handover',
    description: '📊 AI shift handover summary',
  },
  {
    command:     'admit',
    description: '🏥 New patient admission record',
  },
  {
    command:     'vitals',
    description: '💓 Record vital signs',
  },
  {
    command:     'fall',
    description: '🚨 Fall incident report',
  },
  {
    command:     'turning',
    description: '🔄 Full side turning record (step-by-step)',
  },
  {
    command:     'rehab',
    description: '🏃 Rehab session progress',
  },
  {
    command:     'med',
    description: '💊 Medication administration record (MAR)',
  },
  {
    command:     'alert',
    description: '🆘 Emergency clinical alert',
  },

  // ── SIDE TURNING (quick commands) ────────────────────────────────────────
  {
    command:     'turn_left',
    description: '⬅️ Record LEFT side turn — usage: /turn_left Room 2',
  },
  {
    command:     'turn_right',
    description: '➡️ Record RIGHT side turn — usage: /turn_right Room 2',
  },
  {
    command:     'turn_supine',
    description: '🔼 Record SUPINE (back) position — usage: /turn_supine Room 2',
  },
  {
    command:     'turn_done',
    description: '✔️ Mark turn as done — usage: /turn_done Room 2',
  },
  {
    command:     'turn_status',
    description: '📊 Check turning status — /turn_status or /turn_status Room 2',
  },

  // ── ATTENDANCE / OT ───────────────────────────────────────────────────────
  {
    command:     'punchin',
    description: '🟢 Clock in — record normal duty start',
  },
  {
    command:     'punchout',
    description: '🔴 Clock out — record normal duty end',
  },
  {
    command:     'ot_in',
    description: '🟡 OT start — must /punchout first',
  },
  {
    command:     'ot_out',
    description: '🧾 OT end — calculates OT hours + estimated pay',
  },
  {
    command:     'attendance',
    description: '📋 Today\'s attendance overview (duty + OT status)',
  },
  {
    command:     'ot_report',
    description: '📈 Monthly OT payroll report — usage: /ot_report',
  },
  {
    command:     'ot_payroll',
    description: '🧾 Monthly OT payroll lookup by staff name',
  },
  {
    command:     'ot_check',
    description: '🔍 Check individual OT record by staff + date',
  },

  // ── INVENTORY ─────────────────────────────────────────────────────────────
  {
    command:     'pampers',
    description: '👶 Log pampers usage for a patient',
  },
  {
    command:     'wet',
    description: '🧻 Log wet tissue usage for a patient',
  },
  {
    command:     'milk',
    description: '🥛 Log milk powder usage for a patient',
  },
  {
    command:     'gloves',
    description: '🧤 Log gloves stock usage',
  },
  {
    command:     'stock',
    description: '📦 Show current stock balance and low-stock alerts',
  },
  {
    command:     'usage',
    description: '📊 Show usage report — /usage today or /usage 2026-05',
  },
  {
    command:     'daily_usage',
    description: '📊 Daily inventory usage report — /daily_usage or /daily_usage 2026-05-22',
  },
  {
    command:     'monthly_usage',
    description: '📅 Monthly usage summary — /monthly_usage or /monthly_usage 2026-05',
  },
  {
    command:     'low_stock',
    description: '📦 Low stock report — items below minimum level',
  },
  {
    command:     'abnormal_usage',
    description: '🚨 Abnormal usage report — /abnormal_usage or /abnormal_usage 2026-05-22',
  },
  {
    command:     'billing',
    description: '💰 Patient billing summary — /billing Ali or /billing Ali 2026-05',
  },
  {
    command:     'audit',
    description: '🧾 Audit trail — /audit Ali | /audit Nurse Aina | /audit pampers',
  },

  // ── ADMIN STOCK CONTROL ───────────────────────────────────────────────────
  {
    command:     'add_stock',
    description: '📦 Add new stock (restock / delivery) — multi-step',
  },
  {
    command:     'adjust_stock',
    description: '🔧 Manually adjust stock balance (correction) — multi-step',
  },
  {
    command:     'set_minimum',
    description: '⚠️ Set minimum stock alert level — multi-step',
  },
  {
    command:     'set_price',
    description: '💰 Set item unit price for billing — multi-step',
  },

  // ── UTILITY ───────────────────────────────────────────────────────────────
  {
    command:     'cancel',
    description: '❌ Cancel the current active workflow',
  },
]

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Push the command menu to Telegram.
 *
 * Uses the default scope (BotCommandScopeDefault) so the menu is visible
 * in all private chats and group chats where the bot is present.
 *
 * @param {import('node-telegram-bot-api').default} bot
 * @returns {Promise<void>}
 */
export async function registerCommandMenu(bot) {
  try {
    await bot.setMyCommands(BOT_COMMANDS)
    log.info(`[command-menu] ✅ Telegram command menu registered (${BOT_COMMANDS.length} commands)`)
  } catch (err) {
    // Non-fatal — the bot works fine without the menu; it just won't show
    // the autocomplete suggestions in the Telegram UI.
    log.warn('[command-menu] ⚠️  setMyCommands failed (bot still works):', err?.message ?? err)
  }
}

/** Export the raw list for inspection / tests. */
export { BOT_COMMANDS }
