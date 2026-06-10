/**
 * Clinical alert detection engine.
 *
 * Evaluates parsed vital signs + clinical observations against thresholds and
 * produces structured alerts with a severity level, plus an overall risk grade.
 *
 * Thresholds:
 *   SpO2 < 90                       → Low Oxygen          (CRITICAL)
 *   Systolic > 180 OR Diastolic>110 → High BP             (HIGH)
 *   Systolic < 90                   → Low BP              (HIGH)
 *   Pulse > 120                     → Tachycardia         (HIGH)
 *   Pulse < 50                      → Bradycardia         (HIGH)
 *   poor appetite / not eating /    → Nutrition Concern   (HIGH)
 *   refuse food / reduced intake
 *   fall / fell / found on floor    → Fall Incident       (CRITICAL)
 *   bedbound / weak / unsteady /    → High Risk Mobility  (HIGH)
 *   needs assistance / wheelchair
 *   pain score >= 7                 → Severe Pain         (HIGH)
 *
 * Overall risk: CRITICAL alert → Critical, HIGH → High, MEDIUM → Moderate, else Low.
 */

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM"

export type RiskLevel = "Critical" | "High" | "Moderate" | "Low"

export type DetectedAlert = {
  alertType: string
  severity: AlertSeverity
  detail: string
}

export type VitalsForAlerts = {
  bloodPressure?: string | null
  pulse?: string | number | null
  spo2?: string | number | null
  temperature?: string | number | null
  nutrition?: string | null
  mobility?: string | null
  painScore?: string | number | null
  fallIncident?: boolean | string | null
  /** Canonical English conditions detected by the multilingual NLP parser. */
  conditions?: string[] | null
}

const HIGH_RISK_MOBILITY = ["bedbound", "bedridden", "weak", "unsteady", "needs assistance", "wheelchair"]

// Canonical condition → alert mapping. Cough is documented but not alerted.
const CONDITION_ALERTS: Record<string, { alertType: string; severity: AlertSeverity }> = {
  "Chest pain": { alertType: "Chest Pain", severity: "CRITICAL" },
  "Shortness of breath": { alertType: "Respiratory Distress", severity: "CRITICAL" },
  Vomiting: { alertType: "Vomiting", severity: "MEDIUM" },
  Diarrhea: { alertType: "Diarrhea", severity: "MEDIUM" },
}

const SEVERITY_WEIGHT: Record<AlertSeverity, number> = { CRITICAL: 40, HIGH: 20, MEDIUM: 10 }

function toNum(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

function parseBp(bp?: string | null): { systolic: number | null; diastolic: number | null } {
  if (!bp) return { systolic: null, diastolic: null }
  const m = /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(String(bp))
  if (!m) return { systolic: null, diastolic: null }
  return { systolic: Number(m[1]), diastolic: Number(m[2]) }
}

/** Detect the canonical nutrition concern phrase, or null. */
export function detectNutritionConcern(text?: string | null): string | null {
  const t = String(text ?? "").toLowerCase()
  if (!t) return null
  if (/\bpoor\s+appetite\b/.test(t)) return "Poor appetite"
  if (/\bnot\s+eating\b/.test(t)) return "Not eating"
  if (/\brefus(e|ed|ing)\s+(food|meal|to\s+eat)\b/.test(t) || /\brefuse\s+food\b/.test(t)) return "Refusing food"
  if (/\breduced\s+(intake|appetite|oral\s+intake)\b/.test(t)) return "Reduced intake"
  if (/\bpoor\s+(oral\s+)?intake\b/.test(t)) return "Poor intake"
  return null
}

/**
 * Evaluate vitals + nutrition and return any clinical alerts.
 */
export function detectClinicalAlerts(v: VitalsForAlerts): DetectedAlert[] {
  const alerts: DetectedAlert[] = []

  const spo2 = toNum(v.spo2 ?? null)
  if (spo2 != null && spo2 < 90) {
    alerts.push({ alertType: "Low Oxygen", severity: "CRITICAL", detail: `SpO2 ${spo2}%` })
  }

  const { systolic, diastolic } = parseBp(v.bloodPressure)
  if ((systolic != null && systolic > 180) || (diastolic != null && diastolic > 110)) {
    alerts.push({
      alertType: "High BP",
      severity: "HIGH",
      detail: `BP ${systolic ?? "-"}/${diastolic ?? "-"}`,
    })
  }
  if (systolic != null && systolic < 90) {
    alerts.push({
      alertType: "Low BP",
      severity: "HIGH",
      detail: `BP ${systolic}/${diastolic ?? "-"}`,
    })
  }

  const pulse = toNum(v.pulse ?? null)
  if (pulse != null && pulse > 120) {
    alerts.push({ alertType: "Tachycardia", severity: "HIGH", detail: `Pulse ${pulse} bpm` })
  }
  if (pulse != null && pulse < 50) {
    alerts.push({ alertType: "Bradycardia", severity: "HIGH", detail: `Pulse ${pulse} bpm` })
  }

  const nutrition = detectNutritionConcern(v.nutrition)
  if (nutrition) {
    alerts.push({ alertType: "Nutrition Concern", severity: "HIGH", detail: nutrition })
  }

  const fall = v.fallIncident === true || (typeof v.fallIncident === "string" && /^(true|yes|1|fall)/i.test(v.fallIncident))
  if (fall) {
    alerts.push({ alertType: "Fall Incident", severity: "CRITICAL", detail: "Fall reported" })
  }

  const mobility = String(v.mobility ?? "").trim().toLowerCase()
  if (mobility && HIGH_RISK_MOBILITY.some((m) => mobility.includes(m))) {
    alerts.push({ alertType: "High Risk Mobility", severity: "HIGH", detail: String(v.mobility) })
  }

  const pain = toNum(v.painScore ?? null)
  if (pain != null && pain >= 7) {
    alerts.push({ alertType: "Severe Pain", severity: "HIGH", detail: `Pain score ${pain}/10` })
  }

  // ── Temperature / fever ────────────────────────────────────────────────────
  const temp = toNum(v.temperature ?? null)
  const conditions = Array.isArray(v.conditions) ? v.conditions : []
  const hasFeverWord = conditions.includes("Fever")
  if (temp != null && temp >= 39) {
    alerts.push({ alertType: "High Fever", severity: "HIGH", detail: `Temperature ${temp}°C` })
  } else if (hasFeverWord) {
    alerts.push({ alertType: "Fever", severity: "MEDIUM", detail: temp != null ? `Temperature ${temp}°C` : "Fever reported" })
  }

  // ── Other multilingual conditions ──────────────────────────────────────────
  for (const condition of conditions) {
    const mapped = CONDITION_ALERTS[condition]
    if (mapped) {
      alerts.push({ alertType: mapped.alertType, severity: mapped.severity, detail: condition })
    }
  }

  return alerts
}

/** Grade overall patient risk from the detected alerts. */
export function classifyRisk(alerts: DetectedAlert[]): RiskLevel {
  if (alerts.some((a) => a.severity === "CRITICAL")) return "Critical"
  if (alerts.some((a) => a.severity === "HIGH")) return "High"
  if (alerts.some((a) => a.severity === "MEDIUM")) return "Moderate"
  return "Low"
}

/** Numeric automatic risk score (sum of severity weights, capped at 100). */
export function computeRiskScore(alerts: DetectedAlert[]): number {
  const total = alerts.reduce((sum, a) => sum + (SEVERITY_WEIGHT[a.severity] || 0), 0)
  return Math.min(100, total)
}
