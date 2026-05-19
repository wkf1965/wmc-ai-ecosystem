import type { BedExitAlertBody } from './bedExitAlert.validation.js'
import type {
  BedExitAlertLevel,
  BedExitAlertResponse,
  RiskTierInput,
} from './bedExitAlert.types.js'

function tierPoints(level: RiskTierInput): number {
  switch (level) {
    case 'High':
      return 4
    case 'Medium':
      return 2
    default:
      return 0
  }
}

function looksLikeNightHour(timeOfAttempt: string): boolean {
  const m = /^(\d{1,2}):(\d{2})\s*$/.exec(timeOfAttempt.trim())
  if (!m) return false
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return false
  return h < 7 || h >= 22
}

/**
 * Effective night-context for bed-exit wording and scoring boosts.
 */
function isNightBedExit(body: BedExitAlertBody): boolean {
  return Boolean(body.nightShift && body.bedExitAttempt)
}

/** Weighted composite — aligns Ah Chong flagship with `Urgent` and demo copy. */
function computeBedExitScore(body: BedExitAlertBody): number {
  let score = tierPoints(body.fallRiskLevel) + tierPoints(body.wanderingRiskLevel)
  if (body.confusion) score += 2
  if (body.bedExitAttempt) score += 3
  if (body.bedExitAttempt && isNightBedExit(body)) score += 3
  else if (
    body.bedExitAttempt &&
    !body.nightShift &&
    body.timeOfAttempt &&
    looksLikeNightHour(body.timeOfAttempt)
  ) {
    score += 3
  }
  if (body.age >= 85) score += 1

  const mob = body.mobility.toLowerCase()
  if (
    /\b(independent|independently|ambulat(es|ing|ory)?)\b/i.test(body.mobility) ||
    (/\ballow(ed)? with supervision\b/i.test(body.mobility) && !/assist/i.test(body.mobility))
  ) {
    score += 1
  } else if (
    /\b(with |needs |requires )?(walker|walking frame|wheelchair)\b/i.test(body.mobility) ||
    /\bminimal assist/i.test(body.mobility)
  ) {
    score += 2
  } else if (/\bassist|assistive|walker|wheelchair|unsteady|shuffle/i.test(mob)) score += 1

  const exitHint = /\b(fell|fall|hurt|pain|injur|attempted\s+to\s+get\s+up|without\s+assist)/i.test(
    body.notes,
  )
  if (exitHint && body.bedExitAttempt) score += 1

  return score
}

function bandAlertLevel(score: number): BedExitAlertLevel {
  if (score >= 12) return 'Urgent'
  if (score >= 8) return 'High'
  if (score >= 4) return 'Medium'
  return 'Low'
}

/** Fall/wandering cues only surface at Medium+. */
function pushTierReason(reasons: string[], level: RiskTierInput, label: 'fall' | 'wandering') {
  if (level === 'Low') return
  const tier = level === 'High' ? 'High' : 'Medium'
  reasons.push(`${tier} ${label} risk`)
}

function collectAlertReasons(body: BedExitAlertBody): string[] {
  const reasons: string[] = []
  pushTierReason(reasons, body.fallRiskLevel, 'fall')
  pushTierReason(reasons, body.wanderingRiskLevel, 'wandering')

  const nightExit = body.bedExitAttempt && isNightBedExit(body)
  const nightByTime =
    body.bedExitAttempt &&
    !body.nightShift &&
    body.timeOfAttempt &&
    looksLikeNightHour(body.timeOfAttempt)

  if (body.confusion) reasons.push('Confusion')

  if (nightExit) reasons.push('Night bed-exit attempt')
  else if (nightByTime) reasons.push('Night bed-exit attempt')
  else if (body.bedExitAttempt) reasons.push('Bed-exit attempt')

  return reasons
}

function recommendedActionsFor(level: BedExitAlertLevel): string[] {
  const base = ['Reinforce mobility safety near the bed']

  switch (level) {
    case 'Urgent':
      return [
        'Assist patient immediately',
        'Check for injury',
        'Increase night supervision',
        'Activate bed/chair alarm if available',
        'Document incident if patient fell',
      ]
    case 'High':
      return [
        'Attend bedside promptly',
        'Check gait and cognition',
        'Increase supervision',
        'Activate bed/chair alarm if available',
        'Document observations',
        ...base,
      ]
    case 'Medium':
      return ['Round more frequently overnight', 'Review bed-low position', ...base]
    default:
      return ['Continue scheduled rounding', ...base]
  }
}

/** Flagship line when urgency matches dual high contextual risks */
function summarizeBedExit(
  body: BedExitAlertBody,
  level: BedExitAlertLevel,
  reasons: string[],
): string {
  const name = body.patientName.trim()
  const r = reasons.join('|')

  const nightContext =
    isNightBedExit(body) ||
    (body.bedExitAttempt &&
      Boolean(body.timeOfAttempt && looksLikeNightHour(body.timeOfAttempt)))

  const dualHighNightUrgentFlagship =
    level === 'Urgent' &&
    body.bedExitAttempt &&
    nightContext &&
    body.fallRiskLevel === 'High' &&
    body.wanderingRiskLevel === 'High' &&
    body.confusion &&
    r.includes('High fall risk') &&
    r.includes('High wandering risk') &&
    r.includes('Night bed-exit attempt') &&
    r.includes('Confusion')

  if (dualHighNightUrgentFlagship) {
    return `${name} attempted to leave bed at night without assistance. Due to high fall and wandering risk, urgent nursing attention is required.`
  }

  if (level === 'Low') {
    return `${name} has minimal bed-exit signal on this submission; sustain routine safeguards.`
  }
  if (level === 'Medium') {
    const bits = reasons.slice(0, 4).join(', ')
    return `${name} warrants closer observation around transfers${bits ? `: ${bits}.` : '.'}`
  }
  if (level === 'High') {
    return `${name} attempted or is at heightened risk for unsupervised bed exit; attend quickly and mitigate injury risk (${reasons.slice(0, 4).join(', ')}).`
  }

  const timeBit = body.timeOfAttempt.trim()
    ? ` around ${body.timeOfAttempt.trim()}`
    : nightContext
      ? ' at night'
      : ''
  return `${name} requires urgent bedside response after an attempted exit${timeBit}. Priorities: ${reasons.slice(0, 4).join('; ')}.`
}

export function generateBedExitAlert(body: BedExitAlertBody): BedExitAlertResponse {
  const rawScore = computeBedExitScore(body)
  const alertReasons = collectAlertReasons(body)
  const bedExitAlertLevel =
    alertReasons.length === 0 && !body.bedExitAttempt ? 'Low' : bandAlertLevel(rawScore)

  const recommendedActions = recommendedActionsFor(bedExitAlertLevel)
  const aiSummary = summarizeBedExit(body, bedExitAlertLevel, alertReasons)

  return {
    patientName: body.patientName.trim(),
    bedExitAlertLevel,
    alertReasons,
    recommendedActions,
    aiSummary,
  }
}
