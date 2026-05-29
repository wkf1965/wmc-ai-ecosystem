import { NextResponse } from "next/server"
import { addTurningPhotoAssessment, readTurningPhotoAssessments, updateTurningPhotoScoringStatus } from "../../../lib/server/turningPhotoStore"
import { readTurningRows } from "../../../lib/server/turningData"
import { scoreTurningPhoto } from "../../../lib/server/turningPhotoScorer"
import { sendTelegramMessage } from "../../../lib/telegramSender"
import { verifyTurningPhoto } from "../../../lib/server/turningPhotoVerifier"

type PostPayload = {
  action?: string
  id?: string
  recordId?: string
  patientName?: string
  room?: string
  nurseName?: string
  turningPosition?: string
  turningTime?: string
  uploadedAt?: string
  photoFileId?: string
  photoFilePath?: string
  source?: "telegram" | "api"
  uploadSourceHint?: "camera_live" | "gallery_upload" | "unknown"
}

function timingComplianceByRow(recordId: string, fallback: "on_time" | "due_soon" | "overdue" = "on_time") {
  if (!recordId) return fallback
  return fallback
}

export async function GET() {
  const store = await readTurningPhotoAssessments()

  const now = Date.now()
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const weekStart = now - 7 * 24 * 60 * 60 * 1000

  const buildRank = (fromTs: number) => {
    const map = new Map<string, { nurseName: string; totalAllowance: number; totalScore: number; count: number }>()
    for (const row of store.assessments) {
      const ts = new Date(row.uploadedAt).getTime()
      if (Number.isNaN(ts) || ts < fromTs) continue
      const key = row.nurseName.toLowerCase()
      const current = map.get(key) || { nurseName: row.nurseName, totalAllowance: 0, totalScore: 0, count: 0 }
      current.totalAllowance += Number(row.allowanceEarned || 0)
      current.totalScore += Number(row.overallScore || 0)
      current.count += 1
      map.set(key, current)
    }
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        averageScore: row.count ? Number((row.totalScore / row.count).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.totalAllowance - a.totalAllowance || b.averageScore - a.averageScore)
  }

  return NextResponse.json({
    ok: true,
    data: store.assessments,
    leaderboard: {
      daily: buildRank(dayStart.getTime()),
      weekly: buildRank(weekStart),
    },
  })
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PostPayload | null
  const action = String(payload?.action || "").trim().toLowerCase()

  // ── Retry scoring for existing assessment ───────────────────────────────────
  if (action === "retry_scoring") {
    const assessmentId = String(payload?.id || "").trim()
    if (!assessmentId) {
      return NextResponse.json({ ok: false, error: "id is required for retry_scoring." }, { status: 400 })
    }
    // eslint-disable-next-line no-console
    console.log("[turning-photo-route] Retry scoring requested for assessment:", assessmentId)

    const store = await readTurningPhotoAssessments()
    const existing = store.assessments.find((r) => r.id === assessmentId)
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Assessment not found." }, { status: 404 })
    }

    // Mark as PENDING first
    await updateTurningPhotoScoringStatus({
      id: assessmentId,
      scoringStatus: "PENDING",
      scoringError: null,
      scoringAttempts: (existing.scoringAttempts || 0) + 1,
    })
    // eslint-disable-next-line no-console
    console.log("[turning-photo-route] Assessment marked PENDING for retry")

    // Re-run scoring
    const turningRows = await readTurningRows().catch(() => [])
    const matchingRow = turningRows.find((r) => r.recordId === existing.recordId || (r.patientName === existing.patientName && r.room === existing.room))
    const timingCompliance = matchingRow?.status === "overdue" ? "overdue" : matchingRow?.status === "due_soon" ? "due_soon" : "on_time"

    // eslint-disable-next-line no-console
    console.log("[turning-photo-route] Running AI scoring for retry — model: gpt-4.1-mini")
    const scoreResult = await scoreTurningPhoto({
      turningPosition: existing.turningPosition,
      timingCompliance,
      photoFilePath: existing.photoFilePath,
      patientName: existing.patientName,
      room: existing.room,
      galleryUploadWarning: existing.galleryUploadWarning,
      lateUpload: existing.lateUpload,
      invalidTurningEvidence: existing.invalidTurningEvidence,
      duplicateImageHash: existing.duplicateImageHash,
    })

    // eslint-disable-next-line no-console
    console.log("[turning-photo-route] Retry scoring result:", scoreResult.scoringStatus, "| Error:", scoreResult.scoringError)

    const updated = await updateTurningPhotoScoringStatus({
      id: assessmentId,
      scoringStatus: scoreResult.scoringStatus,
      scoringError: scoreResult.scoringError,
      scoringAttempts: (existing.scoringAttempts || 0) + 1,
      aiModel: scoreResult.aiModel,
      postureScore: scoreResult.postureScore,
      safetyScore: scoreResult.safetyScore,
      timingScore: scoreResult.timingScore,
      documentationScore: scoreResult.documentationScore,
      overallScore: scoreResult.overallScore,
      allowanceEarned: scoreResult.allowanceEarned,
      scorePenalty: scoreResult.scorePenalty,
      scoreReason: scoreResult.scoreReason,
      analysisMode: scoreResult.analysisMode,
      imageBrightness: scoreResult.imageBrightness,
      imageContrast: scoreResult.imageContrast,
      imageEdgeDensity: scoreResult.imageEdgeDensity,
      imageCenteredMassX: scoreResult.imageCenteredMassX,
      imageCenteredMassY: scoreResult.imageCenteredMassY,
      imageLeftRightBalance: scoreResult.imageLeftRightBalance,
    })

    // eslint-disable-next-line no-console
    console.log("[turning-photo-route] Assessment updated after retry:", updated.scoringStatus)
    return NextResponse.json({ ok: true, data: updated })
  }

  // ── New assessment submission ────────────────────────────────────────────────
  const photoFileId = String(payload?.photoFileId || "").trim()
  const photoFilePath = String(payload?.photoFilePath || "").trim()
  const nurseName = String(payload?.nurseName || "").trim()
  const patientName = String(payload?.patientName || "").trim()
  const room = String(payload?.room || "").trim()
  const turningPosition = String(payload?.turningPosition || "").trim()
  const recordId = String(payload?.recordId || "").trim()

  // eslint-disable-next-line no-console
  console.log("[turning-photo-route] New assessment POST — nurse:", nurseName, "| patient:", patientName, "| room:", room, "| position:", turningPosition)
  // eslint-disable-next-line no-console
  console.log("[turning-photo-route] Photo file_id:", photoFileId, "| file_path:", photoFilePath)

  if (!photoFileId || !photoFilePath || !nurseName || !patientName || !room || !turningPosition) {
    // eslint-disable-next-line no-console
    console.error("[turning-photo-route] Missing required fields:", { photoFileId: !!photoFileId, photoFilePath: !!photoFilePath, nurseName: !!nurseName, patientName: !!patientName, room: !!room, turningPosition: !!turningPosition })
    return NextResponse.json(
      { ok: false, error: "photoFileId, photoFilePath, nurseName, patientName, room, and turningPosition are required." },
      { status: 400 },
    )
  }

  // Step 1: Get timing compliance from turning records
  // eslint-disable-next-line no-console
  console.log("[turning-photo-route] Step 1 — Looking up turning records for timing compliance...")
  const turningRows = await readTurningRows().catch(() => [])
  const matchingTurningRow = turningRows.find((row) => row.recordId === recordId || (row.patientName === patientName && row.room === room))
  const timingCompliance = matchingTurningRow?.status === "overdue" ? "overdue" : matchingTurningRow?.status === "due_soon" ? "due_soon" : "on_time"
  // eslint-disable-next-line no-console
  console.log("[turning-photo-route] Step 1 — Timing compliance:", timingCompliance, "| recordId match:", !!matchingTurningRow)

  // Step 2: Run verification (always, regardless of scoring result)
  // eslint-disable-next-line no-console
  console.log("[turning-photo-route] Step 2 — Running photo verification...")
  const turningSessionTimestamp = String(payload?.turningTime || matchingTurningRow?.turningTime || new Date().toISOString())
  let verification: Awaited<ReturnType<typeof verifyTurningPhoto>>
  try {
    verification = await verifyTurningPhoto({
      photoFilePath,
      turningSessionTimestamp,
      uploadSourceHint: payload?.uploadSourceHint,
    })
    // eslint-disable-next-line no-console
    console.log("[turning-photo-route] Step 2 — Verification result:", verification.verificationResult, "| badges:", verification.verificationBadges)
  } catch (verifyErr) {
    // eslint-disable-next-line no-console
    console.error("[turning-photo-route] Step 2 — Verification failed:", verifyErr instanceof Error ? verifyErr.message : verifyErr)
    return NextResponse.json({ ok: false, error: `Photo verification failed: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}` }, { status: 500 })
  }

  // Step 3: Run AI scoring — always save record even if scoring fails
  // eslint-disable-next-line no-console
  console.log("[turning-photo-route] Step 3 — Running AI scoring (gpt-4.1-mini)...")
  const scoreResult = await scoreTurningPhoto({
    turningPosition,
    timingCompliance: timingComplianceByRow(recordId, timingCompliance),
    photoFilePath,
    patientName,
    room,
    galleryUploadWarning: verification.galleryUploadWarning,
    lateUpload: verification.lateUpload,
    invalidTurningEvidence: verification.invalidTurningEvidence,
    duplicateImageHash: verification.duplicateImageHash,
  })
  // eslint-disable-next-line no-console
  console.log("[turning-photo-route] Step 3 — Scoring result:", scoreResult.scoringStatus, "| model:", scoreResult.aiModel, "| overall:", scoreResult.overallScore)
  if (scoreResult.scoringStatus === "FAILED") {
    // eslint-disable-next-line no-console
    console.error("[turning-photo-route] Step 3 — AI scoring FAILED:", scoreResult.scoringError)
  }

  // Step 4: Save record (always, even if scoring failed)
  // eslint-disable-next-line no-console
  console.log("[turning-photo-route] Step 4 — Saving assessment record with status:", scoreResult.scoringStatus)
  const saved = await addTurningPhotoAssessment({
    recordId: recordId || `turn-${Date.now()}`,
    patientName,
    room,
    nurseName,
    turningPosition,
    turningTime: turningSessionTimestamp,
    uploadedAt: String(payload?.uploadedAt || verification.uploadTimestamp),
    uploadTimestamp: verification.uploadTimestamp,
    turningSessionTimestamp: verification.turningSessionTimestamp,
    timezone: verification.timezone,
    exactDate: verification.exactDate,
    exactTime: verification.exactTime,
    photoFileId,
    photoFilePath,
    imageHash: verification.imageHash,
    uploadSource: verification.uploadSource,
    galleryUploadWarning: verification.galleryUploadWarning,
    exifCaptureTime: verification.exif.captureTime,
    exifDeviceMake: verification.exif.deviceMake,
    exifDeviceModel: verification.exif.deviceModel,
    exifGpsLat: verification.exif.gpsLat,
    exifGpsLng: verification.exif.gpsLng,
    captureTimeDeltaMinutes: verification.captureTimeDeltaMinutes,
    lateUpload: verification.lateUpload,
    invalidTurningEvidence: verification.invalidTurningEvidence,
    duplicateImageHash: verification.duplicateImageHash,
    repeatedSamePhoto: verification.repeatedSamePhoto,
    reusedTurningImage: verification.reusedTurningImage,
    screenshotUpload: verification.screenshotUpload,
    editedImageLikely: verification.editedImageLikely,
    verificationBadges: verification.verificationBadges,
    verificationResult: verification.verificationResult,
    allowanceLocked: verification.verificationResult === "invalid",
    allowanceLockReason: verification.verificationResult === "invalid" ? "Invalid verification result requires supervisor override." : null,
    timingCompliance,
    postureScore: scoreResult.postureScore,
    safetyScore: scoreResult.safetyScore,
    timingScore: scoreResult.timingScore,
    documentationScore: scoreResult.documentationScore,
    overallScore: scoreResult.overallScore,
    allowanceEarned: verification.verificationResult === "invalid" ? 0 : (scoreResult.scoringStatus === "FAILED" ? 0 : scoreResult.allowanceEarned),
    scorePenalty: scoreResult.scorePenalty,
    scoreReason: scoreResult.scoreReason,
    analysisMode: scoreResult.analysisMode,
    aiModel: scoreResult.aiModel,
    scoringStatus: scoreResult.scoringStatus,
    scoringError: scoreResult.scoringError,
    scoringAttempts: 1,
    imageBrightness: scoreResult.imageBrightness,
    imageContrast: scoreResult.imageContrast,
    imageEdgeDensity: scoreResult.imageEdgeDensity,
    imageCenteredMassX: scoreResult.imageCenteredMassX,
    imageCenteredMassY: scoreResult.imageCenteredMassY,
    imageLeftRightBalance: scoreResult.imageLeftRightBalance,
    suspiciousFlag:
      verification.invalidTurningEvidence || verification.duplicateImageHash || verification.editedImageLikely || verification.screenshotUpload,
    suspiciousReasons: [
      verification.invalidTurningEvidence ? "Invalid turning evidence (>30 min delta)." : "",
      verification.duplicateImageHash ? "Duplicate image hash detected." : "",
      verification.reusedTurningImage ? "Reused turning image detected." : "",
      verification.screenshotUpload ? "Screenshot upload detected." : "",
      verification.editedImageLikely ? "Edited image likely detected." : "",
    ].filter(Boolean),
    flaggedAt:
      verification.invalidTurningEvidence || verification.duplicateImageHash || verification.editedImageLikely || verification.screenshotUpload
        ? verification.uploadTimestamp
        : null,
    flaggedBy:
      verification.invalidTurningEvidence || verification.duplicateImageHash || verification.editedImageLikely || verification.screenshotUpload
        ? "AI verifier"
        : null,
    supervisorStatus: "pending",
    supervisorOverrideScore: null,
    supervisorComment: "",
    reviewedAt: null,
    reviewedBy: null,
    source: payload?.source === "telegram" ? "telegram" : "api",
  })

  // eslint-disable-next-line no-console
  console.log("[turning-photo-route] Step 4 — Record saved:", saved.id, "| scoringStatus:", saved.scoringStatus)

  // Step 5: Send Telegram alert if overdue (only for successful scoring)
  if (saved.timingCompliance === "overdue" && scoreResult.scoringStatus === "SUCCESS") {
    const alertText = [
      "🚨 TURNING PHOTO SCORE PENALTY ALERT",
      `Patient: ${saved.patientName}`,
      `Room: ${saved.room}`,
      `Nurse: ${saved.nurseName}`,
      `Score: ${saved.overallScore}`,
      `Penalty: -${saved.scorePenalty}`,
      "Action: Supervisor review required.",
    ].join("\n")
    try {
      await sendTelegramMessage({ message: alertText, simulated: false })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[turning-photo-alert] failed to send overdue supervisor alert", error)
    }
  }

  // eslint-disable-next-line no-console
  console.log("[turning-photo-route] ── Complete ── scoringStatus:", saved.scoringStatus)
  return NextResponse.json({ ok: true, data: saved })
}
