/**
 * Clinical dashboard taxonomy + workflow risk labels for Telegram nursing.
 * Risk tiers: Low | Warning | High | Emergency (aligned with dashboard + Sheets).
 */

/** Display order when multiple categories apply */
export const DASHBOARD_CATEGORY_ORDER = [
  'Emergency',
  'Fall Risk',
  'Medication',
  'Wound Care',
  'Nutrition',
  'Mobility / Rehabilitation',
  'Behaviour / Mental Status',
  'Family Update',
  'Shift Handover',
  'General Nursing Note',
]

export function detectEmergencyFromText(text) {
  const t = String(text || '')
  return /\b(code\s*blue|unresponsive|not\s+breathing|cannot\s+breathe|chest\s+pain|stroke\b|severe\s+bleed|911\b|ambulance|respiratory\s+distress|overdose)\b/i.test(
    t,
  )
}

/**
 * @param {object} parsed — parseTelegramNurseMessage
 * @param {object} integration — processTelegramNurseMessageForIntegration result
 * @returns {{ labels: string[], display: string }}
 */
export function classifyDashboardCategories(parsed, integration) {
  const raw = `${parsed?.originalText || ''}\n${parsed?.nursingNoteText || ''}`
  const text = raw.toLowerCase()
  const set = new Set()
  const loop = String(parsed?.suggestedLoopCategory || '')

  if (detectEmergencyFromText(parsed?.originalText || '') || loop === 'doctor_review') {
    set.add('Emergency')
  }

  if (loop === 'fall_risk' || /\bfell\b|\bfall\b|near\s+fall|weak\s+mobility|unsteady|syncope/i.test(raw)) {
    set.add('Fall Risk')
  }

  if (loop === 'medication' || /\bmedication\b|\bmar\b|missed\s+med|refused\s+med|\bpill\b|\bdose\b/i.test(raw)) {
    set.add('Medication')
  }

  if (
    /\bwound\b|dressing|pressure\s+ulcer|skin\s+tear|skin\s+breakdown|purulent\s+drainage/i.test(text) ||
    (/\bredness\b|\bskin\b/i.test(text) && /\bwound\b/i.test(text))
  ) {
    set.add('Wound Care')
  }

  if (
    loop === 'nutrition' ||
    loop === 'hydration' ||
    /\bappetite\b|\bmeal\b|\blunch\b|\bnpo\b|reduced\s+intake|poor\s+intake|dehydrat|\burine\b|fluid\b/i.test(text)
  ) {
    set.add('Nutrition')
  }

  if (
    loop === 'rehabilitation' ||
    /\brehab\b|\btherapy\b|\bambulation\b|\bgait\b|\bmobil/i.test(text) ||
    /\bpt\b|\bot\b/i.test(raw)
  ) {
    set.add('Mobility / Rehabilitation')
  }

  if (
    loop === 'mental_health' ||
    /\bconfus|\bagitat|\banxious\b|\bdisorient|\bhallucin|\bdepress|\bbehaviour|\bbehavior|\bmental\s+status/i.test(text)
  ) {
    set.add('Behaviour / Mental Status')
  }

  if (
    /\bfamily\s+update\b|\bdaughter\b|\bson\b|family\s+informed|spoke\s+with\s+family|\bpoa\b|next\s+of\s+kin/i.test(text)
  ) {
    set.add('Family Update')
  }

  if (
    /\bhandover\b|shift\s+report|change\s+of\s+shift|end\s+of\s+shift|start\s+of\s+shift|night\s+shift|morning\s+shift/i.test(
      text,
    )
  ) {
    set.add('Shift Handover')
  }

  if (integration?.patientResolution && set.size === 0) {
    return { labels: ['General Nursing Note'], display: 'General Nursing Note' }
  }

  if (set.size === 0) {
    set.add('General Nursing Note')
  }

  const labels = DASHBOARD_CATEGORY_ORDER.filter((k) => set.has(k))
  return {
    labels,
    display: labels.join(' + '),
  }
}

/**
 * @param {object} integration
 * @returns {{ level: string, isEmergency: boolean }}
 */
export function dashboardRiskLevel(integration) {
  if (integration?.patientResolution) {
    return { level: 'N/A', isEmergency: false }
  }

  const parsed = integration?.parsed
  const scoreRaw = integration?.analysis?.overallScore
  const score = Number(scoreRaw)
  const scoreOk = Number.isFinite(score)

  const emergencyLoop = String(parsed?.suggestedLoopCategory || '') === 'doctor_review'
  const emergencyText = detectEmergencyFromText(parsed?.originalText || '')
  if (emergencyLoop || emergencyText) {
    return { level: 'Emergency', isEmergency: true }
  }

  if (!scoreOk) {
    return { level: 'Low', isEmergency: false }
  }

  if (score >= 75) return { level: 'Emergency', isEmergency: true }
  if (score >= 55) return { level: 'High', isEmergency: false }
  if (score >= 35) return { level: 'Warning', isEmergency: false }
  return { level: 'Low', isEmergency: false }
}

/**
 * Telegram-safe action line — no medication dosing; emergency uses mandated wording.
 */
export function formatRecommendedActionForTelegram(integration, risk) {
  if (risk?.isEmergency || risk?.level === 'Emergency') {
    return 'Please notify nurse-in-charge / doctor immediately.'
  }
  const raw = String(integration?.recommendedAction || '').trim()
  if (!raw) {
    return 'Notify nurse-in-charge per unit protocol and verify at bedside.'
  }
  let t = raw.replace(/\s+/g, ' ').trim()
  if (/\b\d+\s*(mg|mcg|ml)\b/i.test(t) || /\bincrease\s+dose\b|\bdecrease\s+dose\b/i.test(t)) {
    return 'Escalate to nurse-in-charge for medication-related concerns — no dosing guidance via bot.'
  }
  const maxLen = 180
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1).trim()}…`
}
