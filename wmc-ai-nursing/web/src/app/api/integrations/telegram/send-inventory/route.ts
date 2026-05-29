import { NextResponse } from "next/server"
import {
  sendTelegramMessage,
  TelegramOtError,
  type TelegramOtResult,
  type SendTelegramOtInput,
} from "../../../../../lib/telegramSender"

type RouteInput = {
  itemId?: string
  itemName?: string
  quantity?: number
  unit?: string
  personInCharge?: string
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
  const itemId = String(payload?.itemId || "").trim()
  const itemName = String(payload?.itemName || "").trim()
  const personInCharge = String(payload?.personInCharge || "").trim()
  const unit = String(payload?.unit || "").trim()
  const quantity = Number(payload?.quantity ?? 0)

  if (!itemId || !itemName) {
    return NextResponse.json({ error: "itemId and itemName are required." }, { status: 400 })
  }

  const message = [
    "WMC Nursing Inventory Update",
    "",
    `Item: ${itemName} (${itemId})`,
    `Quantity: ${Number.isFinite(quantity) ? Math.max(0, quantity) : 0} ${unit || "units"}`,
    `Person in charge: ${personInCharge || "Unassigned"}`,
    `Updated at: ${new Date().toLocaleString()}`,
  ].join("\n")

  const input: SendTelegramOtInput = {
    message,
    chatId: String(payload?.chatId || "").trim() || undefined,
    simulated: payload?.simulated !== false,
  }

  try {
    const result = await sendTelegramMessage(input)
    const response: RouteResponse = {
      route: "api/integrations/telegram/send-inventory",
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
          route: "api/integrations/telegram/send-inventory",
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
        route: "api/integrations/telegram/send-inventory",
        generatedAt: new Date().toISOString(),
        status: "error",
        ok: false,
        error: "Unable to send Telegram inventory update.",
        code: "UNKNOWN_ERROR",
      },
      { status: 500 },
    )
  }
}
