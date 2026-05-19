/**
 * Rule-based AI risk scoring from numeric vital sign readings.
 * Produces risk flags for: Fever, Low Oxygen, High BP, Aggressive Behavior, Fall Risk, and Glucose.
 * Demo only — not a regulated medical device; always verify at the bedside.
 */

export const RISK_LEVELS = {
  CRITICAL: 'critical',
  HIGH: 'high',
  WARNING: 'warning',
  NORMAL: 'normal',
}

/** Colour / style tokens per risk level for consistent UI rendering. */
export function riskLevelStyle(level) {
  switch (level) {
    case RISK_LEVELS.CRITICAL:
      return {
        bg: 'bg-red-50',
        border: 'border-red-300',
        text: 'text-red-800',
        badgeBg: 'bg-red-500',
        badgeText: 'text-white',
        dot: 'bg-red-500',
        ring: 'ring-red-400/40',
        label: 'Critical',
      }
    case RISK_LEVELS.HIGH:
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-300',
        text: 'text-orange-800',
        badgeBg: 'bg-orange-500',
        badgeText: 'text-white',
        dot: 'bg-orange-400',
        ring: 'ring-orange-400/40',
        label: 'High',
      }
    case RISK_LEVELS.WARNING:
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-800',
        badgeBg: 'bg-amber-400',
        badgeText: 'text-white',
        dot: 'bg-amber-400',
        ring: 'ring-amber-400/40',
        label: 'Caution',
      }
    default:
      return {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-800',
        badgeBg: 'bg-emerald-500',
        badgeText: 'text-white',
        dot: 'bg-emerald-400',
        ring: 'ring-emerald-400/40',
        label: 'Normal',
      }
  }
}

/**
 * Assess vital signs and return a list of risk findings.
 *
 * @param {object} vitals
 * @param {string|number} vitals.bpSystolic
 * @param {string|number} vitals.bpDiastolic
 * @param {string|number} vitals.pulse
 * @param {string|number} vitals.temperature   — degrees Celsius
 * @param {string|number} vitals.spo2          — percent (e.g. 96)
 * @param {string|number} vitals.glucose       — mmol/L
 * @param {string|number} vitals.painScore     — 0–10
 * @param {string}        vitals.mood          — free text / selection
 * @returns {{ risks: object[], overallRiskLevel: string }}
 */
export function assessVitalRisks(vitals) {
  const risks = []

  // ── Fever ──────────────────────────────────────────────────────────────────
  const temp = parseFloat(vitals.temperature)
  if (Number.isFinite(temp) && temp > 30) {
    if (temp >= 39.5) {
      risks.push({
        id: 'fever',
        label: 'Fever',
        level: RISK_LEVELS.CRITICAL,
        value: `${temp.toFixed(1)} °C`,
        message: `High fever (${temp.toFixed(1)} °C) — immediate physician notification and cooling measures required.`,
        action: 'Notify physician NOW · Antipyretics per order · Cooling measures · Blood cultures if indicated',
      })
    } else if (temp >= 38.0) {
      risks.push({
        id: 'fever',
        label: 'Fever',
        level: RISK_LEVELS.HIGH,
        value: `${temp.toFixed(1)} °C`,
        message: `Elevated temperature (${temp.toFixed(1)} °C) — notify physician within shift, increase fluid intake.`,
        action: 'Notify physician · Encourage fluids · Reassess q2h',
      })
    } else if (temp >= 37.5) {
      risks.push({
        id: 'fever',
        label: 'Low-grade Fever',
        level: RISK_LEVELS.WARNING,
        value: `${temp.toFixed(1)} °C`,
        message: `Low-grade temperature (${temp.toFixed(1)} °C) — monitor closely and encourage hydration.`,
        action: 'Monitor temp q4h · Increase fluid intake',
      })
    } else {
      risks.push({
        id: 'fever',
        label: 'Temperature',
        level: RISK_LEVELS.NORMAL,
        value: `${temp.toFixed(1)} °C`,
        message: 'Temperature within normal range.',
        action: 'Continue routine monitoring.',
      })
    }
  }

  // ── Low Oxygen Saturation ──────────────────────────────────────────────────
  const spo2 = parseFloat(vitals.spo2)
  if (Number.isFinite(spo2) && spo2 > 0) {
    if (spo2 < 90) {
      risks.push({
        id: 'low_oxygen',
        label: 'Low Oxygen',
        level: RISK_LEVELS.CRITICAL,
        value: `${spo2}%`,
        message: `Critical SpO₂ (${spo2}%) — initiate supplemental oxygen immediately and call physician.`,
        action: 'Start O₂ therapy NOW · Notify physician · Position upright · Prepare for escalation',
      })
    } else if (spo2 < 92) {
      risks.push({
        id: 'low_oxygen',
        label: 'Low Oxygen',
        level: RISK_LEVELS.HIGH,
        value: `${spo2}%`,
        message: `Low SpO₂ (${spo2}%) — notify physician, consider supplemental O₂ per order.`,
        action: 'Notify physician · Apply O₂ if ordered · Recheck in 15 min',
      })
    } else if (spo2 < 95) {
      risks.push({
        id: 'low_oxygen',
        label: 'Borderline O₂',
        level: RISK_LEVELS.WARNING,
        value: `${spo2}%`,
        message: `SpO₂ borderline (${spo2}%) — encourage deep breathing and recheck in 30 minutes.`,
        action: 'Encourage deep breathing · Recheck q30 min · Document trend',
      })
    } else {
      risks.push({
        id: 'low_oxygen',
        label: 'Oxygen Sat.',
        level: RISK_LEVELS.NORMAL,
        value: `${spo2}%`,
        message: 'Oxygen saturation within acceptable range.',
        action: 'Continue routine monitoring.',
      })
    }
  }

  // ── High Blood Pressure ────────────────────────────────────────────────────
  const systolic = parseInt(vitals.bpSystolic, 10)
  const diastolic = parseInt(vitals.bpDiastolic, 10)
  if (Number.isFinite(systolic) && systolic > 0) {
    const bpDisplay = Number.isFinite(diastolic) && diastolic > 0 ? `${systolic}/${diastolic}` : `${systolic}/—`
    if (systolic >= 180 || (Number.isFinite(diastolic) && diastolic >= 110)) {
      risks.push({
        id: 'high_bp',
        label: 'High Blood Pressure',
        level: RISK_LEVELS.CRITICAL,
        value: `${bpDisplay} mmHg`,
        message: `Hypertensive crisis (${bpDisplay} mmHg) — notify physician immediately; do not leave bedside.`,
        action: 'Call physician IMMEDIATELY · No unsupervised ambulation · Reassess q5 min',
      })
    } else if (systolic >= 160 || (Number.isFinite(diastolic) && diastolic >= 100)) {
      risks.push({
        id: 'high_bp',
        label: 'High Blood Pressure',
        level: RISK_LEVELS.HIGH,
        value: `${bpDisplay} mmHg`,
        message: `Stage 2 hypertension (${bpDisplay} mmHg) — notify physician within shift.`,
        action: 'Notify physician this shift · Restrict activity · Recheck in 30 min',
      })
    } else if (systolic >= 140 || (Number.isFinite(diastolic) && diastolic >= 90)) {
      risks.push({
        id: 'high_bp',
        label: 'Elevated BP',
        level: RISK_LEVELS.WARNING,
        value: `${bpDisplay} mmHg`,
        message: `Elevated blood pressure (${bpDisplay} mmHg) — recheck in 30 minutes and document trend.`,
        action: 'Recheck in 30 min · Ensure patient is resting · Document trend',
      })
    } else {
      risks.push({
        id: 'high_bp',
        label: 'Blood Pressure',
        level: RISK_LEVELS.NORMAL,
        value: `${bpDisplay} mmHg`,
        message: 'Blood pressure within normal range.',
        action: 'Continue routine monitoring.',
      })
    }
  }

  // ── Aggressive / Behavioral Risk ──────────────────────────────────────────
  const moodLower = String(vitals.mood || '').toLowerCase()
  const criticalBehavior = ['combative', 'aggressive', 'violent', 'threatening', 'attacking', 'hitting', 'biting']
  const highBehavior = ['agitated', 'restless', 'hostile', 'irritable', 'screaming', 'yelling']
  if (criticalBehavior.some((k) => moodLower.includes(k))) {
    risks.push({
      id: 'aggressive',
      label: 'Aggressive Behavior',
      level: RISK_LEVELS.CRITICAL,
      value: vitals.mood,
      message: `Aggressive behavior reported (${vitals.mood}) — immediate de-escalation and safety measures required.`,
      action: 'Safety protocol NOW · Do not approach alone · Notify charge RN + physician · Consider 1:1',
    })
  } else if (highBehavior.some((k) => moodLower.includes(k))) {
    risks.push({
      id: 'aggressive',
      label: 'Agitation',
      level: RISK_LEVELS.HIGH,
      value: vitals.mood,
      message: `Agitated behavior (${vitals.mood}) — de-escalation required, notify charge RN.`,
      action: 'De-escalation techniques · Notify charge RN · Remove hazards · Increase rounding',
    })
  }

  // ── Fall Risk ──────────────────────────────────────────────────────────────
  const pain = parseInt(vitals.painScore, 10)
  const confusedTerms = ['confused', 'disoriented', 'dizzy', 'unsteady', 'drowsy', 'lethargic']
  const isConfused = confusedTerms.some((k) => moodLower.includes(k))
  if (Number.isFinite(pain)) {
    const hasCritical = pain >= 9 || (isConfused && pain >= 7)
    const hasHigh = !hasCritical && (pain >= 7 || isConfused)
    const hasWarning = !hasCritical && !hasHigh && pain >= 5
    if (hasCritical) {
      risks.push({
        id: 'fall_risk',
        label: 'Fall Risk',
        level: RISK_LEVELS.CRITICAL,
        value: `Pain ${pain}/10`,
        message: `High fall risk: severe pain or altered cognition — immediate fall prevention protocol.`,
        action: 'Low-low bed · Bed alarm ON · 1:1 supervision · Remove hazards · Notify physician',
      })
    } else if (hasHigh) {
      risks.push({
        id: 'fall_risk',
        label: 'Fall Risk',
        level: RISK_LEVELS.HIGH,
        value: `Pain ${pain}/10`,
        message: `Elevated fall risk: pain ${pain}/10${isConfused ? ' with altered mental status' : ''} — increase supervision.`,
        action: 'Bed alarm ON · Non-slip footwear · Increase rounding · Call bell accessible',
      })
    } else if (hasWarning) {
      risks.push({
        id: 'fall_risk',
        label: 'Fall Risk',
        level: RISK_LEVELS.WARNING,
        value: `Pain ${pain}/10`,
        message: `Moderate pain (${pain}/10) — ensure safe environment and mobility aids in place.`,
        action: 'Check mobility aids · Ensure call bell reachable · Remind to call before standing',
      })
    }
  }

  // ── Blood Glucose ──────────────────────────────────────────────────────────
  const glucose = parseFloat(vitals.glucose)
  if (Number.isFinite(glucose) && glucose > 0) {
    if (glucose < 3.5) {
      risks.push({
        id: 'glucose',
        label: 'Hypoglycemia',
        level: RISK_LEVELS.CRITICAL,
        value: `${glucose} mmol/L`,
        message: `Critical hypoglycemia (${glucose} mmol/L) — administer glucose per protocol immediately.`,
        action: 'Administer glucose NOW per protocol · Recheck in 15 min · Notify physician',
      })
    } else if (glucose < 4.0) {
      risks.push({
        id: 'glucose',
        label: 'Low Glucose',
        level: RISK_LEVELS.HIGH,
        value: `${glucose} mmol/L`,
        message: `Low glucose (${glucose} mmol/L) — offer snack and recheck in 15 minutes.`,
        action: 'Offer carbohydrate snack · Recheck in 15 min · Notify physician if symptomatic',
      })
    } else if (glucose > 20) {
      risks.push({
        id: 'glucose',
        label: 'Hyperglycemia',
        level: RISK_LEVELS.CRITICAL,
        value: `${glucose} mmol/L`,
        message: `Severe hyperglycemia (${glucose} mmol/L) — notify physician immediately.`,
        action: 'Notify physician IMMEDIATELY · Check for ketones · IV access per order · Strict I&O',
      })
    } else if (glucose > 11) {
      risks.push({
        id: 'glucose',
        label: 'High Glucose',
        level: RISK_LEVELS.WARNING,
        value: `${glucose} mmol/L`,
        message: `Elevated glucose (${glucose} mmol/L) — document and notify physician per protocol.`,
        action: 'Document trend · Notify physician per protocol · Encourage fluids',
      })
    }
  }

  // ── Pulse (tachycardia / bradycardia) ─────────────────────────────────────
  const pulse = parseInt(vitals.pulse, 10)
  if (Number.isFinite(pulse) && pulse > 0) {
    if (pulse > 130 || pulse < 45) {
      risks.push({
        id: 'pulse',
        label: pulse > 130 ? 'Tachycardia' : 'Bradycardia',
        level: RISK_LEVELS.CRITICAL,
        value: `${pulse} bpm`,
        message: `${pulse > 130 ? 'Severe tachycardia' : 'Severe bradycardia'} (${pulse} bpm) — notify physician immediately.`,
        action: 'Notify physician IMMEDIATELY · 12-lead ECG per order · Continuous monitoring',
      })
    } else if (pulse > 110 || pulse < 55) {
      risks.push({
        id: 'pulse',
        label: pulse > 110 ? 'Tachycardia' : 'Bradycardia',
        level: RISK_LEVELS.HIGH,
        value: `${pulse} bpm`,
        message: `${pulse > 110 ? 'Elevated' : 'Low'} heart rate (${pulse} bpm) — notify physician within shift.`,
        action: 'Notify physician · Recheck in 30 min · Document rhythm if available',
      })
    }
  }

  // ── Determine overall risk level ───────────────────────────────────────────
  const levels = risks.map((r) => r.level)
  let overallRiskLevel = RISK_LEVELS.NORMAL
  if (levels.includes(RISK_LEVELS.CRITICAL)) overallRiskLevel = RISK_LEVELS.CRITICAL
  else if (levels.includes(RISK_LEVELS.HIGH)) overallRiskLevel = RISK_LEVELS.HIGH
  else if (levels.includes(RISK_LEVELS.WARNING)) overallRiskLevel = RISK_LEVELS.WARNING

  return { risks, overallRiskLevel }
}

/** Returns only the 5 primary risk categories the user asked for: Fever, Low Oxygen, High BP, Aggressive, Fall Risk */
export const PRIMARY_RISK_IDS = ['fever', 'low_oxygen', 'high_bp', 'aggressive', 'fall_risk']
