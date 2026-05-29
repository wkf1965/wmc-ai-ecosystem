import { createHash } from "crypto"
import exifr from "exifr"
import { readTurningPhotoAssessments } from "./turningPhotoStore"

export type PhotoExifSummary = {
  captureTime: string | null
  deviceMake: string | null
  deviceModel: string | null
  gpsLat: number | null
  gpsLng: number | null
}

export type TurningVerificationResult = {
  exactDate: string
  exactTime: string
  timezone: string
  uploadTimestamp: string
  turningSessionTimestamp: string
  uploadSource: "camera_live" | "gallery_upload" | "unknown"
  galleryUploadWarning: boolean
  exif: PhotoExifSummary
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
  imageHash: string
}

function extractTelegramPathFromInput(pathOrUrl: string) {
  if (!pathOrUrl) return ""
  if (!pathOrUrl.includes("filePath=")) return pathOrUrl
  const url = new URL(pathOrUrl, "http://localhost")
  return String(url.searchParams.get("filePath") || "").trim()
}

export async function fetchTelegramPhotoBytes(photoFilePath: string) {
  const cleanPath = extractTelegramPathFromInput(photoFilePath)
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim()
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing for verification.")
  const url = `https://api.telegram.org/file/bot${token}/${cleanPath}`
  // eslint-disable-next-line no-console
  console.log("[verifier] Downloading photo from Telegram for verification...")
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal }).catch(() => null)
    if (!response || !response.ok) throw new Error("Unable to download photo from Telegram.")
    const arrayBuffer = await response.arrayBuffer()
    const buf = Buffer.from(arrayBuffer)
    // eslint-disable-next-line no-console
    console.log("[verifier] Photo downloaded successfully, size:", buf.length, "bytes")
    return buf
  } finally {
    clearTimeout(timeoutId)
  }
}

function toIso(value: unknown): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function detectScreenshot(exifData: Record<string, unknown>) {
  const software = String(exifData.Software || "").toLowerCase()
  const profile = String(exifData.ProfileName || "").toLowerCase()
  return software.includes("screenshot") || software.includes("screen") || profile.includes("screenshot")
}

function detectEdited(exifData: Record<string, unknown>) {
  const software = String(exifData.Software || "").toLowerCase()
  const hasEditor = ["photoshop", "lightroom", "snapseed", "picsart", "canva"].some((key) => software.includes(key))
  const modifiedAt = toIso(exifData.ModifyDate)
  const originalAt = toIso(exifData.DateTimeOriginal)
  if (hasEditor) return true
  if (!modifiedAt || !originalAt) return false
  const modMs = new Date(modifiedAt).getTime()
  const origMs = new Date(originalAt).getTime()
  return modMs - origMs > 60_000
}

function minuteDelta(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime()
  const b = new Date(bIso).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round(Math.abs(a - b) / 60_000)
}

export async function verifyTurningPhoto(input: {
  photoFilePath: string
  turningSessionTimestamp: string
  uploadSourceHint?: "camera_live" | "gallery_upload" | "unknown"
}) {
  const now = new Date()
  const uploadTimestamp = now.toISOString()
  const exactDate = uploadTimestamp.slice(0, 10)
  const exactTime = uploadTimestamp.slice(11, 19)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

  const bytes = await fetchTelegramPhotoBytes(input.photoFilePath)
  const imageHash = createHash("sha256").update(bytes).digest("hex")

  const exifData = (await exifr.parse(bytes).catch(() => null)) as
    | Record<string, unknown>
    | null
  const captureTime = toIso(exifData?.DateTimeOriginal || exifData?.CreateDate || exifData?.DateTime)
  const uploadSource =
    input.uploadSourceHint ||
    (captureTime ? "camera_live" : "gallery_upload")

  const captureTimeDeltaMinutes = captureTime ? minuteDelta(captureTime, input.turningSessionTimestamp) : null
  const lateUpload = captureTimeDeltaMinutes != null ? captureTimeDeltaMinutes > 5 : false
  const invalidTurningEvidence = captureTimeDeltaMinutes != null ? captureTimeDeltaMinutes > 30 : false
  const galleryUploadWarning = uploadSource === "gallery_upload"

  const prior = (await readTurningPhotoAssessments()).assessments
  const sameHashRows = prior.filter((row) => row.imageHash === imageHash)
  const duplicateImageHash = sameHashRows.length > 0
  const repeatedSamePhoto = sameHashRows.some((row) => row.patientName === sameHashRows[0]?.patientName)
  const reusedTurningImage = sameHashRows.length > 1 || sameHashRows.some((row) => row.patientName !== sameHashRows[0]?.patientName)

  const screenshotUpload = detectScreenshot(exifData || {})
  const editedImageLikely = detectEdited(exifData || {})

  const badges: string[] = []
  if (uploadSource === "camera_live") badges.push("Live Capture")
  if (galleryUploadWarning) badges.push("Gallery Upload")
  if (lateUpload) badges.push("Late Upload")
  if (duplicateImageHash) badges.push("Duplicate Photo")
  if (!invalidTurningEvidence && !duplicateImageHash && !editedImageLikely) badges.push("AI Verified")

  const verificationResult: TurningVerificationResult["verificationResult"] =
    invalidTurningEvidence || duplicateImageHash ? "invalid" : badges.includes("AI Verified") ? "ai_verified" : "warning"

  return {
    exactDate,
    exactTime,
    timezone,
    uploadTimestamp,
    turningSessionTimestamp: input.turningSessionTimestamp,
    uploadSource,
    galleryUploadWarning,
    exif: {
      captureTime,
      deviceMake: exifData ? String(exifData.Make || "") || null : null,
      deviceModel: exifData ? String(exifData.Model || "") || null : null,
      gpsLat: typeof exifData?.latitude === "number" ? (exifData.latitude as number) : null,
      gpsLng: typeof exifData?.longitude === "number" ? (exifData.longitude as number) : null,
    },
    captureTimeDeltaMinutes,
    lateUpload,
    invalidTurningEvidence,
    duplicateImageHash,
    repeatedSamePhoto,
    reusedTurningImage,
    screenshotUpload,
    editedImageLikely,
    verificationBadges: badges,
    verificationResult,
    imageHash,
  } satisfies TurningVerificationResult
}
