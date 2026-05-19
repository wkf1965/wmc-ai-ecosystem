import type { HandoverGenerateResponse } from './handover.types.js'
import type { HandoverGenerateBody, HandoverRecordSnapshot } from './handover.validation.js'

function parseBp(s: string): { sys?: number; dia?: number } {
  const m = s.trim().match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) return {}
  return { sys: Number(m[1]), dia: Number(m[2]) }
}

function woundSoundsConcerning(woundCondition: string): boolean {
  const t = woundCondition.toLowerCase()
  return (
    /\b(redness|red|pus|weeping|necrot|cavity|odor|malodor|infection|slough|dehiscence)\b/i.test(
      t,
    ) && !/\bno\s+(redness|signs of infection|drainage)\b/i.test(t)
  )
}

/** Mirrors single-patient risk rules used for `/ai/summary`. */
export function classifyHandoverPatientRisk(record: HandoverRecordSnapshot): 'low' | 'moderate' | 'high' {
  const { sys, dia } = parseBp(record.bloodPressure)
  let score = 0

  if (record.painScore >= 7) score += 3
  else if (record.painScore >= 4) score += 1

  if (record.oxygen < 92) score += 3
  else if (record.oxygen < 95) score += 1

  if (record.temperature >= 38.5 || record.temperature <= 35.5) score += 3
  else if (record.temperature >= 38.0) score += 1

  if (record.pulse >= 120 || record.pulse <= 50) score += 2
  else if (record.pulse >= 110 || record.pulse <= 55) score += 1

  if (sys !== undefined && dia !== undefined) {
    if (sys >= 180 || dia >= 110 || sys < 90) score += 3
    else if (sys >= 160 || dia >= 100 || sys < 95) score += 2
    else if (sys >= 140 || dia >= 90) score += 1
  }

  if (woundSoundsConcerning(record.woundCondition)) score += 2

  const moodBad = /\b(agitat|distressed?|distress|confus|combative|anxious|restless)/i.test(
    record.mood.trim(),
  )
  if (moodBad) score += 1

  if (score >= 4) return 'high'
  if (score >= 2) return 'moderate'
  return 'low'
}

function painWord(score: number): string {
  if (score <= 3) return 'mild'
  if (score <= 6) return 'moderate'
  return 'severe'
}

function mobilityPhrase(mobility: string): string {
  const lower = mobility.trim().toLowerCase()
  const compact = mobility.replace(/\s+/g, '').toLowerCase()
  if (/\bbe?d\s*bound|bedbound\b/.test(compact) || /\bbedbound\b/i.test(lower))
    return 'bedbound positioning'
  if (/assist|help|walker|wheelchair/i.test(mobility))
    return 'assisted mobility'
  if (/independent|mobil(?:e|ing)\s*self\b/i.test(mobility))
    return 'self-mobilising'
  return mobility.trim().toLowerCase().replace(/^[a-z]/, (c) => c.toUpperCase())
}

function moodConcerning(mood: string): boolean {
  return /\b(agitat|distressed?|distress|confus|combative|anxious|restless)/i.test(mood.trim())
}

/** Join factors; last two use ", and " when there are multiple items */
function formatProblemList(problems: string[]): string {
  const uniq = [...new Set(problems)]
  const list = uniq.slice(0, 6)
  if (list.length <= 1) return list[0] ?? ''
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`
}

function isSideTurningPending(sideTurning: string): boolean {
  return /\bpending\b|not\s+(done|yet)|await|delayed|incomplete|\btodo\b|needs\b/i.test(
    sideTurning.trim(),
  )
}

/** Rule-based narrative + derived tasks (placeholder for LLM). */
export function generateShiftHandover(params: HandoverGenerateBody): HandoverGenerateResponse {
  const { shift, records } = params
  void params.nurseInCharge

  const withRisk = records.map((r) => ({
    record: r,
    risk: classifyHandoverPatientRisk(r),
  }))

  const highRiskPatients = [...new Set(withRisk.filter((x) => x.risk === 'high').map((x) => x.record.patientName))]

  const needsAttentionShift = highRiskPatients.length > 0 || withRisk.some((x) => x.risk === 'moderate')
  const shiftStatus: HandoverGenerateResponse['shiftStatus'] = needsAttentionShift
    ? 'Attention Required'
    : 'Stable'

  const segments: string[] = []
  segments.push(`${shift.trim()} completed.`)

  const lowLines: string[] = []
  const highLines: string[] = []

  for (const { record: rec, risk } of withRisk) {
    const name = rec.patientName.trim()

    if (risk === 'high' || risk === 'moderate') {
      const problems: string[] = []
      const { sys, dia } = parseBp(rec.bloodPressure)
      if (sys !== undefined && dia !== undefined && (sys >= 140 || dia >= 90 || sys >= 160))
        problems.push('elevated blood pressure')
      if (rec.temperature >= 38.5) problems.push('fever')
      else if (rec.temperature >= 38.0) problems.push('pyrexia')
      if (rec.oxygen <= 94) problems.push('low oxygen')
      if (moodConcerning(rec.mood)) {
        if (/\bagitat/i.test(rec.mood.trim())) problems.push('agitation')
        else problems.push('behavioural concern')
      }
      if (!problems.length) problems.push('concerning vital signs')

      let line = `${name} showed ${formatProblemList(problems)}.`
      if (isSideTurningPending(rec.sideTurning))
        line += ` Side turning ${/pending/i.test(rec.sideTurning) ? 'pending' : 'still due'}.`
      if (woundSoundsConcerning(rec.woundCondition))
        line += ` Wound redness observed.`
      highLines.push(line)
    } else {
      lowLines.push(
        `${name} remained stable with ${painWord(rec.painScore)} pain and ${mobilityPhrase(rec.mobility).replace(/^./, (c) => c.toLowerCase())}.`,
      )
    }
  }

  segments.push(lowLines.join(' '))
  if (highLines.length) {
    segments.push(highLines.join(' '))
    segments.push('Close monitoring required.')
  }

  const handoverSummary = segments.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

  const pendingTasks: string[] = []
  for (const r of records) {
    if (isSideTurningPending(r.sideTurning))
      pendingTasks.push(`Complete side turning for ${r.patientName.trim()}`)
  }
  const oxygenWatch = records.some((r) => r.oxygen <= 94)
  const feverWatch = records.some((r) => r.temperature >= 38.0)

  if (oxygenWatch && feverWatch) pendingTasks.push('Monitor oxygen and fever')
  else if (oxygenWatch) pendingTasks.push('Monitor oxygen saturation')
  else if (feverWatch) pendingTasks.push('Monitor fever and vital signs closely')

  return {
    highRiskPatients,
    pendingTasks,
    shiftStatus,
    handoverSummary,
  }
}
