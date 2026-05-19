import type { FamilyUpdateBody } from './familyUpdate.validation.js'
import type { FamilyUpdateResponse, FamilyUpdateStatusLevel } from './familyUpdate.types.js'

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/** Rule-based triage for families — plain-language tiers */
export function deriveFamilyUpdateStatus(body: FamilyUpdateBody): FamilyUpdateStatusLevel {
  const vs = norm(body.vitalStatus)
  const mood = norm(body.mood)
  const appetite = norm(body.appetite)
  const mobility = norm(body.mobility)

  const criticalVitals =
    /\b(critical|emergency|severely unstable|acute deterioration)\b/.test(vs) ||
    vs.includes('very unstable')

  const criticalMobility =
    /\b(unresponsive|non-responsive|unable to wake)\b/.test(mobility)

  const criticalMood = /\b(unresponsive|severe distress)\b/.test(mood)

  if (criticalVitals || criticalMobility || criticalMood) return 'Critical'

  const attentionVitals =
    /\b(attention|monitor closely|needs monitoring|concerning|unstable|declining)\b/.test(vs) ||
    /\b(fair only|needs watching)\b/.test(vs)

  const poorAppetite = /\b(poor|low|minimal|none|refused|not eating)\b/.test(appetite)
  const lowMood = /\b(low|anxious|agitated|withdrawn|tearful|distressed|upset)\b/.test(mood)
  const heavyMobility = /\b(bedbound|bedridden|minimal movement|unable to stand)\b/.test(mobility)

  let score = 0
  if (attentionVitals) score += 2
  if (poorAppetite) score += 1
  if (lowMood) score += 1
  if (heavyMobility) score += 1
  if (!body.rehabCompleted && /rehab|therapy|stroke/i.test(body.condition)) score += 1
  if (!body.sideTurningCompleted && /pressure|bed|turn/i.test(`${body.condition} ${mobility}`)) score += 1

  if (score >= 2 || attentionVitals || (poorAppetite && lowMood)) return 'Attention'

  return 'Stable'
}

function appetiteMoodSentence(body: FamilyUpdateBody): string {
  const appetite = norm(body.appetite)
  const mood = norm(body.mood)

  const appetitePositive =
    appetite.includes('good') || appetite.includes('fair') || appetite.includes('adequate')
  const moodPositive =
    mood.includes('calm') ||
    mood.includes('cheerful') ||
    mood.includes('content') ||
    mood.includes('peaceful') ||
    mood.includes('good')

  if (appetitePositive && moodPositive) return 'Appetite and mood were good.'

  const bits: string[] = []
  if (appetitePositive) bits.push('eating patterns stayed reassuring today')
  else if (poorAppetite(norm(body.appetite))) bits.push('appetite was lighter today, and staff offered gentle encouragement with meals')
  else bits.push('the team watched food and fluids closely today')

  if (moodPositive) bits.push('mood stayed settled')
  else if (lowMoodPhrase(mood)) bits.push('mood needed a little extra comfort and reassurance today')
  else bits.push('mood varied through the day')

  return `${capitalize(bits[0])}. ${capitalize(bits[1])}.`
}

function poorAppetite(appetiteNorm: string): boolean {
  return /\b(poor|low|minimal|none|refused|not eating)\b/.test(appetiteNorm)
}

function lowMoodPhrase(moodNorm: string): boolean {
  return /\b(low|anxious|agitated|withdrawn|tearful|distressed|upset)\b/.test(moodNorm)
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function careActivitiesSentence(body: FamilyUpdateBody): string | null {
  if (body.rehabCompleted && body.sideTurningCompleted) {
    return 'Rehabilitation exercises were completed and side turning care was provided.'
  }
  const parts: string[] = []
  if (body.rehabCompleted) parts.push('Rehabilitation exercises were completed.')
  if (body.sideTurningCompleted) parts.push('Side turning care was provided.')
  if (parts.length === 0) return null
  return parts.join(' ')
}

function openingSentence(name: string, status: FamilyUpdateStatusLevel): string {
  if (status === 'Stable') return `${name} remained stable today.`
  if (status === 'Attention')
    return `${name} was comfortable overall, though the team watched a few areas more closely today.`
  return `${name} needed closer attention from staff today while we focused on safety and comfort.`
}

function recommendedAction(status: FamilyUpdateStatusLevel): string {
  if (status === 'Stable') return 'Continue encouragement and emotional support.'
  if (status === 'Attention')
    return 'Feel free to call the unit for updates, and keep visits calm and reassuring.'
  return 'Please speak with nursing staff about visit timing and any urgent questions.'
}

function finalizeNote(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  return /[.!?]$/.test(t) ? t : `${t}.`
}

/** Plain-language update for relatives — rule templates only */
export function generateFamilyUpdate(body: FamilyUpdateBody): FamilyUpdateResponse {
  const name = body.patientName.trim()
  const status = deriveFamilyUpdateStatus(body)

  const sentences: string[] = []
  sentences.push(openingSentence(name, status))
  sentences.push(appetiteMoodSentence(body))

  const care = careActivitiesSentence(body)
  if (care) sentences.push(care)

  const note = finalizeNote(body.notes ?? '')
  if (note) sentences.push(note)

  return {
    familyUpdate: sentences.join(' '),
    status,
    recommendedFamilyAction: recommendedAction(status),
  }
}
