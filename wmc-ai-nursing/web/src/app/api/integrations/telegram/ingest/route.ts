import { NextResponse } from "next/server"
import { appendInventoryEvent, updateDutyRoster, updateInventoryItem, punchInOt, punchOutOt } from "../../../../../lib/server/nursingModuleStore"
import { promises as fs } from "fs"
import path from "path"

type TelegramIngestPayload = {
  command?: string
  args?: Record<string, string | number | undefined>
}

function normalizeInventoryItemId(value: string) {
  const key = String(value || "").trim().toLowerCase()
  if (!key) return ""
  if (key.startsWith("pampers")) return "pampers"
  if (key === "wet tissue" || key === "wet tissu" || key === "wet-tissue") return "wet-tissu"
  if (key.startsWith("wet-tissu")) return "wet-tissu"
  if (key.startsWith("ryles")) return "ryles-tube"
  if (key.startsWith("cbd")) return "cbd-tube"
  if (key.startsWith("prime")) return "prime-edema"
  if (key.startsWith("milk")) return "milk-powder"
  if (key.startsWith("gloves")) return "gloves"
  return key.replace(/\s+/g, "-")
}

const TELEGRAM_RECORDS_FILE = path.join(
  process.cwd(),
  "..",
  "wmc-ai-nursing-coordinator",
  "wmc-ai-nursing-coordinator",
  "telegram-bot-records.json",
)

async function appendTelegramRecord(workflow: string, data: Record<string, unknown>) {
  try {
    const raw = await fs.readFile(TELEGRAM_RECORDS_FILE, "utf8").catch(() => '{"records":[]}')
    const parsed = JSON.parse(raw) as { records?: Array<Record<string, unknown>> }
    const records = Array.isArray(parsed.records) ? parsed.records : []
    records.unshift({
      id: `ingest-${Date.now()}`,
      timestamp: new Date().toISOString(),
      workflow,
      data,
      savedBy: "telegram-ingest",
    })
    await fs.writeFile(
      TELEGRAM_RECORDS_FILE,
      JSON.stringify({ records: records.slice(0, 2000) }, null, 2),
      "utf8",
    )
  } catch {
    // Do not fail the main request on optional write-through.
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as TelegramIngestPayload | null
  const command = String(payload?.command || "").trim().toLowerCase()
  const args = payload?.args || {}

  try {
    if (command === "inventory_update") {
      const itemId = normalizeInventoryItemId(String(args.itemId || args.itemName || "").trim())
      if (!itemId) return NextResponse.json({ ok: false, error: "itemId is required." }, { status: 400 })
      const actionTypeRaw = String(args.actionType || "").trim().toLowerCase()
      const actionType = (["taken", "given", "used", "added"].includes(actionTypeRaw) ? actionTypeRaw : "used") as
        | "taken"
        | "given"
        | "used"
        | "added"
      if (args.quantityChange !== undefined) {
        const eventData = await appendInventoryEvent({
          itemId,
          itemName: String(args.itemName || itemId),
          quantityChange: Number(args.quantityChange),
          unit: String(args.unit || ""),
          room: String(args.room || ""),
          patientName: String(args.patientName || ""),
          personInCharge: String(args.personInCharge || ""),
          actionType,
          source: "telegram",
          sourceStatus: "live",
          recordedAt: String(args.recordedAt || "") || undefined,
        })
        return NextResponse.json({ ok: true, module: "inventory", data: eventData })
      }

      const quantity = args.quantity === undefined ? undefined : Number(args.quantity)
      if (quantity !== undefined) {
        const eventData = await appendInventoryEvent({
          itemId,
          itemName: String(args.itemName || itemId),
          quantityChange: quantity,
          unit: String(args.unit || ""),
          room: String(args.room || ""),
          patientName: String(args.patientName || ""),
          personInCharge: String(args.personInCharge || ""),
          actionType: "added",
          source: "telegram",
          sourceStatus: "live",
          recordedAt: String(args.recordedAt || "") || undefined,
        })
        return NextResponse.json({ ok: true, module: "inventory", data: eventData })
      }

      const data = await updateInventoryItem(itemId, {
        personInCharge: args.personInCharge === undefined ? undefined : String(args.personInCharge),
      })
      return NextResponse.json({ ok: true, module: "inventory", data })
    }

    if (command === "ot_punch_in") {
      const nurseName = String(args.nurseName || "").trim()
      if (!nurseName) return NextResponse.json({ ok: false, error: "nurseName is required." }, { status: 400 })
      const data = await punchInOt(nurseName)
      return NextResponse.json({ ok: true, module: "ot", data })
    }

    if (command === "ot_punch_out") {
      const nurseName = String(args.nurseName || "").trim()
      if (!nurseName) return NextResponse.json({ ok: false, error: "nurseName is required." }, { status: 400 })
      const data = await punchOutOt(nurseName)
      return NextResponse.json({ ok: true, module: "ot", data })
    }

    if (command === "duty_update") {
      const data = await updateDutyRoster({
        rowId: args.rowId ? String(args.rowId) : undefined,
        onDuty: args.onDuty === undefined ? undefined : Number(args.onDuty),
        nurseNames: args.nurseNames === undefined ? undefined : String(args.nurseNames),
        nurseLeaveList: args.nurseLeaveList === undefined ? undefined : String(args.nurseLeaveList),
        day: args.day === undefined ? undefined : String(args.day),
        morning: args.morning === undefined ? undefined : String(args.morning),
        evening: args.evening === undefined ? undefined : String(args.evening),
        night: args.night === undefined ? undefined : String(args.night),
      })
      return NextResponse.json({ ok: true, module: "duty-roster", data })
    }

    if (command === "vitals_create") {
      const vitalsData = {
        patientName: String(args.patientName || "").trim(),
        room: String(args.roomNumber || args.room || "").trim(),
        bp: String(args.bloodPressure || args.bp || "").trim(),
        pulse: String(args.pulseHeartRate || args.pulse || "").trim(),
        temperature: String(args.temperature || "").trim(),
        spo2: String(args.spo2 || "").trim(),
        bloodSugar: String(args.bloodSugar || "").trim(),
        remark: String(args.remark || "").trim(),
      }
      if (!vitalsData.patientName) {
        return NextResponse.json({ ok: false, error: "patientName is required." }, { status: 400 })
      }
      await appendTelegramRecord("vitals", vitalsData)
      return NextResponse.json({ ok: true, module: "vital-signs", data: vitalsData })
    }

    return NextResponse.json({ ok: false, error: "Unsupported command." }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to ingest Telegram update." }, { status: 500 })
  }
}
