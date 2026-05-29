import { promises as fs } from "fs"
import path from "path"

export type TurningPhotoAssessment = {
  id: string
  recordId: string
  patientName: string
  room: string
  nurseName: string
  turningPosition: string
  turningTime: string
  uploadedAt: string
  uploadTimestamp: string
  turningSessionTimestamp: string
  timezone: string
  exactDate: string
  exactTime: string
  photoFileId: string
  photoFilePath: string
  imageHash: string
  uploadSource: "camera_live" | "gallery_upload" | "unknown"
  galleryUploadWarning: boolean
  exifCaptureTime: string | null
  exifDeviceMake: string | null
  exifDeviceModel: string | null
  exifGpsLat: number | null
  exifGpsLng: number | null
  captureTimeDeltaMinutes: number | null
  lateUpload: boolean
  invalidTurningEvidence: boolean
  duplicateImageHash: boolean
  repeatedSamePhoto: boolean
  reusedTurningImage: boolean
  screenshotUpload: boolean
  editedImageLikely: boolean
  verificationBadges: string[]
  verificationResult: "ai_verified" | "warning" | "invalid"
  allowanceLocked: boolean
  allowanceLockReason: string | null
  timingCompliance: "on_time" | "due_soon" | "overdue"
  postureScore: number
  safetyScore: number
  timingScore: number
  documentationScore: number
  overallScore: number
  allowanceEarned: number
  scorePenalty: number
  scoreReason: string
  analysisMode: "image" | "fallback" | "openai"
  aiModel: string | null
  scoringStatus: "PENDING" | "SUCCESS" | "FAILED"
  scoringError: string | null
  scoringAttempts: number
  imageBrightness: number | null
  imageContrast: number | null
  imageEdgeDensity: number | null
  imageCenteredMassX: number | null
  imageCenteredMassY: number | null
  imageLeftRightBalance: number | null
  suspiciousFlag: boolean
  suspiciousReasons: string[]
  flaggedAt: string | null
  flaggedBy: string | null
  supervisorStatus: "pending" | "approved" | "rejected" | "overridden"
  supervisorOverrideScore: number | null
  supervisorComment: string
  reviewedAt: string | null
  reviewedBy: string | null
  source: "telegram" | "api"
}

type StoreShape = {
  assessments: TurningPhotoAssessment[]
}

const STORE_PATH = path.join(process.cwd(), ".turning-photo-assessments.json")

function emptyStore(): StoreShape {
  return { assessments: [] }
}

function normalizeScore(value: number) {
  return Math.max(0, Math.min(100, Number(value || 0)))
}

function normalize(store: Partial<StoreShape> | null | undefined): StoreShape {
  const assessments = Array.isArray(store?.assessments) ? store!.assessments : []
  return {
    assessments: assessments
      .map((row, index) => ({
        id: String(row.id || `turn-photo-${index}-${Date.now()}`),
        recordId: String(row.recordId || ""),
        patientName: String(row.patientName || ""),
        room: String(row.room || ""),
        nurseName: String(row.nurseName || ""),
        turningPosition: String(row.turningPosition || ""),
        turningTime: String(row.turningTime || ""),
        uploadedAt: String(row.uploadedAt || new Date().toISOString()),
        uploadTimestamp: String(row.uploadTimestamp || row.uploadedAt || new Date().toISOString()),
        turningSessionTimestamp: String(row.turningSessionTimestamp || row.turningTime || new Date().toISOString()),
        timezone: String(row.timezone || "UTC"),
        exactDate: String(row.exactDate || new Date().toISOString().slice(0, 10)),
        exactTime: String(row.exactTime || new Date().toISOString().slice(11, 19)),
        photoFileId: String(row.photoFileId || ""),
        photoFilePath: String(row.photoFilePath || ""),
        imageHash: String(row.imageHash || ""),
        uploadSource: (["camera_live", "gallery_upload", "unknown"].includes(String(row.uploadSource))
          ? row.uploadSource
          : "unknown") as TurningPhotoAssessment["uploadSource"],
        galleryUploadWarning: Boolean(row.galleryUploadWarning),
        exifCaptureTime: row.exifCaptureTime ? String(row.exifCaptureTime) : null,
        exifDeviceMake: row.exifDeviceMake ? String(row.exifDeviceMake) : null,
        exifDeviceModel: row.exifDeviceModel ? String(row.exifDeviceModel) : null,
        exifGpsLat: row.exifGpsLat === null || row.exifGpsLat === undefined ? null : Number(row.exifGpsLat),
        exifGpsLng: row.exifGpsLng === null || row.exifGpsLng === undefined ? null : Number(row.exifGpsLng),
        captureTimeDeltaMinutes:
          row.captureTimeDeltaMinutes === null || row.captureTimeDeltaMinutes === undefined ? null : Number(row.captureTimeDeltaMinutes),
        lateUpload: Boolean(row.lateUpload),
        invalidTurningEvidence: Boolean(row.invalidTurningEvidence),
        duplicateImageHash: Boolean(row.duplicateImageHash),
        repeatedSamePhoto: Boolean(row.repeatedSamePhoto),
        reusedTurningImage: Boolean(row.reusedTurningImage),
        screenshotUpload: Boolean(row.screenshotUpload),
        editedImageLikely: Boolean(row.editedImageLikely),
        verificationBadges: Array.isArray(row.verificationBadges) ? row.verificationBadges.map((item) => String(item)) : [],
        verificationResult: (["ai_verified", "warning", "invalid"].includes(String(row.verificationResult))
          ? row.verificationResult
          : "warning") as TurningPhotoAssessment["verificationResult"],
        allowanceLocked: Boolean(row.allowanceLocked),
        allowanceLockReason: row.allowanceLockReason ? String(row.allowanceLockReason) : null,
        timingCompliance: (["on_time", "due_soon", "overdue"].includes(String(row.timingCompliance))
          ? row.timingCompliance
          : "on_time") as TurningPhotoAssessment["timingCompliance"],
        postureScore: normalizeScore(row.postureScore),
        safetyScore: normalizeScore(row.safetyScore),
        timingScore: normalizeScore(row.timingScore),
        documentationScore: normalizeScore(row.documentationScore),
        overallScore: normalizeScore(row.overallScore),
        allowanceEarned: Math.max(0, Number(row.allowanceEarned || 0)),
        scorePenalty: Math.max(0, Number(row.scorePenalty || 0)),
        scoreReason: String(row.scoreReason || ""),
        analysisMode: (["image", "fallback", "openai"].includes(String(row.analysisMode || "").toLowerCase())
          ? String(row.analysisMode).toLowerCase()
          : "fallback") as "image" | "fallback" | "openai",
        aiModel: row.aiModel ? String(row.aiModel) : null,
        scoringStatus: (["PENDING", "SUCCESS", "FAILED"].includes(String(row.scoringStatus || ""))
          ? row.scoringStatus
          : "SUCCESS") as "PENDING" | "SUCCESS" | "FAILED",
        scoringError: row.scoringError ? String(row.scoringError) : null,
        scoringAttempts: Math.max(0, Number(row.scoringAttempts || 0)),
        imageBrightness: row.imageBrightness === null || row.imageBrightness === undefined ? null : Number(row.imageBrightness),
        imageContrast: row.imageContrast === null || row.imageContrast === undefined ? null : Number(row.imageContrast),
        imageEdgeDensity: row.imageEdgeDensity === null || row.imageEdgeDensity === undefined ? null : Number(row.imageEdgeDensity),
        imageCenteredMassX:
          row.imageCenteredMassX === null || row.imageCenteredMassX === undefined ? null : Number(row.imageCenteredMassX),
        imageCenteredMassY:
          row.imageCenteredMassY === null || row.imageCenteredMassY === undefined ? null : Number(row.imageCenteredMassY),
        imageLeftRightBalance:
          row.imageLeftRightBalance === null || row.imageLeftRightBalance === undefined ? null : Number(row.imageLeftRightBalance),
        suspiciousFlag: Boolean(row.suspiciousFlag),
        suspiciousReasons: Array.isArray(row.suspiciousReasons) ? row.suspiciousReasons.map((item) => String(item)) : [],
        flaggedAt: row.flaggedAt ? String(row.flaggedAt) : null,
        flaggedBy: row.flaggedBy ? String(row.flaggedBy) : null,
        supervisorStatus: (["pending", "approved", "rejected", "overridden"].includes(String(row.supervisorStatus))
          ? row.supervisorStatus
          : "pending") as TurningPhotoAssessment["supervisorStatus"],
        supervisorOverrideScore: row.supervisorOverrideScore === null ? null : Number(row.supervisorOverrideScore || 0),
        supervisorComment: String(row.supervisorComment || ""),
        reviewedAt: row.reviewedAt ? String(row.reviewedAt) : null,
        reviewedBy: row.reviewedBy ? String(row.reviewedBy) : null,
        source: (String(row.source || "").toLowerCase() === "telegram" ? "telegram" : "api") as "telegram" | "api",
      }))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
  }
}

async function readRawStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8")
    return normalize(JSON.parse(raw) as Partial<StoreShape>)
  } catch {
    return emptyStore()
  }
}

async function writeRawStore(next: StoreShape) {
  await fs.writeFile(STORE_PATH, JSON.stringify(next, null, 2), "utf8")
}

export async function readTurningPhotoAssessments() {
  return readRawStore()
}

export async function addTurningPhotoAssessment(input: Omit<TurningPhotoAssessment, "id"> & { scoringStatus?: "PENDING" | "SUCCESS" | "FAILED"; scoringError?: string | null; scoringAttempts?: number; aiModel?: string | null }) {
  const store = await readRawStore()
  const row: TurningPhotoAssessment = {
    ...input,
    id: `turn-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  }
  store.assessments.unshift(row)
  store.assessments = store.assessments.slice(0, 5000)
  await writeRawStore(store)
  return row
}

export async function updateTurningPhotoReview(input: {
  id: string
  supervisorStatus: "approved" | "rejected" | "overridden"
  overrideScore?: number | null
  supervisorComment?: string
  reviewedBy?: string
}) {
  const store = await readRawStore()
  const idx = store.assessments.findIndex((row) => row.id === input.id)
  if (idx === -1) throw new Error("Turning photo assessment not found.")
  const current = store.assessments[idx]
  const allowanceLocked = Boolean(current.allowanceLocked)
  if (allowanceLocked && input.supervisorStatus !== "overridden") {
    throw new Error("Allowance is locked due to invalid verification. Use Override to unlock.")
  }
  const nextScore =
    input.supervisorStatus === "overridden" && input.overrideScore !== undefined && input.overrideScore !== null
      ? normalizeScore(Number(input.overrideScore))
      : current.overallScore

  const nextAllowance = nextScore >= 90 ? 5 : nextScore >= 80 ? 3 : nextScore >= 70 ? 2 : 0

  store.assessments[idx] = {
    ...current,
    supervisorStatus: input.supervisorStatus,
    supervisorOverrideScore: input.supervisorStatus === "overridden" ? nextScore : null,
    overallScore: nextScore,
    allowanceEarned: input.supervisorStatus === "overridden" ? nextAllowance : current.allowanceEarned,
    allowanceLocked: input.supervisorStatus === "overridden" ? false : current.allowanceLocked,
    allowanceLockReason: input.supervisorStatus === "overridden" ? null : current.allowanceLockReason,
    supervisorComment: String(input.supervisorComment || ""),
    reviewedAt: new Date().toISOString(),
    reviewedBy: input.reviewedBy ? String(input.reviewedBy) : "Supervisor",
  }
  await writeRawStore(store)
  return store.assessments[idx]
}

export async function updateTurningPhotoScoringStatus(input: {
  id: string
  scoringStatus: "PENDING" | "SUCCESS" | "FAILED"
  scoringError?: string | null
  scoringAttempts?: number
  aiModel?: string | null
  postureScore?: number
  safetyScore?: number
  timingScore?: number
  documentationScore?: number
  overallScore?: number
  allowanceEarned?: number
  scorePenalty?: number
  scoreReason?: string
  analysisMode?: "image" | "fallback" | "openai"
  imageBrightness?: number | null
  imageContrast?: number | null
  imageEdgeDensity?: number | null
  imageCenteredMassX?: number | null
  imageCenteredMassY?: number | null
  imageLeftRightBalance?: number | null
}) {
  const store = await readRawStore()
  const idx = store.assessments.findIndex((row) => row.id === input.id)
  if (idx === -1) throw new Error("Turning photo assessment not found.")
  const current = store.assessments[idx]
  const patch: Partial<TurningPhotoAssessment> = {
    scoringStatus: input.scoringStatus,
    scoringError: input.scoringError ?? null,
    scoringAttempts: input.scoringAttempts ?? (current.scoringAttempts || 0) + 1,
  }
  if (input.aiModel !== undefined) patch.aiModel = input.aiModel
  if (input.analysisMode !== undefined) patch.analysisMode = input.analysisMode
  if (input.scoringStatus === "SUCCESS") {
    if (input.postureScore !== undefined) patch.postureScore = normalizeScore(input.postureScore)
    if (input.safetyScore !== undefined) patch.safetyScore = normalizeScore(input.safetyScore)
    if (input.timingScore !== undefined) patch.timingScore = normalizeScore(input.timingScore)
    if (input.documentationScore !== undefined) patch.documentationScore = normalizeScore(input.documentationScore)
    if (input.overallScore !== undefined) patch.overallScore = normalizeScore(input.overallScore)
    if (input.allowanceEarned !== undefined) patch.allowanceEarned = Math.max(0, Number(input.allowanceEarned || 0))
    if (input.scorePenalty !== undefined) patch.scorePenalty = Math.max(0, Number(input.scorePenalty || 0))
    if (input.scoreReason !== undefined) patch.scoreReason = String(input.scoreReason)
    if (input.imageBrightness !== undefined) patch.imageBrightness = input.imageBrightness
    if (input.imageContrast !== undefined) patch.imageContrast = input.imageContrast
    if (input.imageEdgeDensity !== undefined) patch.imageEdgeDensity = input.imageEdgeDensity
    if (input.imageCenteredMassX !== undefined) patch.imageCenteredMassX = input.imageCenteredMassX
    if (input.imageCenteredMassY !== undefined) patch.imageCenteredMassY = input.imageCenteredMassY
    if (input.imageLeftRightBalance !== undefined) patch.imageLeftRightBalance = input.imageLeftRightBalance
  }
  store.assessments[idx] = { ...current, ...patch }
  await writeRawStore(store)
  return store.assessments[idx]
}

export async function flagSuspiciousTurningPhoto(input: {
  id: string
  reasons: string[]
  flaggedBy?: string
}) {
  const store = await readRawStore()
  const idx = store.assessments.findIndex((row) => row.id === input.id)
  if (idx === -1) throw new Error("Turning photo assessment not found.")
  const current = store.assessments[idx]
  const cleanedReasons = Array.from(new Set((input.reasons || []).map((item) => String(item).trim()).filter(Boolean)))
  store.assessments[idx] = {
    ...current,
    suspiciousFlag: cleanedReasons.length > 0,
    suspiciousReasons: cleanedReasons,
    flaggedAt: cleanedReasons.length > 0 ? new Date().toISOString() : null,
    flaggedBy: cleanedReasons.length > 0 ? String(input.flaggedBy || "Supervisor") : null,
  }
  await writeRawStore(store)
  return store.assessments[idx]
}
