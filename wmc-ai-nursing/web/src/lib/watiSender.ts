type SendWatiAlertInput = {
  phoneNumber: string
  patientName: string
  room: string
  riskType: string
  severity: string
  observation: string
  recommendedAction: string
  nurseName: string
  simulated?: boolean
}

export type WatiAlertResult = {
  simulated: boolean
  mode: "simulation" | "live"
  message: string
  response?: unknown
}

export class WatiAlertError extends Error {
  code: string
  status: number
  details?: unknown

  constructor(message: string, code: string, status = 500, details?: unknown) {
    super(message)
    this.name = "WatiAlertError"
    this.code = code
    this.status = status
    this.details = details
  }
}

const toPlainMessage = (payload: SendWatiAlertInput) => {
  return [
    "WMC AI WhatsApp Alert",
    "",
    `Patient name: ${payload.patientName}`,
    `Room number: ${payload.room}`,
    `Risk type: ${payload.riskType}`,
    `Severity level: ${String(payload.severity).toUpperCase()}`,
    `Latest observation: ${payload.observation}`,
    `Recommended action: ${payload.recommendedAction}`,
    `Time: ${new Date().toLocaleString()}`,
    `Nurse in charge: ${payload.nurseName}`,
  ].join("\n")
}

function validateBaseUrl(rawBaseUrl: string) {
  try {
    return new URL(rawBaseUrl)
  } catch {
    throw new WatiAlertError("Invalid WATI base URL.", "INVALID_BASE_URL", 400)
  }
}

function buildLivePayload(phoneNumber: string, message: string, token: string) {
  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone: phoneNumber,
      message,
      messageText: message,
    }),
  }
}

export async function sendWatiAlert(payload: SendWatiAlertInput): Promise<WatiAlertResult> {
  const isSimulated = payload.simulated !== false
  const message = toPlainMessage(payload)

  if (isSimulated) {
    return {
      simulated: true,
      mode: "simulation",
      message,
      response: {
        status: "success",
        mode: "simulation",
        sent: false,
      },
    }
  }

  const token = process.env.WATI_API_TOKEN?.trim()
  if (!token) throw new WatiAlertError("Missing WATI_API_TOKEN environment variable.", "MISSING_TOKEN", 401)

  const rawBaseUrl = process.env.WATI_BASE_URL?.trim() || ""
  if (!rawBaseUrl) throw new WatiAlertError("Missing WATI_BASE_URL environment variable.", "INVALID_BASE_URL", 400)
  validateBaseUrl(rawBaseUrl)

  const channelPhone = process.env.WATI_CHANNEL_PHONE_NUMBER?.trim()
  if (!channelPhone)
    throw new WatiAlertError("Missing WATI_CHANNEL_PHONE_NUMBER environment variable.", "MISSING_CHANNEL_PHONE_NUMBER", 400)
  if (!payload.phoneNumber?.trim()) throw new WatiAlertError("Missing recipient phone number.", "MISSING_PHONE_NUMBER", 400)

  const baseUrl = new URL(rawBaseUrl).toString().replace(/\/$/, "")
  const endpoint = `${baseUrl}/api/v1/sendSessionMessage/${encodeURIComponent(channelPhone)}`

  let externalResponseText: string
  const response = await fetch(endpoint, buildLivePayload(payload.phoneNumber.trim(), message, token))
  try {
    externalResponseText = await response.text()
  } catch {
    externalResponseText = ""
  }

  let externalJson: unknown
  try {
    externalJson = externalResponseText ? JSON.parse(externalResponseText) : { raw: "" }
  } catch {
    externalJson = { raw: externalResponseText }
  }

  if (!response.ok) {
    throw new WatiAlertError(
      `WATI API request failed with HTTP ${response.status}`,
      "WATI_FAILED_RESPONSE",
      502,
      externalJson,
    )
  }

  return {
    simulated: false,
    mode: "live",
    message,
    response: externalJson,
  }
}

export type { SendWatiAlertInput }
