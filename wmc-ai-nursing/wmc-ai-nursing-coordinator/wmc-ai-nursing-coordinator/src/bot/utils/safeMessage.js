/**
 * Safe Telegram messaging — HTML escaping + send fallbacks.
 */

/**
 * Escape dynamic text for Telegram HTML parse_mode.
 * @param {unknown} value
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function htmlBold(value) {
  return `<b>${escapeHtml(value)}</b>`
}

export function htmlField(label, value) {
  return `${label} ${escapeHtml(value)}`
}

export function stripHtml(text) {
  return String(text ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export function stripMarkdown(text) {
  return String(text ?? '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
}

export function toPlainText(text) {
  return stripMarkdown(stripHtml(text))
}

/**
 * Send a message with parse_mode fallback to plain text.
 * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
 */
export async function safeSendMessage(bot, chatId, text, options = {}) {
  const primaryOptions = { ...options }

  try {
    const result = await bot.sendMessage(chatId, text, primaryOptions)
    return { ok: true, result }
  } catch (err) {
    const description = err?.response?.body?.description ?? err?.message ?? String(err)
    console.error('[telegram] sendMessage failed:', description)

    try {
      const plain = toPlainText(text)
      const result = await bot.sendMessage(chatId, plain)
      console.warn('[telegram] sent plain-text fallback')
      return { ok: true, result, fallback: 'plain' }
    } catch (err2) {
      const fallbackError = err2?.response?.body?.description ?? err2?.message ?? String(err2)
      console.error('[telegram] plain fallback failed:', fallbackError)
      return { ok: false, error: fallbackError }
    }
  }
}

/**
 * Wrap bot.sendMessage with try/catch + plain-text fallback for all bot messages.
 */
export function patchBotSendMessage(bot) {
  if (bot.__wmcSafeSendPatched) return bot
  const original = bot.sendMessage.bind(bot)

  bot.sendMessage = async function patchedSendMessage(chatId, text, options) {
    try {
      return await original(chatId, text, options)
    } catch (err) {
      const description = err?.response?.body?.description ?? err?.message ?? String(err)
      console.error('[telegram] sendMessage failed:', description)

      try {
        const plain = toPlainText(text)
        return await original(chatId, plain)
      } catch (err2) {
        const fallbackError = err2?.response?.body?.description ?? err2?.message ?? String(err2)
        console.error('[telegram] plain fallback failed:', fallbackError)
        return null
      }
    }
  }

  bot.__wmcSafeSendPatched = true
  return bot
}
