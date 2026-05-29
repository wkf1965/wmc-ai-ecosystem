"use client"

import { Fragment, useEffect, useState } from "react"
import Link from "next/link"
import AdminGate from "../../components/AdminGate"

type ReviewRow = {
  id: string
  patientName: string
  room: string
  nurseName: string
  turningPosition: string
  overallScore: number
  allowanceEarned: number
  postureScore: number
  safetyScore: number
  timingScore: number
  documentationScore: number
  scorePenalty: number
  scoreReason: string
  analysisMode: "image" | "fallback"
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
  uploadTimestamp: string
  turningSessionTimestamp: string
  timezone: string
  exactDate: string
  exactTime: string
  supervisorStatus: "pending" | "approved" | "rejected" | "overridden"
  supervisorComment: string
}

export default function TurningSupervisorReviewPage() {
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [status, setStatus] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showSuspiciousOnly, setShowSuspiciousOnly] = useState(false)

  async function refreshRows() {
    const response = await fetch("/api/turning-photo-assessments", { cache: "no-store" })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
      setStatus("Unable to load turning review records.")
      return
    }
    setRows(payload.data as ReviewRow[])
  }

  useEffect(() => {
    void refreshRows()
  }, [])

  async function submitReview(id: string, supervisorStatus: "approved" | "rejected" | "overridden") {
    const current = rows.find((row) => row.id === id)
    const overrideScore =
      supervisorStatus === "overridden" ? Number(prompt("Enter override score (0-100):", String(current?.overallScore || 80)) || 0) : null
    const supervisorComment = prompt("Supervisor comment:", current?.supervisorComment || "") || ""
    const reviewedBy = prompt("Supervisor name:", "Supervisor") || "Supervisor"

    const response = await fetch("/api/turning-photo-assessments/review", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        supervisorStatus,
        overrideScore,
        supervisorComment,
        reviewedBy,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      setStatus(`Unable to submit review${payload?.error ? `: ${payload.error}` : ""}`)
      return
    }
    setStatus("Supervisor review updated.")
    await refreshRows()
  }

  function buildSuspiciousReasons(row: ReviewRow) {
    const reasons: string[] = []
    if (row.analysisMode === "fallback") reasons.push("Fallback scoring mode used (image analysis unavailable).")
    if (row.imageBrightness != null && (row.imageBrightness < 0.25 || row.imageBrightness > 0.9)) reasons.push("Lighting quality is poor.")
    if (row.imageContrast != null && row.imageContrast < 0.12) reasons.push("Image contrast is too low.")
    if (row.imageEdgeDensity != null && row.imageEdgeDensity < 0.04) reasons.push("Image detail/edge density is too low.")
    if (row.imageLeftRightBalance != null && row.imageLeftRightBalance > 0.65) reasons.push("Body balance appears asymmetric.")
    if (row.overallScore < 60) reasons.push("Overall score below acceptable threshold.")
    if (row.scorePenalty >= 10) reasons.push("Overdue timing penalty applied.")
    return reasons
  }

  async function submitSuspiciousFlag(row: ReviewRow) {
    const autoReasons = buildSuspiciousReasons(row)
    const customText = prompt("Additional suspicious reason (optional):", "") || ""
    const allReasons = [...autoReasons, ...customText.split(";").map((item) => item.trim()).filter(Boolean)]
    const flaggedBy = prompt("Flagged by:", "Supervisor") || "Supervisor"

    const response = await fetch("/api/turning-photo-assessments/flag", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        reasons: allReasons,
        flaggedBy,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      setStatus(`Unable to flag suspicious record${payload?.error ? `: ${payload.error}` : ""}`)
      return
    }
    setStatus(allReasons.length > 0 ? "Suspicious flag saved." : "Suspicious flag cleared.")
    await refreshRows()
  }

  const visibleRows = showSuspiciousOnly ? rows.filter((row) => row.suspiciousFlag) : rows

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminGate pageName="Turning Supervisor Review" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Supervisor</p>
          <h1 className="text-2xl font-semibold text-slate-900">Turning Supervisor Review</h1>
          <p className="text-sm text-slate-500">Approve, reject, or override AI score with comments</p>
        </div>
        <Link href="/turning" className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          Back to Turning
        </Link>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowSuspiciousOnly((prev) => !prev)}
          className={`rounded border px-3 py-1.5 text-sm font-semibold ${
            showSuspiciousOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          {showSuspiciousOnly ? "Showing suspicious only" : "Show suspicious only"}
        </button>
        <span className="text-xs text-slate-500">
          Visible: {visibleRows.length} / {rows.length}
        </span>
      </div>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Nurse</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">AI score</th>
              <th className="px-4 py-3">Allowance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Debug</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <Fragment key={row.id}>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.patientName}</td>
                  <td className="px-4 py-3 text-slate-700">{row.room}</td>
                  <td className="px-4 py-3 text-slate-700">{row.nurseName}</td>
                  <td className="px-4 py-3 text-slate-700">{row.turningPosition}</td>
                  <td className="px-4 py-3 text-slate-700">{row.overallScore}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>RM {Number(row.allowanceEarned || 0).toFixed(2)}</div>
                    {row.allowanceLocked ? (
                      <div className="mt-1 inline-flex rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Locked</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{row.supervisorStatus}</div>
                    {row.suspiciousFlag ? <div className="mt-1 inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Suspicious</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId((prev) => (prev === row.id ? null : row.id))}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      {expandedId === row.id ? "Hide debug" : "Show debug"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void submitReview(row.id, "approved")
                        }}
                        disabled={row.allowanceLocked}
                        className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void submitReview(row.id, "rejected")
                        }}
                        disabled={row.allowanceLocked}
                        className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void submitReview(row.id, "overridden")
                        }}
                        className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                      >
                        Override
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void submitSuspiciousFlag(row)
                        }}
                        className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700"
                      >
                        {row.suspiciousFlag ? "Update suspicious" : "Flag suspicious"}
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === row.id ? (
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded border border-slate-200 bg-white p-2">
                          <p className="font-semibold text-slate-900">Score Breakdown</p>
                          <p>Posture: {row.postureScore}/35</p>
                          <p>Safety: {row.safetyScore}/30</p>
                          <p>Timing: {row.timingScore}/20</p>
                          <p>Documentation: {row.documentationScore}/15</p>
                          <p>Penalty: -{row.scorePenalty}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-white p-2">
                          <p className="font-semibold text-slate-900">Scoring Reason</p>
                          <p>{row.scoreReason || "-"}</p>
                          <p className="mt-1">Mode: {row.analysisMode}</p>
                          <p className="mt-1">Suspicious: {row.suspiciousFlag ? "Yes" : "No"}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-white p-2">
                          <p className="font-semibold text-slate-900">Image Metrics (1)</p>
                          <p>Brightness: {row.imageBrightness == null ? "-" : row.imageBrightness.toFixed(3)}</p>
                          <p>Contrast: {row.imageContrast == null ? "-" : row.imageContrast.toFixed(3)}</p>
                          <p>Edge density: {row.imageEdgeDensity == null ? "-" : row.imageEdgeDensity.toFixed(3)}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-white p-2">
                          <p className="font-semibold text-slate-900">Image Metrics (2)</p>
                          <p>Center X: {row.imageCenteredMassX == null ? "-" : row.imageCenteredMassX.toFixed(3)}</p>
                          <p>Center Y: {row.imageCenteredMassY == null ? "-" : row.imageCenteredMassY.toFixed(3)}</p>
                          <p>L/R balance: {row.imageLeftRightBalance == null ? "-" : row.imageLeftRightBalance.toFixed(3)}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-white p-2">
                          <p className="font-semibold text-slate-900">Suspicious Flag Details</p>
                          <p>Flagged at: {row.flaggedAt || "-"}</p>
                          <p>Flagged by: {row.flaggedBy || "-"}</p>
                          <p>Reasons:</p>
                          {row.suspiciousReasons.length > 0 ? (
                            <ul className="list-disc pl-4">
                              {row.suspiciousReasons.map((reason, idx) => (
                                <li key={`${row.id}-r-${idx}`}>{reason}</li>
                              ))}
                            </ul>
                          ) : (
                            <p>-</p>
                          )}
                        </div>
                        <div className="rounded border border-slate-200 bg-white p-2">
                          <p className="font-semibold text-slate-900">Verification & EXIF</p>
                          <p>Upload source: {row.uploadSource}</p>
                          <p>Verification: {row.verificationResult}</p>
                          <p>Allowance lock: {row.allowanceLocked ? "Yes" : "No"}</p>
                          <p>Lock reason: {row.allowanceLockReason || "-"}</p>
                          <p>Badges: {(row.verificationBadges || []).join(", ") || "-"}</p>
                          <p>Gallery warning: {row.galleryUploadWarning ? "Yes" : "No"}</p>
                          <p>Capture delta: {row.captureTimeDeltaMinutes == null ? "-" : `${row.captureTimeDeltaMinutes} min`}</p>
                          <p>EXIF capture: {row.exifCaptureTime || "-"}</p>
                          <p>EXIF device: {[row.exifDeviceMake, row.exifDeviceModel].filter(Boolean).join(" ") || "-"}</p>
                          <p>EXIF GPS: {row.exifGpsLat == null || row.exifGpsLng == null ? "-" : `${row.exifGpsLat}, ${row.exifGpsLng}`}</p>
                          <p>Image hash: {row.imageHash ? `${row.imageHash.slice(0, 12)}...` : "-"}</p>
                          <p>Flags: {[
                            row.lateUpload ? "Late Upload" : "",
                            row.invalidTurningEvidence ? "Invalid Turning Evidence" : "",
                            row.duplicateImageHash ? "Duplicate Photo" : "",
                            row.reusedTurningImage ? "Reused Turning Image" : "",
                            row.screenshotUpload ? "Screenshot Upload" : "",
                            row.editedImageLikely ? "Edited Image" : "",
                          ].filter(Boolean).join(" | ") || "-"}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-slate-500">
                  {showSuspiciousOnly ? "No suspicious records found." : "No review records yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}
    </main>
  )
}
