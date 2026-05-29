/**
 * Clinical alert detection engine.
 *
 * Evaluates parsed vital signs + nutrition observations against clinical
 * thresholds and produces structured alerts with a severity level.
 *
 * Thresholds:
 *   SpO2 < 90                       → Low Oxygen        (CRITICAL)
 *   Systolic > 180 OR Diastolic>110 → High BP           (HIGH)
 *   Systolic < 90                   → Low BP            (HIGH)
 *   Pulse > 120                     → Tachycardia       (HIGH)
 *   Pulse < 50                      → Bradycardia       (HIGH)
 *   poor appetite / not eating /    → Nutrition Concern (MEDIUM)
 *   refuse food / reduced intake
 */

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM"

export type DetectedAlert = {
  alertType: string
  severity: AlertSeverity
  detail: string
}

export type VitalsForAlerts = {
  bloodPressure?: string | null
  pulse?: string | number | null
  spo2?: string | number | null
  nutrition?: string | null
}

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
    alerts.push({ alertType: "Nutrition Concern", severity: "MEDIUM", detail: nutrition })
  }

  return alerts
}
