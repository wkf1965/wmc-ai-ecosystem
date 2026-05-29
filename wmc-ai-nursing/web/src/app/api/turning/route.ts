import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import { addTurningRecord, readNursingModuleStore } from "../../../lib/server/nursingModuleStore"
import { getPatientByRoom, saveTurningToSheet, normaliseRoom } from "../../../lib/server/googleSheets"

export async function GET() {
  const store = await readNursingModuleStore()
  return NextResponse.json({ ok: true, data: store.turningRecords })
}

type Payload = {
  room?: string
  patientName?: string
  position?: string
  nurseName?: string
  photoBase64?: string
  photoName?: string
}

/** Persist an optional turning photo (data URL) to disk. Returns the saved path or "". */
async function savePhoto(photoBase64: string | undefined, room: string): Promise<string> {
  if (!photoBase64) return ""
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(photoBase64)
  if (!match) return ""
  const ext = match[1].split("/")[1]?.replace("jpeg", "jpg") || "jpg"
  const buffer = Buffer.from(match[2], "base64")
  // Guard against very large uploads (~8 MB)
  if (buffer.length > 8 * 1024 * 1024) return ""
  const dir = path.join(process.cwd(), ".mobile-uploads", "turning")
  await fs.mkdir(dir, { recursive: true })
  const file = `${normaliseRoom(room) || "room"}-${Date.now()}.${ext}`
  await fs.writeFile(path.join(dir, file), buffer)
  return path.join(".mobile-uploads", "turning", file)
}

async function resolvePatient(room: string, provided: string) {
  if (provided) return provided
  try {
    const fromSheet = await getPatientByRoom(room)
    if (fromSheet) return fromSheet
  } catch {
    // ignore
  }
  try {
    const store = await readNursingModuleStore()
    const key = normaliseRoom(room)
    const isPlaceholder = (name: string) => /^room\s.*patient$/i.test(name.trim())
    const match = store.turningRecords.find(
      (r) => normaliseRoom(r.room) === key && r.patientName && !isPlaceholder(r.patientName),
    )
    if (match?.patientName) return match.patientName
  } catch {
    // ignore
  }
  return `Room ${room} patient`
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null
  const room = String(payload?.room || "").trim()
  const position = String(payload?.position || "").trim()
  const nurseName = String(payload?.nurseName || "").trim()
  if (!room) return NextResponse.json({ ok: false, error: "room is required." }, { status: 400 })
  if (!position) return NextResponse.json({ ok: false, error: "position is required." }, { status: 400 })
  if (!nurseName) return NextResponse.json({ ok: false, error: "nurseName is required." }, { status: 400 })

  const patientName = await resolvePatient(room, String(payload?.patientName || "").trim())

  let photoPath = ""
  try {
    photoPath = await savePhoto(payload?.photoBase64, room)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[turning] photo save failed:", err instanceof Error ? err.message : err)
  }

  try {
    const records = await addTurningRecord({ patientName, room, position, nurseName, source: "frontend" })
    const saved = records[0]
    const sheet = await saveTurningToSheet({
      room,
      patientName,
      position,
      nurseName,
      nextTurningDueAt: saved?.nextTurningDueAt,
      status: saved?.status,
      photoPath,
    })
    return NextResponse.json({ ok: true, data: saved, sheetSynced: sheet.ok, photoSaved: Boolean(photoPath) })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save turning record." },
      { status: 400 },
    )
  }
}
