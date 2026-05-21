import { buildWelcomeMessage } from '../utils/messageBuilder.js'
import { log } from '../utils/logger.js'

/**
 * /start — Welcome message and command menu.
 * @param {import('node-telegram-bot-api').default} bot
 */
export function registerStartCommand(bot) {
  bot.onText(/^\/start\b/i, (msg) => {
    const chatId = msg.chat.id
    const firstName = msg.from?.first_name ?? null
    log.cmd('start', chatId, msg.from?.username)

    bot.sendMessage(chatId, buildWelcomeMessage(firstName), { parse_mode: 'Markdown' })
  })
}
