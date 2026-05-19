/**
 * Dynamic Google Sheet tab routing for Telegram AI nursing rows (server-side).
 * Always includes nursing_notes per product rules.
 */

/** @type {ReadonlySet<string>} */
export const TELEGRAM_ROUTE_SHEETS = new Set([
  'nursing_notes',
  'risk_alerts',
  'ai_risks',
  'rehab_tracking',
  'shift_handover',
  'family_updates',
  'doctor_review',
  'fall_risk',
  'medication',
  'medication_notes',
  'nutrition',
  'infection',
  'ot_report',
  'turning_schedule',
])

/**
 * @param {object} memoryRecord — telegram nursing memory row
 * @returns {string[]} deduped tab names (subset of TELEGRAM_ROUTE_SHEETS), always includes nursing_notes
 */
export function routeTelegramNursingSheetTabs(memoryRecord) {
  const sheets = new Set()
  const rawText = `${memoryRecord.originalMessage || ''} ${memoryRecord.categories || ''}`
  const text = rawText.toLowerCase()
  const loop = String(memoryRecord.primaryLoop || '').toLowerCase()
  const riskLevel = String(memoryRecord.riskLevel || '')
  const score = Number(memoryRecord.riskScore)
  const scoreOk = Number.isFinite(score)

  // Nutrition / poor appetite / no appetite → nutrition
  if (
    /nutrition|poor appetite|no appetite|refused lunch|refused meal|skipped meal|reduced intake|minimal intake|low intake|npo\b|food refusal/.test(
      text,
    )
  ) {
    sheets.add('nutrition')
  }

  // Fall risk / fall / weak mobility → fall_risk
  if (/fall risk|\bfell\b|\bfall\b|weak mobility|unsteady|near fall|slipped|tripped|bathroom fall/.test(text)) {
    sheets.add('fall_risk')
  }

  // Rehab / walking / exercise / mobility progress → rehab_tracking
  if (
    /rehabilitation|\brehab\b|\bwalking\b|ambulation|\bexercise\b|mobility progress|\bgait\b|\bpt\b|\bot\b|therapy session/.test(
      text,
    )
  ) {
    sheets.add('rehab_tracking')
  }

  // Fever / infection / wound → infection
  if (/fever|\binfection\b|sepsis|\buti\b|wound redness|purulent|isolat|\bcough\b productive/.test(text)) {
    sheets.add('infection')
  }

  // Medication / missed medicine / drug → medication + medication_notes
  if (/medication|\bmar\b|missed medicine|missed med|\bdrug\b|drug interaction|\bpill\b|\bdose\b|held med|refused med/.test(text)) {
    sheets.add('medication')
    sheets.add('medication_notes')
  }

  // Doctor review / unstable / urgent → doctor_review
  if (/doctor review|\bmd\b notified|physician notified|\bunstable\b|\burgent\b|rapid response|provider review/.test(text)) {
    sheets.add('doctor_review')
  }

  // Family update / daughter / son / family informed → family_updates
  if (/family update|\bdaughter\b|\bson\b|family informed|spoke with family|\bpoa\b|next of kin|caregiver called/.test(text)) {
    sheets.add('family_updates')
  }

  // Handover / shifts → shift_handover
  if (/handover|shift report|night shift|morning shift|evening shift|change of shift|end of shift|start of shift/.test(text)) {
    sheets.add('shift_handover')
  }

  /** Parser loop → sheet tab */
  const loopTab = {
    nutrition: 'nutrition',
    fall_risk: 'fall_risk',
    rehabilitation: 'rehab_tracking',
    infection: 'infection',
    medication: 'medication',
    doctor_review: 'doctor_review',
    hydration: 'nutrition',
    mental_health: null,
  }
  const fromLoop = loopTab[loop]
  if (fromLoop) sheets.add(fromLoop)
  if (fromLoop === 'medication') sheets.add('medication_notes')

  // OT / occupational therapy → ot_report
  if (/\bot\b|occupational\s+therapy|ot\s+session|ot\s+eval/i.test(rawText)) {
    sheets.add('ot_report')
  }

  // Turning / repositioning → turning_schedule
  if (
    /\bturn\b|reposition|q2h|q\s*2\s*h|lateral\s+position|every\s+2\s+hours|pressure\s+relief/i.test(text)
  ) {
    sheets.add('turning_schedule')
  }

  // Warning+ → risk_alerts; retain ai_risks for legacy workbooks
  const workflowWarnPlus =
    (scoreOk && score >= 35) ||
    ['Warning', 'High', 'Emergency', 'Critical'].includes(riskLevel) ||
    /\bhigh risk\b|\bwarning\b|\bcritical\b|\bemergency\b/i.test(text)
  if (workflowWarnPlus) sheets.add('risk_alerts')

  const workflowHigh =
    (scoreOk && score >= 55) ||
    ['High', 'Emergency', 'Critical'].includes(riskLevel) ||
    /\bhigh risk\b|\bcritical\b|\bemergency\b/i.test(text)
  if (workflowHigh) sheets.add('ai_risks')

  sheets.add('nursing_notes')

  return [...sheets].filter((name) => TELEGRAM_ROUTE_SHEETS.has(name)).sort()
}
