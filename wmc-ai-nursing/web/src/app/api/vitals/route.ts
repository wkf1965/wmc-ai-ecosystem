import { NextResponse } from "next/server"
import { addVitalsRecord, addClinicalAlerts, readMobileStore } from "../../../lib/server/mobileRecordsStore"
import { saveVitalsToSheet, saveClinicalAlertToSheet, getPatientByRoom } from "../../../lib/server/googleSheets"
import { classifyRisk, computeRiskScore, detectClinicalAlerts, detectNutritionConcern } from "../../../lib/server/clinicalAlerts"
import { runAiBrainPipeline } from "../../../ai/pipeline"
import { addDoctorReviewQueueItem } from "../../../lib/server/doctorReviewQueueStore"
import { addFamilyUpdateQueueItem } from "../../../lib/server/familyUpdateQueueStore"

export async function GET() {
  const store = await readMobileStore()
  return NextResponse.json({ ok: true, data: store.vitals })
}

type Payload = {
  room?: string
  patientName?: string
  temperature?: string
  bloodPressure?: string
  pulse?: string
  spo2?: string
  glucose?: string
  nutrition?: string
  mobility?: string
  appetite?: string
  turningPosition?: string
  painScore?: string | number
  fallIncident?: boolean | string
  conditions?: string[]
  turningOverdue?: boolean | string
  remark?: string
  text?: string
  nurseName?: string
}

/** Looks like the "Room 201 patient" placeholder rather than a real name. */
function isPlaceholderName(name: string) {
  return !name || /^room\s.*patient$/i.test(name.trim())
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null
  const room = String(payload?.room || "").trim()
  const nurseName = String(payload?.nurseName || "").trim()
  if (!room) return NextResponse.json({ ok: false, error: "room is required." }, { status: 400 })
  if (!nurseName) return NextResponse.json({ ok: false, error: "nurseName is required." }, { status: 400 })

  // ── Always resolve patient by room (never store the placeholder) ──────────
  let patientName = String(payload?.patientName || "").trim()
  if (isPlaceholderName(patientName)) {
    try {
      const looked = await getPatientByRoom(room)
      if (looked) patientName = looked
    } catch {
      // keep whatever we have
    }
  }
  if (isPlaceholderName(patientName)) patientName = "" // avoid persisting placeholder

  const bloodPressure = String(payload?.bloodPressure || "").trim()
  const pulse = String(payload?.pulse || "").trim()
  const spo2 = String(payload?.spo2 || "").trim()
  const baseRemark = String(payload?.remark || "").trim()
  const nutrition =
    detectNutritionConcern(payload?.nutrition) ||
    detectNutritionConcern(payload?.appetite) ||
    detectNutritionConcern(baseRemark) ||
    ""
  const mobility = String(payload?.mobility || "").trim()
  const turningPosition = String(payload?.turningPosition || "").trim()
  const painScore = payload?.painScore ?? null
  const fallIncident = payload?.fallIncident ?? null
  const conditions = Array.isArray(payload?.conditions) ? payload.conditions.filter(Boolean).map(String) : []

  // Fold the extended clinical observations into the stored remark.
  const remark =
    [
      baseRemark && !/(mobility|appetite|pain|fall|position|condition)/i.test(baseRemark) ? baseRemark : "",
      conditions.length ? `Condition: ${conditions.join(", ")}` : "",
      mobility ? `Mobility: ${mobility}` : "",
      nutrition ? `Appetite: ${nutrition}` : "",
      turningPosition ? `Position: ${turningPosition}` : "",
      painScore != null && String(painScore) !== "" ? `Pain: ${painScore}/10` : "",
      fallIncident === true || /^(true|yes|1|fall)/i.test(String(fallIncident ?? "")) ? "Fall incident" : "",
    ]
      .filter(Boolean)
      .join("; ") || baseRemark

  const record = await addVitalsRecord({
    room,
    patientName,
    temperature: String(payload?.temperature || "").trim(),
    bloodPressure,
    pulse,
    spo2,
    glucose: String(payload?.glucose || "").trim(),
    remark,
    nurseName,
  })

  const sheet = await saveVitalsToSheet(record)

  // ── Clinical risk detection ───────────────────────────────────────────────
  const detected = detectClinicalAlerts({
    bloodPressure,
    pulse,
    spo2,
    temperature: String(payload?.temperature || ""),
    nutrition,
    mobility,
    painScore,
    fallIncident,
    conditions,
  })
  const risk = classifyRisk(detected)
  const riskScore = computeRiskScore(detected)

  // ── AI Brain Pipeline — nlp → risk → alert → doctor → family ───────────
  const noteText = String(payload?.text || payload?.remark || "").trim()
  const pipeline = runAiBrainPipeline({
    text: noteText,
    room,
    patientName,
    bloodPressure,
    pulse,
    spo2,
    temperature: String(payload?.temperature || ""),
    nutrition,
    appetite: payload?.appetite,
    mobility,
    conditions,
    remark: baseRemark,
    requestedAt: record.recordedAt,
  })
  if (pipeline.riskLevel !== "LOW") {
    // eslint-disable-next-line no-console
    console.log(
      `[AiBrain] level=${pipeline.riskLevel} score=${pipeline.riskScore} categories: ${pipeline.risk.categories.join(", ")} alert priority: ${pipeline.alert.priority ?? "none"}`,
    )
  }

  let doctorQueueItem = null
  if (pipeline.doctorReview.queueItem) {
    doctorQueueItem = await addDoctorReviewQueueItem({
      ...pipeline.doctorReview.queueItem,
      nurseName,
      source: "telegram",
    })
    // eslint-disable-next-line no-console
    console.log(`[DoctorReviewQueue] queued ${doctorQueueItem.patientName || "Unknown"} room ${doctorQueueItem.room} → ${doctorQueueItem.status}`)
  }
  let familyQueueItem = null
  if (pipeline.familyMessage) {
    familyQueueItem = await addFamilyUpdateQueueItem({
      room,
      patientName,
      riskLevel: pipeline.riskLevel,
      familyMessage: pipeline.familyMessage,
      createdAt: record.recordedAt,
      nurseName,
      source: "telegram",
    })
    // eslint-disable-next-line no-console
    console.log(`[FamilyUpdateQueue] queued ${familyQueueItem.patientName || "Unknown"} room ${familyQueueItem.room} → ${familyQueueItem.status}`)
  }
  let alerts: Awaited<ReturnType<typeof addClinicalAlerts>> = []
  if (detected.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[ClinicalAlert] risk=${risk}(${riskScore}) ${detected.length} alert(s) for ${patientName || "(unknown)"} room ${room}:`,
      detected.map((d) => `${d.severity}:${d.alertType}`).join(", "),
    )
    alerts = await addClinicalAlerts(
      detected.map((d) => ({
        patientName: patientName || `Unknown (Room ${room})`,
        room,
        alertType: d.alertType,
        severity: d.severity,
        detail: d.detail,
        nurseName,
        detectedAt: record.recordedAt,
      })),
    )
    for (const a of alerts) {
      await saveClinicalAlertToSheet(a)
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      ...record,
      patientName,
      nutrition,
      mobility,
      turningPosition,
      conditions,
      riskLevel: pipeline.riskLevel,
      riskScore: pipeline.riskScore,
      reasons: pipeline.reasons,
      nursingActions: pipeline.actions,
      doctorReview: pipeline.doctorReviewFlag,
      doctorQueue: pipeline.doctorQueueStatus,
      familyUpdate: pipeline.familyUpdateFlag,
      familyMessage: pipeline.familyMessage,
      recheckTime: pipeline.recheckTime,
    },
    sheetSynced: sheet.ok,
    alerts,
    riskLevel: pipeline.riskLevel,
    riskScore: pipeline.riskScore,
    categories: pipeline.risk.categories,
    reasons: pipeline.reasons,
    nursingActions: pipeline.actions,
    doctorReview: pipeline.doctorReviewFlag,
    doctorQueue: pipeline.doctorQueueStatus,
    doctorQueueItem,
    familyQueueItem,
    alert: {
      sendTelegramAlert: pipeline.alert.sendTelegramAlert,
      notifyDoctor: pipeline.alert.notifyDoctor,
      notifyFamily: pipeline.alert.notifyFamily,
      priority: pipeline.alert.priority,
      alertMessage: pipeline.alert.alertMessage,
    },
    familyUpdate: pipeline.familyUpdateFlag,
    familyMessage: pipeline.familyMessage,
    recheckTime: pipeline.recheckTime,
    alertMessage: pipeline.alert.alertMessage,
    telegramReply: pipeline.telegramReply,
  })
}
