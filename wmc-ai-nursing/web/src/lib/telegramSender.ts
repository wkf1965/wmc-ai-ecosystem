type SendTelegramOtInput = {
  message: string
  chatId?: string
  simulated?: boolean
}

export type TelegramOtResult = {
  simulated: boolean
  mode: "simulation" | "live"
  message: string
  response?: unknown
}

export class TelegramOtError extends Error {
  code: string
  status: number
  details?: unknown

  constructor(message: string, code: string, status = 500, details?: unknown) {
    super(message)
    this.name = "TelegramOtError"
    this.code = code
    this.status = status
    this.details = details
  }
}

export async function sendTelegramOtSummary(input: SendTelegramOtInput): Promise<TelegramOtResult> {
  const message = String(input.message || "").trim()
  if (!message) throw new TelegramOtError("Message is required.", "MISSING_MESSAGE", 400)

  const isSimulated = input.simulated !== false
  if (isSimulated) {
    return {
      simulated: true,
      mode: "simulation",
      message,
      response: {
        status: "success",
        sent: false,
        mode: "simulation",
      },
    }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) throw new TelegramOtError("Missing TELEGRAM_BOT_TOKEN.", "MISSING_BOT_TOKEN", 401)

  const chatId = String(input.chatId || process.env.TELEGRAM_CHAT_ID || "").trim()
  if (!chatId) throw new TelegramOtError("Missing TELEGRAM_CHAT_ID.", "MISSING_CHAT_ID", 400)

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new TelegramOtError(`Telegram API failed with HTTP ${response.status}.`, "TELEGRAM_SEND_FAILED", 502, payload)
  }

  return {
    simulated: false,
    mode: "live",
    message,
    response: payload,
  }
}

export type { SendTelegramOtInput }
