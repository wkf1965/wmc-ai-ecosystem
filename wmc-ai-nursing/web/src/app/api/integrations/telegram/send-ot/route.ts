import { NextResponse } from "next/server"
import { sendTelegramOtSummary, TelegramOtError, type TelegramOtResult, type SendTelegramOtInput } from "../../../../../lib/telegramSender"

type RouteInput = {
  message?: string
  chatId?: string
  simulated?: boolean
}

type RouteResponse = {
  route: string
  generatedAt: string
  status: "success" | "error"
  ok: boolean
  simulated?: boolean
  mode?: TelegramOtResult["mode"]
  message?: string
  sent?: boolean
  response?: unknown
  error?: string
  code?: string
  details?: unknown
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as RouteInput | null
  const message = String(payload?.message || "").trim()
  if (!message) {
    return NextResponse.json({ error: "Missing OT summary message." }, { status: 400 })
  }

  const input: SendTelegramOtInput = {
    message,
    chatId: String(payload?.chatId || "").trim() || undefined,
    simulated: payload?.simulated !== false,
  }

  try {
    const result = await sendTelegramOtSummary(input)
    const response: RouteResponse = {
      route: "api/integrations/telegram/send-ot",
      generatedAt: new Date().toISOString(),
      status: "success",
      ok: true,
      simulated: result.simulated,
      mode: result.mode,
      message: result.message,
      sent: !result.simulated,
      response: result.response,
    }
    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof TelegramOtError) {
      return NextResponse.json(
        {
          route: "api/integrations/telegram/send-ot",
          generatedAt: new Date().toISOString(),
          status: "error",
          ok: false,
          error: error.message,
          code: error.code,
          details: error.details,
        } satisfies Omit<RouteResponse, "simulated" | "mode" | "message" | "response" | "sent">,
        { status: error.status },
      )
    }

    return NextResponse.json(
      {
        route: "api/integrations/telegram/send-ot",
        generatedAt: new Date().toISOString(),
        status: "error",
        ok: false,
        error: "Unable to send Telegram OT summary.",
        code: "UNKNOWN_ERROR",
      },
      { status: 500 },
    )
  }
}
