import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filePath = String(searchParams.get("filePath") || "").trim()
  if (!filePath) {
    return NextResponse.json({ ok: false, error: "filePath is required." }, { status: 400 })
  }

  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim()
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN is missing." }, { status: 500 })
  }

  const telegramUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`
  const response = await fetch(telegramUrl, { cache: "no-store" }).catch(() => null)
  if (!response || !response.ok) {
    return NextResponse.json({ ok: false, error: "Unable to fetch telegram photo." }, { status: 502 })
  }

  const contentType = response.headers.get("content-type") || "image/jpeg"
  const buffer = await response.arrayBuffer()
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=60",
    },
  })
}
