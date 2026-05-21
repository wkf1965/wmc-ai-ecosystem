/**
 * Advanced Nursing Risk Scoring Engine
 *
 * Detects clinical risk signals from free-text nursing notes (Telegram or manual input)
 * and produces a structured risk score, level, detected factors, and a suggested action.
 *
 * Scoring weights:
 *   Fall / Bleeding      +40
 *   Weak Mobility        +20
 *   Poor Appetite        +15
 *   Fever                +20
 *   Confusion            +30
 *   Aggressive Behavior  +35
 *   Sleeping Only        +5
 *
 * Risk levels:
 *   0–20   → Low
 *   21–50  → Moderate
 *   51–80  → High
 *   81+    → Critical
 *
 * NOT a regulated medical device — always verify clinical findings at the bedside.
 */

// ─── Risk Factor Definitions ──────────────────────────────────────────────────

/** @type {Array<{ id: string, label: string, points: number, patterns: RegExp[] }>} */
export const RISK_FACTORS = [
  {
    id: 'fall_bleeding',
    label: 'Fall / Bleeding Risk',
    points: 40,
    patterns: [
      /\bfell\b/i,
      /\bfall(ing|en)?\b/i,
      /\bslip(ped)?\b/i,
      /\btrip(ped)?\b/i,
      /\bnear[\s-]fall\b/i,
      /\bbleed(ing)?\b/i,
      /\bhaematoma\b/i,
      /\bhematoma\b/i,
      /\bhaemorrhage\b/i,
      /\bhemorrhage\b/i,
      /\bblood\s+loss\b/i,
      /\bwound\s+bleed/i,
      /\bunsteady\b/i,
      /\bsyncope\b/i,
      /\bdizzy\s+and\s+fell\b/i,
      /\binjur(y|ed|ies)\b/i,
    ],
  },
  {
    id: 'weak_mobility',
    label: 'Mobility Weakness',
    points: 20,
    patterns: [
      /\bweak\s+mobility\b/i,
      /\bmobility\s+weakness\b/i,
      /\bweak(ness)?\b/i,
      /\bleg\s+weakness\b/i,
      /\bunable\s+to\s+(walk|stand|ambulate|transfer|bear\s+weight)\b/i,
      /\bcan('t|not)\s+(walk|stand|transfer)\b/i,
      /\bdifficulty\s+(walking|standing|ambulating|transferring)\b/i,
      /\blimited\s+mobility\b/i,
      /\breduc(ed|ing)\s+mobility\b/i,
      /\bbed[\s-]?bound\b/i,
      /\bwheelchair\s+bound\b/i,
      /\blower\s+extremity\s+weakness\b/i,
      /\bwalker\s+dependent\b/i,
      /\bassist\s+(x\s*[12]|of\s+[12])\b/i,
    ],
  },
  {
    id: 'poor_appetite',
    label: 'Nutrition Risk',
    points: 15,
    patterns: [
      /\bpoor\s+appetite\b/i,
      /\brefused\s+(lunch|meal|breakfast|dinner|tray|food|eating)\b/i,
      /\bnot\s+eating\b/i,
      /\bminimal\s+(oral\s+)?intake\b/i,
      /\blow\s+(oral\s+)?intake\b/i,
      /\bskipped\s+(meal|lunch|breakfast|dinner)\b/i,
      /\bnpo\b/i,
      /\b(25|50)%\s+(meal|intake|breakfast|lunch|dinner)\b/i,
      /\bone\s+bite\b/i,
      /\bnausea\b/i,
      /\bvomit(ing|ed)?\b/i,
      /\bno\s+appetite\b/i,
      /\bdeclined\s+(meal|food|tray)\b/i,
      /\bpoor\s+intake\b/i,
      /\bearly\s+satiety\b/i,
    ],
  },
  {
    id: 'fever',
    label: 'Fever / Infection Risk',
    points: 20,
    patterns: [
      /\bfever\b/i,
      /\bfebrile\b/i,
      /\btemp(erature)?\s*(of\s+)?\s*3[89]\b/i,
      /\btemp(erature)?\s*(of\s+)?\s*4[0-9]\b/i,
      /\b3[89]\.\d+\s*°?c\b/i,
      /\b4[0-9]\.\d*\s*°?c\b/i,
      /\bhigh\s+temp(erature)?\b/i,
      /\bpyrexia\b/i,
      /\bchills\b/i,
      /\brigors?\b/i,
      /\bsweating\s+profusely\b/i,
      /\bnight\s+sweats?\b/i,
      /\btemp\s+raised\b/i,
      /\belevated\s+temp(erature)?\b/i,
    ],
  },
  {
    id: 'confusion',
    label: 'Confusion / Cognitive Risk',
    points: 30,
    patterns: [
      /\bconfus(ed|ion)\b/i,
      /\bdisorient(ed|ation)\b/i,
      /\bsundown(ing)?\b/i,
      /\balter(ed|ation)\s+(in\s+)?mental\s+status\b/i,
      /\bams\b/i,
      /\bdeliri(ous|um)\b/i,
      /\bcognitive\s+(decline|impairment|change)\b/i,
      /\bnot\s+oriented\b/i,
      /\bdoes\s+not\s+recogni[sz]e\b/i,
      /\bdisorganized\s+thinking\b/i,
      /\bhallucinat(ing|ion|ed)\b/i,
      /\bdisoriented\s+to\s+(time|place|person)\b/i,
      /\bmentally\s+confused\b/i,
      /\bword[\s-]finding\s+difficulty\b/i,
    ],
  },
  {
    id: 'aggressive_behavior',
    label: 'Aggressive Behavior',
    points: 35,
    patterns: [
      /\baggress(ive|ion)\b/i,
      /\bcombative\b/i,
      /\bviolent\b/i,
      /\bhitting\b/i,
      /\bstrik(ing|es?)\b/i,
      /\bthrow(ing)?\s+(objects?|things?)\b/i,
      /\bscream(ing|ed)?\b/i,
      /\byelling\b/i,
      /\bshouting\b/i,
      /\bthreat(ening|ens?)\b/i,
      /\bphysically\s+resist(ing|ant)?\b/i,
      /\bkick(ing|ed)?\b/i,
      /\bpinch(ing|ed)?\b/i,
      /\bbiting\b/i,
      /\bscratch(ing|ed)?\b/i,
      /\brefusing\s+(care|treatment)\s+(aggressively|violently|forcefully)\b/i,
      /\bpush(ing|ed)\s+(away|staff|nurse)\b/i,
    ],
  },
  {
    id: 'sleeping_only',
    label: 'Excessive Sleeping',
    points: 5,
    patterns: [
      /\bsleeping\s+only\b/i,
      /\bsleeping\s+all\s+(day|the\s+time|morning|afternoon)\b/i,
      /\bonly\s+sleeping\b/i,
      /\bexcess(ive)?\s+sleep(ing)?\b/i,
      /\bunresponsive\s+but\s+sleeping\b/i,
      /\bdifficult\s+to\s+arouse\b/i,
      /\bextremely\s+drowsy\b/i,
      /\bhypersomnia\b/i,
      /\bsleeping\s+more\s+than\s+usual\b/i,
      /\bcannot\s+wake\b/i,
      /\bhard\s+to\s+(wake|rouse|arouse)\b/i,
      /\bslept\s+through\s+(meal|breakfast|lunch|dinner|shift)\b/i,
    ],
  },
]

// ─── Risk Level Thresholds ─────────────────────────────────────────────────────

/**
 * @typedef {{ level: 'low'|'moderate'|'high'|'critical', label: string, emoji: string, action: string }} RiskLevel
 */

/** @type {RiskLevel[]} ordered highest threshold first for fast lookup */
const RISK_LEVELS = [
  {
    level: 'critical',
    label: 'CRITICAL RISK ALERT',
    emoji: '🔴',
    minScore: 81,
    action: 'Immediate intervention required. Notify doctor and supervisor NOW.',
  },
  {
    level: 'high',
    label: 'HIGH RISK ALERT',
    emoji: '🚨',
    minScore: 51,
    action: 'Monitor closely and notify supervisor.',
  },
  {
    level: 'moderate',
    label: 'MODERATE RISK',
    emoji: '⚠️',
    minScore: 21,
    action: 'Increase monitoring frequency and document observations.',
  },
  {
    level: 'low',
    label: 'LOW RISK',
    emoji: '✅',
    minScore: 0,
    action: 'Routine monitoring. No immediate action required.',
  },
]

// ─── Core Engine ───────────────────────────────────────────────────────────────

/**
 * @param {string} text — raw message / nursing note text
 * @returns {{ id: string, label: string, points: number }[]}
 */
export function detectRiskFactors(text) {
  const body = String(text || '')
  const detected = []
  for (const factor of RISK_FACTORS) {
    const hit = factor.patterns.some((re) => re.test(body))
    if (hit) {
      detected.push({ id: factor.id, label: factor.label, points: factor.points })
    }
  }
  return detected
}

/**
 * @param {{ points: number }[]} detectedFactors
 * @returns {number}
 */
export function computeRiskScore(detectedFactors) {
  return detectedFactors.reduce((sum, f) => sum + f.points, 0)
}

/**
 * @param {number} score
 * @returns {RiskLevel}
 */
export function getRiskLevel(score) {
  for (const lvl of RISK_LEVELS) {
    if (score >= lvl.minScore) return lvl
  }
  return RISK_LEVELS[RISK_LEVELS.length - 1]
}

// ─── Full Scoring Result ───────────────────────────────────────────────────────

/**
 * @typedef {{
 *   score: number,
 *   level: string,
 *   levelLabel: string,
 *   emoji: string,
 *   suggestedAction: string,
 *   detectedFactors: { id: string, label: string, points: number }[],
 *   room: string|null,
 *   patientName: string|null,
 * }} NursingRiskResult
 */

/**
 * Run full risk scoring on a message.
 *
 * @param {string} text — nursing note / Telegram message body
 * @param {string|null} [room]
 * @param {string|null} [patientName]
 * @returns {NursingRiskResult}
 */
export function runNursingRiskScoring(text, room = null, patientName = null) {
  const detectedFactors = detectRiskFactors(text)
  const score = computeRiskScore(detectedFactors)
  const { level, label: levelLabel, emoji, action: suggestedAction } = getRiskLevel(score)

  return {
    score,
    level,
    levelLabel,
    emoji,
    suggestedAction,
    detectedFactors,
    room: room ? String(room).trim() : null,
    patientName: patientName ? String(patientName).trim() : null,
  }
}

// ─── Telegram Alert Formatter ──────────────────────────────────────────────────

/**
 * Format the risk scoring result into a Telegram-ready alert message.
 *
 * Example output:
 *   🚨 HIGH RISK ALERT
 *   Room 2
 *   Patient: Ali
 *   Risk Score: 75
 *   Detected:
 *   - Fall Risk
 *   - Nutrition Risk
 *   - Mobility Weakness
 *
 *   Suggested Action:
 *   Monitor closely and notify supervisor.
 *
 * @param {NursingRiskResult} result
 * @returns {string}
 */
export function formatTelegramRiskAlert(result) {
  const { score, emoji, levelLabel, detectedFactors, suggestedAction, room, patientName } = result

  const lines = []

  lines.push(`${emoji} ${levelLabel}`)

  if (room) lines.push(`Room ${room}`)
  if (patientName) lines.push(`Patient: ${patientName}`)

  lines.push(`Risk Score: ${score}`)

  if (detectedFactors.length > 0) {
    lines.push('Detected:')
    for (const f of detectedFactors) {
      lines.push(`- ${f.label}`)
    }
  } else {
    lines.push('Detected: No specific risk factors matched.')
  }

  lines.push('')
  lines.push('Suggested Action:')
  lines.push(suggestedAction)

  return lines.join('\n')
}

/**
 * Convenience: run scoring from text + context, return formatted Telegram alert string.
 *
 * @param {string} text
 * @param {string|null} [room]
 * @param {string|null} [patientName]
 * @returns {{ result: NursingRiskResult, message: string }}
 */
export function buildTelegramRiskAlertFromText(text, room = null, patientName = null) {
  const result = runNursingRiskScoring(text, room, patientName)
  const message = formatTelegramRiskAlert(result)
  return { result, message }
}
