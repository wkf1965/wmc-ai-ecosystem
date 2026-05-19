import { NextResponse } from "next/server"
import { sendWatiAlert, type SendWatiAlertInput, WatiAlertError, type WatiAlertResult } from "../../../../../lib/watiSender"

type RouteInput = {
  to?: string
  patientId?: string
  patientName?: string
  room?: string
  riskType?: string
  severity?: string
  observation?: string
  recommendedAction?: string
  nurseName?: string
  message?: string
  phoneNumber?: string
  simulated?: boolean
}

type RouteResponse = {
  route: string
  generatedAt: string
  status: "success" | "error"
  ok: boolean
  simulated?: boolean
  mode?: WatiAlertResult["mode"]
  message?: string
  sent?: boolean
  response?: unknown
  to?: string
  patientId?: string
  error?: string
  code?: string
  details?: unknown
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as RouteInput | null
  if (!payload?.message && !payload?.patientName) {
    return NextResponse.json({ error: "Missing recipient or message payload." }, { status: 400 })
  }

  const watiInput: SendWatiAlertInput = {
    phoneNumber: String(payload?.phoneNumber || ""),
    patientName: String(payload?.patientName || "Unknown patient"),
    room: String(payload?.room || "Unknown room"),
    riskType: String(payload?.riskType || "General alert"),
    severity: String(payload?.severity || "yellow"),
    observation: String(payload?.observation || payload?.message || ""),
    recommendedAction: String(payload?.recommendedAction || "Review patient condition."),
    nurseName: String(payload?.nurseName || payload?.to || "Unknown nurse"),
    simulated: true,
  }

  try {
    const result = await sendWatiAlert(watiInput)
    const responsePayload = result.simulated
      ? {
          status: "success",
          mode: result.mode,
          sent: false,
          messagePreview: result.message.slice(0, 120),
        }
      : result.response
    const response: RouteResponse = {
      route: "api/integrations/wati/send-alert",
      generatedAt: new Date().toISOString(),
      status: "success",
      ok: true,
      simulated: result.simulated,
      mode: result.mode,
      message: result.message,
      sent: false,
      response: responsePayload,
      patientId: payload?.patientId,
      to: payload?.to,
    }

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof WatiAlertError) {
      return NextResponse.json(
        {
          route: "api/integrations/wati/send-alert",
          generatedAt: new Date().toISOString(),
          status: "error",
          ok: false,
          error: error.message,
          code: error.code,
          details: error.details,
        } satisfies Omit<RouteResponse, "simulated" | "mode" | "to" | "patientId" | "message" | "response">,
        { status: error.status },
      )
    }

    return NextResponse.json(
      {
        route: "api/integrations/wati/send-alert",
        generatedAt: new Date().toISOString(),
        status: "error",
        ok: false,
        error: "Unable to process WATI alert request.",
        code: "UNKNOWN_ERROR",
      },
      { status: 500 },
    )
  }
}
