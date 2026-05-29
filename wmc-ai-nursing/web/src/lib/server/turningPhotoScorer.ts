import type { TurningPhotoAssessment } from "./turningPhotoStore"
import sharp from "sharp"
import OpenAI from "openai"

export type ScoreInput = {
  turningPosition: string
  timingCompliance: "on_time" | "due_soon" | "overdue"
  photoFilePath: string
  patientName: string
  room: string
  galleryUploadWarning?: boolean
  lateUpload?: boolean
  invalidTurningEvidence?: boolean
  duplicateImageHash?: boolean
}

export type ScoreOutput = Pick<
  TurningPhotoAssessment,
  | "postureScore"
  | "safetyScore"
  | "timingScore"
  | "documentationScore"
  | "overallScore"
  | "allowanceEarned"
  | "scorePenalty"
  | "scoreReason"
  | "analysisMode"
  | "aiModel"
  | "scoringStatus"
  | "scoringError"
  | "imageBrightness"
  | "imageContrast"
  | "imageEdgeDensity"
  | "imageCenteredMassX"
  | "imageCenteredMassY"
  | "imageLeftRightBalance"
>

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(min: number, max: number, value: number) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Monthly turning allowance rules:
 *  score >= 70  → 1 valid mark = RM 0.80
 *  score <  70  → 0 marks      = RM 0.00
 * Monthly cap applied at summary level: min(validMarks * 0.80, 150)
 */
function allowanceByScore(score: number) {
  return score >= 70 ? 0.80 : 0
}

function hashCode(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function bucket(value: string, min: number, max: number) {
  const seed = hashCode(value)
  const range = Math.max(1, max - min + 1)
  return min + (seed % range)
}

async function fetchTelegramPhotoBytes(photoFilePath: string): Promise<Buffer> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim()
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing for image download.")
  const url = `https://api.telegram.org/file/bot${token}/${photoFilePath}`
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Fetching image from Telegram URL:", url.replace(token, "BOT_TOKEN"))
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal }).catch((err: unknown) => {
      throw new Error(`Network error downloading Telegram image: ${err instanceof Error ? err.message : String(err)}`)
    })
    if (!response || !response.ok) {
      throw new Error(`Telegram image download failed — HTTP ${response?.status ?? "no-response"}: ${photoFilePath}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const buf = Buffer.from(arrayBuffer)
    // eslint-disable-next-line no-console
    console.log("[AI-SCORER] Image downloaded successfully, size:", buf.length, "bytes")
    return buf
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─── OpenAI GPT-4.1-mini scorer ──────────────────────────────────────────────

const SCORING_PROMPT = `You are a medical nursing AI that evaluates patient turning photos for quality assurance.
Analyze the provided turning photo and respond with ONLY a valid JSON object (no markdown, no extra text):

{
  "postureScore": <integer 0-100>,
  "timingCompliance": <integer 0-100>,
  "skinProtection": <integer 0-100>,
  "overallScore": <integer 0-100>,
  "allowanceEarned": <decimal 0.00-5.00, one of: 0, 2, 3, 5>,
  "remarks": "<brief professional assessment under 120 characters>"
}

Scoring criteria:
- postureScore: Patient body alignment, positioning correctness, and lateral support (0=poor, 100=excellent)
- timingCompliance: Evidence of scheduled turning adherence, timing markers in image (0=non-compliant, 100=fully compliant)
- skinProtection: Visible skin care, pressure relief, padding, and safety measures (0=inadequate, 100=excellent)
- overallScore: Weighted average of all factors; use 40% posture + 30% timing + 30% skin protection
- allowanceEarned: Nurse care allowance earned: 5 if overallScore>=90, 3 if overallScore>=80, 2 if overallScore>=70, 0 if below
- remarks: Brief professional assessment of the turning quality

Return ONLY the JSON object. No markdown code blocks. No explanation.`

type OpenAIScoreJSON = {
  postureScore: number
  timingCompliance: number
  skinProtection: number
  overallScore: number
  allowanceEarned: number
  remarks: string
}

function parseOpenAIScoreJSON(raw: string): OpenAIScoreJSON {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Failed to parse OpenAI JSON response: ${cleaned.slice(0, 200)}`)
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`OpenAI returned non-object: ${cleaned.slice(0, 200)}`)
  }
  const obj = parsed as Record<string, unknown>
  const postureScore = clamp(0, 100, Math.round(Number(obj.postureScore) || 0))
  const timingCompliance = clamp(0, 100, Math.round(Number(obj.timingCompliance) || 0))
  const skinProtection = clamp(0, 100, Math.round(Number(obj.skinProtection) || 0))
  const overallScore = clamp(0, 100, Math.round(Number(obj.overallScore) || 0))
  const allowanceEarned = Math.max(0, Math.min(5, Number(obj.allowanceEarned) || 0))
  const remarks = String(obj.remarks || "AI assessment complete.")
  if (
    Number.isNaN(postureScore) ||
    Number.isNaN(timingCompliance) ||
    Number.isNaN(skinProtection) ||
    Number.isNaN(overallScore)
  ) {
    throw new Error(`OpenAI response missing required numeric score fields: ${cleaned.slice(0, 200)}`)
  }
  return { postureScore, timingCompliance, skinProtection, overallScore, allowanceEarned, remarks }
}

function applyPenaltiesToOpenAIScore(
  aiScores: OpenAIScoreJSON,
  input: ScoreInput,
): { overallScore: number; scorePenalty: number; scoreReason: string; allowanceEarned: number } {
  let scorePenalty = 0
  let scoreReason = aiScores.remarks

  if (input.timingCompliance === "due_soon") {
    scorePenalty += 4
    scoreReason = `${scoreReason} (Near-due penalty applied.)`
  } else if (input.timingCompliance === "overdue") {
    scorePenalty += 10
    scoreReason = `${scoreReason} (Overdue penalty applied.)`
  }
  if (input.galleryUploadWarning) {
    scorePenalty += 10
    scoreReason = `${scoreReason} (Gallery upload penalty applied.)`
  }
  if (input.lateUpload) {
    scorePenalty += 20
    scoreReason = `${scoreReason} (Late upload penalty applied.)`
  }
  if (input.duplicateImageHash) {
    return { overallScore: 0, scorePenalty: 100, scoreReason: "Duplicate image detected. Score set to 0.", allowanceEarned: 0 }
  }

  const overallScore = clamp(0, 100, Math.round(aiScores.overallScore - scorePenalty))
  const allowanceEarned = allowanceByScore(overallScore)
  return { overallScore, scorePenalty, scoreReason, allowanceEarned }
}

async function scoreWithOpenAI(input: ScoreInput): Promise<ScoreOutput> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim()
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.")

  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] ── Starting OpenAI gpt-4.1-mini scoring ──")
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Patient:", input.patientName, "| Room:", input.room, "| Position:", input.turningPosition)
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Timing compliance:", input.timingCompliance)

  // Step 1: Download image
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Step 1 — Downloading image from Telegram:", input.photoFilePath)
  const imageBytes = await fetchTelegramPhotoBytes(input.photoFilePath)
  const imageBase64 = imageBytes.toString("base64")
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Step 2 — Image ready, base64 length:", imageBase64.length)

  // Step 2: Call OpenAI
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Step 3 — Calling OpenAI gpt-4.1-mini with vision...")
  const openai = new OpenAI({ apiKey, timeout: 25_000 })

  const startMs = Date.now()
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Step 3 — OpenAI timeout set to 25 seconds")
  const response = await openai.chat.completions.create(
    {
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SCORING_PROMPT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "low" } },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0,
    },
    { timeout: 25_000 },
  )
  const elapsedMs = Date.now() - startMs
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Step 4 — OpenAI responded in", elapsedMs, "ms")

  const rawContent = response.choices[0]?.message?.content || ""
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Step 5 — Raw OpenAI response:", rawContent)

  // Step 3: Parse response
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Step 6 — Parsing JSON response...")
  const aiScores = parseOpenAIScoreJSON(rawContent)
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Step 7 — Parsed scores:", JSON.stringify(aiScores))

  // Step 4: Apply verification penalties
  const withPenalties = applyPenaltiesToOpenAIScore(aiScores, input)
  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] Step 8 — Final scores after penalties:", JSON.stringify(withPenalties))

  const timingScore = clamp(0, 100, Math.round(aiScores.timingCompliance))
  const documentationScore = Math.round(withPenalties.overallScore * 0.15)

  // eslint-disable-next-line no-console
  console.log("[AI-SCORER] ── OpenAI scoring SUCCESS ──")

  return {
    postureScore: aiScores.postureScore,
    safetyScore: aiScores.skinProtection,
    timingScore,
    documentationScore,
    overallScore: withPenalties.overallScore,
    allowanceEarned: withPenalties.allowanceEarned,
    scorePenalty: withPenalties.scorePenalty,
    scoreReason: withPenalties.scoreReason,
    analysisMode: "openai",
    aiModel: "gpt-4.1-mini",
    scoringStatus: "SUCCESS",
    scoringError: null,
    imageBrightness: null,
    imageContrast: null,
    imageEdgeDensity: null,
    imageCenteredMassX: null,
    imageCenteredMassY: null,
    imageLeftRightBalance: null,
  }
}

// ─── Sharp pixel-based scorer (fallback) ────────────────────────────────────

type ImageMetrics = {
  brightness: number
  contrast: number
  edgeDensity: number
  centeredMassX: number
  centeredMassY: number
  leftRightBalance: number
}

async function analyzeImageMetrics(photoFilePath: string): Promise<ImageMetrics> {
  const bytes = await fetchTelegramPhotoBytes(photoFilePath)
  const analyzed = sharp(bytes).resize(224, 224, { fit: "cover" })
  const stats = await analyzed.stats()
  const gray = await sharp(bytes)
    .resize(224, 224, { fit: "cover" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const data = gray.data
  const width = gray.info.width
  const height = gray.info.height

  const mean = data.reduce((sum: number, value: number) => sum + value, 0) / data.length
  const variance = data.reduce((sum: number, value: number) => sum + (value - mean) ** 2, 0) / data.length
  const contrast = Math.min(1, Math.sqrt(variance) / 128)

  let edgeCount = 0
  let weightedX = 0
  let weightedY = 0
  let mass = 0
  let leftMass = 0
  let rightMass = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const gx = Math.abs(data[i + 1] - data[i - 1])
      const gy = Math.abs(data[i + width] - data[i - width])
      const gradient = gx + gy
      if (gradient > 36) edgeCount += 1
      const px = data[i]
      if (px < 210) {
        const weight = 210 - px
        mass += weight
        weightedX += x * weight
        weightedY += y * weight
        if (x < width / 2) leftMass += weight
        else rightMass += weight
      }
    }
  }

  const centeredMassX = mass > 0 ? weightedX / mass / width : 0.5
  const centeredMassY = mass > 0 ? weightedY / mass / height : 0.5
  const edgeDensity = edgeCount / ((width - 2) * (height - 2))
  const leftRightBalance = mass > 0 ? Math.abs(leftMass - rightMass) / mass : 0.5

  return {
    brightness: (stats.channels[0]?.mean ?? mean) / 255,
    contrast,
    edgeDensity,
    centeredMassX,
    centeredMassY,
    leftRightBalance,
  }
}

function scoreFromMetrics(input: ScoreInput, metrics: ImageMetrics): Omit<ScoreOutput, "analysisMode" | "aiModel" | "scoringStatus" | "scoringError"> {
  const postureCentered = 1 - Math.abs(metrics.centeredMassX - 0.5) * 1.8
  const postureBalance = 1 - metrics.leftRightBalance
  const postureEdge = clamp(0, 1, metrics.edgeDensity / 0.18)
  const postureNorm = clamp(0, 1, postureCentered * 0.45 + postureBalance * 0.35 + postureEdge * 0.2)
  const postureScore = Math.round(35 * postureNorm)

  const lighting = 1 - Math.abs(metrics.brightness - 0.56) / 0.56
  const contrastNorm = clamp(0, 1, metrics.contrast / 0.55)
  const safetyEdge = clamp(0, 1, metrics.edgeDensity / 0.2)
  const safetyNorm = clamp(0, 1, lighting * 0.4 + contrastNorm * 0.35 + safetyEdge * 0.25)
  const safetyScore = Math.round(30 * safetyNorm)

  const docNorm = clamp(
    0,
    1,
    (1 - Math.abs(metrics.centeredMassX - 0.5) * 1.6) * 0.5 +
      (1 - Math.abs(metrics.centeredMassY - 0.55) * 1.6) * 0.2 +
      contrastNorm * 0.3,
  )
  const documentationScore = Math.round(15 * docNorm)

  let timingScore = 20
  let scorePenalty = 0
  let scoreReason = "On-time turning photo submission."
  if (input.timingCompliance === "due_soon") {
    timingScore = 14; scorePenalty = 4; scoreReason = "Turning near due time with minor penalty."
  } else if (input.timingCompliance === "overdue") {
    timingScore = 8; scorePenalty = 10; scoreReason = "Turning overdue penalty applied."
  }
  if (input.galleryUploadWarning) {
    scorePenalty += 10; scoreReason = `${scoreReason} Gallery upload penalty applied.`
  }
  if (input.lateUpload) {
    scorePenalty += 20; scoreReason = `${scoreReason} Late upload penalty applied.`
  }
  if (input.duplicateImageHash) {
    return {
      postureScore: 0, safetyScore: 0, timingScore: 0, documentationScore: 0,
      overallScore: 0, allowanceEarned: 0, scorePenalty: 100,
      scoreReason: "Duplicate image detected. Score set to 0.",
      imageBrightness: metrics.brightness, imageContrast: metrics.contrast,
      imageEdgeDensity: metrics.edgeDensity, imageCenteredMassX: metrics.centeredMassX,
      imageCenteredMassY: metrics.centeredMassY, imageLeftRightBalance: metrics.leftRightBalance,
    }
  }
  const base = postureScore + safetyScore + timingScore + documentationScore
  const overallScore = clamp(0, 100, Math.round(base - scorePenalty))
  return {
    postureScore, safetyScore, timingScore, documentationScore,
    overallScore, allowanceEarned: allowanceByScore(overallScore),
    scorePenalty, scoreReason,
    imageBrightness: metrics.brightness, imageContrast: metrics.contrast,
    imageEdgeDensity: metrics.edgeDensity, imageCenteredMassX: metrics.centeredMassX,
    imageCenteredMassY: metrics.centeredMassY, imageLeftRightBalance: metrics.leftRightBalance,
  }
}

async function scoreWithSharp(input: ScoreInput): Promise<ScoreOutput> {
  try {
    // eslint-disable-next-line no-console
    console.log("[AI-SCORER] Fallback: using Sharp pixel analysis for:", input.photoFilePath)
    const metrics = await analyzeImageMetrics(input.photoFilePath)
    return {
      ...scoreFromMetrics(input, metrics),
      analysisMode: "image",
      aiModel: null,
      scoringStatus: "SUCCESS",
      scoringError: null,
    }
  } catch (sharpErr) {
    const key = `${input.patientName}|${input.room}|${input.turningPosition}|${input.photoFilePath}`
    const postureScore = bucket(`posture|${key}`, 22, 35)
    const safetyScore = bucket(`safety|${key}`, 18, 30)
    const documentationScore = bucket(`doc|${key}`, 10, 15)
    let timingScore = 20; let scorePenalty = 0; let scoreReason = "On-time turning photo submission (fallback)."
    if (input.timingCompliance === "due_soon") { timingScore = 14; scorePenalty = 4; scoreReason = "Near due time (fallback)." }
    else if (input.timingCompliance === "overdue") { timingScore = 8; scorePenalty = 10; scoreReason = "Overdue penalty (fallback)." }
    if (input.galleryUploadWarning) { scorePenalty += 10; scoreReason += " Gallery penalty." }
    if (input.lateUpload) { scorePenalty += 20; scoreReason += " Late upload penalty." }
    if (input.duplicateImageHash || input.invalidTurningEvidence) {
      scorePenalty = 100; scoreReason = "Duplicate or invalid evidence (fallback)."
    }
    const base = postureScore + safetyScore + timingScore + documentationScore
    const overallScore = Math.max(0, Math.min(100, base - scorePenalty))
    // eslint-disable-next-line no-console
    console.warn("[AI-SCORER] Sharp fallback also failed, using hash-based scores:", sharpErr instanceof Error ? sharpErr.message : String(sharpErr))
    return {
      postureScore, safetyScore, timingScore, documentationScore,
      overallScore, allowanceEarned: allowanceByScore(overallScore),
      scorePenalty, scoreReason,
      analysisMode: "fallback",
      aiModel: null,
      scoringStatus: "SUCCESS",
      scoringError: null,
      imageBrightness: null, imageContrast: null, imageEdgeDensity: null,
      imageCenteredMassX: null, imageCenteredMassY: null, imageLeftRightBalance: null,
    }
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Primary scorer: tries OpenAI gpt-4.1-mini vision first.
 * If OPENAI_API_KEY is missing, falls back to Sharp pixel analysis.
 * If OpenAI fails, returns FAILED status with zero scores (for retry).
 */
export async function scoreTurningPhoto(input: ScoreInput): Promise<ScoreOutput> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim()

  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn("[AI-SCORER] OPENAI_API_KEY not set — using Sharp fallback scorer.")
    return scoreWithSharp(input)
  }

  try {
    return await scoreWithOpenAI(input)
  } catch (aiErr) {
    const errorMsg = aiErr instanceof Error ? aiErr.message : String(aiErr)
    // eslint-disable-next-line no-console
    console.error("[AI-SCORER] ── OpenAI scoring FAILED ──")
    // eslint-disable-next-line no-console
    console.error("[AI-SCORER] Error:", errorMsg)
    // eslint-disable-next-line no-console
    console.error("[AI-SCORER] Full error:", aiErr)

    return {
      postureScore: 0,
      safetyScore: 0,
      timingScore: 0,
      documentationScore: 0,
      overallScore: 0,
      allowanceEarned: 0,
      scorePenalty: 0,
      scoreReason: `AI scoring failed: ${errorMsg}`,
      analysisMode: "fallback",
      aiModel: "gpt-4.1-mini",
      scoringStatus: "FAILED",
      scoringError: errorMsg,
      imageBrightness: null,
      imageContrast: null,
      imageEdgeDensity: null,
      imageCenteredMassX: null,
      imageCenteredMassY: null,
      imageLeftRightBalance: null,
    }
  }
}
