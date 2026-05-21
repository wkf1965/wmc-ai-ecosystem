/**
 * Patient Timeline Memory System
 *
 * Groups all nursing memory entries by patient identity (room + name),
 * sorts chronologically, detects condition deterioration / improvement trends,
 * and generates a human-readable condition summary per patient.
 *
 * Trend detection uses three orthogonal signals:
 *   1. Risk score trajectory   — rolling average across time windows
 *   2. Category escalation     — new high-severity categories emerging in recent entries
 *   3. Recurring flags         — same risk factor appearing repeatedly (persistence)
 *
 * NOT a regulated medical device — always verify at the bedside.
 */

import { runNursingRiskScoring } from './nursingRiskScoring.js'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Score weight for each nursing risk level (for trend arithmetic). */
const RISK_LEVEL_WEIGHT = {
  critical: 4,
  high: 3,
  moderate: 2,
  warning: 2,
  low: 1,
  minimal: 0,
}

/** Categories whose first appearance counts as a significant escalation signal. */
const HIGH_SEVERITY_CATEGORIES = new Set([
  'Emergency',
  'Fall Risk',
  'Aggressive Behavior',
  'Confusion / Cognitive Risk',
  'Fever / Infection Risk',
])

/** Risk factor ids that are structurally "acute" — single occurrence is meaningful. */
const ACUTE_FACTOR_IDS = new Set([
  'fall_bleeding',
  'aggressive_behavior',
  'confusion',
  'fever',
])

// ─── Patient Identity Key ─────────────────────────────────────────────────────

/**
 * Derive a stable string key from a memory entry for patient grouping.
 * Priority: patientId → room:name composite → room alone.
 * @param {object} entry
 * @returns {string}
 */
export function patientKey(entry) {
  const pid = String(entry.patientId || '').trim()
  if (pid && pid !== 'null' && pid !== 'undefined') return pid

  const room = String(entry.room || '').trim().toUpperCase()
  const name = String(entry.patientName || '').trim()

  if (room && name && name !== 'Unknown') return `room:${room}:${name.toLowerCase()}`
  if (room) return `room:${room}`
  return '__unknown__'
}

/**
 * Best display label for a patient group: name → Room X → Unknown.
 * @param {object[]} entries — already sorted oldest-first for this patient
 * @returns {{ name: string, room: string|null }}
 */
function resolvePatientDisplay(entries) {
  let name = 'Unknown'
  let room = null

  for (const e of entries) {
    const n = String(e.patientName || '').trim()
    if (n && n !== 'Unknown' && name === 'Unknown') name = n
    const r = String(e.room || '').trim()
    if (r && !room) room = r
    if (name !== 'Unknown' && room) break
  }

  return { name, room }
}

// ─── Entry Normalisation ──────────────────────────────────────────────────────

/**
 * Enrich a raw memory entry with a resolved risk score and detected factor ids.
 * Uses stored nursingRiskScore if available; otherwise runs the scoring engine.
 * @param {object} entry
 * @returns {object}
 */
function enrichEntry(entry) {
  let score = entry.nursingRiskScore != null ? Number(entry.nursingRiskScore) : null
  let level = entry.nursingRiskLevel ? String(entry.nursingRiskLevel).toLowerCase() : null
  let factorIds = Array.isArray(entry.nursingRiskDetected)
    ? entry.nursingRiskDetected.map((l) => labelToFactorId(l))
    : []

  if (score == null || factorIds.length === 0) {
    const text = String(entry.originalMessage || entry.symptoms || '')
    if (text.trim()) {
      const result = runNursingRiskScoring(text)
      if (score == null) {
        score = result.score
        level = result.level
      }
      if (factorIds.length === 0) {
        factorIds = result.detectedFactors.map((f) => f.id)
      }
    }
  }

  const cats = Array.isArray(entry.dashboardCategories) ? entry.dashboardCategories : []

  return {
    ...entry,
    _score: score ?? 0,
    _level: level ?? 'low',
    _factorIds: factorIds,
    _categories: cats,
    _tsMs: parseTimestampMs(entry.timestamp),
  }
}

/** Map factor label back to id (best-effort). */
function labelToFactorId(label) {
  const l = String(label || '').toLowerCase()
  if (l.includes('fall') || l.includes('bleed')) return 'fall_bleeding'
  if (l.includes('mobil') || l.includes('weakness')) return 'weak_mobility'
  if (l.includes('appetite') || l.includes('nutrition')) return 'poor_appetite'
  if (l.includes('fever') || l.includes('infection')) return 'fever'
  if (l.includes('confus') || l.includes('cognitive')) return 'confusion'
  if (l.includes('aggress') || l.includes('behavior')) return 'aggressive_behavior'
  if (l.includes('sleep')) return 'sleeping_only'
  return l.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

/** Parse any timestamp string/number into epoch ms. */
function parseTimestampMs(ts) {
  if (!ts) return 0
  if (typeof ts === 'number') return ts
  const d = new Date(ts)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   key: string,
 *   name: string,
 *   room: string|null,
 *   entries: object[],       — enriched, sorted oldest→newest
 *   entryCount: number,
 *   firstSeen: string,
 *   lastSeen: string,
 * }} PatientGroup
 */

/**
 * Group raw memory entries by patient, enrich each entry, sort oldest→newest.
 * @param {object[]} rawEntries
 * @returns {PatientGroup[]}
 */
export function groupEntriesByPatient(rawEntries) {
  /** @type {Map<string, object[]>} */
  const byKey = new Map()

  for (const e of rawEntries) {
    const k = patientKey(e)
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(enrichEntry(e))
  }

  const groups = []

  for (const [key, entries] of byKey.entries()) {
    entries.sort((a, b) => a._tsMs - b._tsMs)

    const { name, room } = resolvePatientDisplay(entries)

    groups.push({
      key,
      name,
      room,
      entries,
      entryCount: entries.length,
      firstSeen: entries[0]?.timestamp || '',
      lastSeen: entries[entries.length - 1]?.timestamp || '',
    })
  }

  return groups
}

// ─── Trend Detection ──────────────────────────────────────────────────────────

/**
 * @typedef {'deteriorating'|'improving'|'stable'|'critical_ongoing'|'unknown'} TrendLabel
 */

/**
 * @typedef {{
 *   trend: TrendLabel,
 *   trendEmoji: string,
 *   trendSummary: string,
 *   scoreEarly: number|null,
 *   scoreRecent: number|null,
 *   scoreDelta: number|null,
 *   persistentFactors: string[],     — factor ids seen in ≥2 entries
 *   acuteNewFactors: string[],       — acute factor ids that appeared for the first time in the last entry
 *   escalationCategories: string[],  — high-severity categories in most-recent half but not first half
 * }} TrendResult
 */

const TREND_EMOJI = {
  deteriorating: '📉',
  improving: '📈',
  stable: '➡️',
  critical_ongoing: '🔴',
  unknown: '❓',
}

const TREND_SUMMARY = {
  deteriorating: 'Condition deteriorating.',
  improving: 'Condition improving.',
  stable: 'Condition stable.',
  critical_ongoing: 'Critical condition — ongoing.',
  unknown: 'Insufficient data to determine trend.',
}

/**
 * Detect deterioration trend for a single patient group.
 * @param {PatientGroup} group
 * @returns {TrendResult}
 */
export function detectTrend(group) {
  const entries = group.entries
  const n = entries.length

  if (n === 0) {
    return { trend: 'unknown', trendEmoji: '❓', trendSummary: TREND_SUMMARY.unknown, scoreEarly: null, scoreRecent: null, scoreDelta: null, persistentFactors: [], acuteNewFactors: [], escalationCategories: [] }
  }

  // ── 1. Score trajectory ─────────────────────────────────────────────────────
  const scores = entries.map((e) => e._score)
  const half = Math.max(1, Math.floor(n / 2))

  const earlyScores = scores.slice(0, half)
  const recentScores = scores.slice(n - half)

  const avg = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length
  const scoreEarly = Math.round(avg(earlyScores))
  const scoreRecent = Math.round(avg(recentScores))
  const scoreDelta = scoreRecent - scoreEarly

  // ── 2. Factor persistence and emergence ────────────────────────────────────
  const factorCounts = new Map()
  for (const e of entries) {
    for (const fid of e._factorIds) {
      factorCounts.set(fid, (factorCounts.get(fid) || 0) + 1)
    }
  }
  const persistentFactors = [...factorCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([id]) => id)

  // Acute factors in last entry that weren't in first half
  const earlyFactorSet = new Set(entries.slice(0, half).flatMap((e) => e._factorIds))
  const lastEntryFactors = entries[n - 1]?._factorIds || []
  const acuteNewFactors = lastEntryFactors.filter(
    (id) => ACUTE_FACTOR_IDS.has(id) && !earlyFactorSet.has(id),
  )

  // ── 3. Category escalation ─────────────────────────────────────────────────
  const earlyCats = new Set(entries.slice(0, half).flatMap((e) => e._categories))
  const recentCats = new Set(entries.slice(n - half).flatMap((e) => e._categories))
  const escalationCategories = [...recentCats].filter(
    (c) => HIGH_SEVERITY_CATEGORIES.has(c) && !earlyCats.has(c),
  )

  // ── 4. Determine overall trend ─────────────────────────────────────────────
  const recentMax = Math.max(...recentScores, 0)
  const hasCriticalOngoing = recentMax >= 81 && scoreEarly >= 70

  let trend
  if (hasCriticalOngoing) {
    trend = 'critical_ongoing'
  } else if (scoreDelta >= 15 || acuteNewFactors.length > 0 || escalationCategories.length > 0) {
    trend = 'deteriorating'
  } else if (scoreDelta <= -15 && acuteNewFactors.length === 0 && escalationCategories.length === 0) {
    trend = 'improving'
  } else {
    trend = 'stable'
  }

  return {
    trend,
    trendEmoji: TREND_EMOJI[trend],
    trendSummary: TREND_SUMMARY[trend],
    scoreEarly,
    scoreRecent,
    scoreDelta,
    persistentFactors,
    acuteNewFactors,
    escalationCategories,
  }
}

// ─── Condition Summary ────────────────────────────────────────────────────────

/**
 * @typedef {{ bullets: string[], statusLine: string, trend: TrendResult }} PatientConditionSummary
 */

/** Human-readable phrases for each factor id (used in bullets). */
const FACTOR_BULLET_PHRASES = {
  fall_bleeding: {
    single: 'Fall / bleeding risk noted',
    recent: 'Recent fall detected',
    persistent: 'Repeated falls / bleeding events',
    worsening: 'Fall risk escalating',
  },
  weak_mobility: {
    single: 'Mobility weakness noted',
    recent: 'Mobility weakness present',
    persistent: 'Mobility weakness persisting',
    worsening: 'Increasing mobility weakness',
  },
  poor_appetite: {
    single: 'Poor appetite noted',
    recent: 'Poor appetite reported',
    persistent: 'Appetite consistently poor',
    worsening: 'Appetite worsening',
  },
  fever: {
    single: 'Fever recorded',
    recent: 'Fever still present',
    persistent: 'Fever persisting across multiple reports',
    worsening: 'Fever not resolving',
  },
  confusion: {
    single: 'Confusion / disorientation noted',
    recent: 'Confusion / cognitive change present',
    persistent: 'Confusion persisting',
    worsening: 'Cognitive state worsening',
  },
  aggressive_behavior: {
    single: 'Aggressive / agitated behavior reported',
    recent: 'Aggressive behavior noted recently',
    persistent: 'Recurring aggressive behavior',
    worsening: 'Behavioral escalation observed',
  },
  sleeping_only: {
    single: 'Excessive sleeping / drowsiness noted',
    recent: 'Excessive sleeping reported',
    persistent: 'Hypersomnia persisting',
    worsening: 'Increasing somnolence',
  },
}

function factorPhrase(factorId, context) {
  const map = FACTOR_BULLET_PHRASES[factorId]
  if (!map) {
    return context === 'worsening'
      ? `${factorId.replace(/_/g, ' ')} worsening`
      : `${factorId.replace(/_/g, ' ')} noted`
  }
  return map[context] || map.single
}

/**
 * Derive bullet-point observations for a patient.
 * Each bullet is contextualised: worsening / persistent / single occurrence / recently resolved.
 * @param {PatientGroup} group
 * @param {TrendResult} trend
 * @returns {string[]}
 */
export function deriveConditionBullets(group, trend) {
  const { entries } = group
  const n = entries.length
  const half = Math.max(1, Math.floor(n / 2))
  const isDeteriorating = trend.trend === 'deteriorating' || trend.trend === 'critical_ongoing'

  const seen = new Set()
  const bullets = []

  const addBullet = (b) => {
    if (!seen.has(b)) {
      seen.add(b)
      bullets.push(b)
    }
  }

  // Acute new factors first (most urgent)
  for (const fid of trend.acuteNewFactors) {
    addBullet(factorPhrase(fid, 'recent'))
  }

  // Escalation categories
  for (const cat of trend.escalationCategories) {
    addBullet(`${cat} — new concern this period`)
  }

  // Worsening or persistent factors
  for (const fid of trend.persistentFactors) {
    const context = isDeteriorating ? 'worsening' : 'persistent'
    addBullet(factorPhrase(fid, context))
  }

  // Any factor from most-recent entry not yet covered
  const lastFactors = entries[n - 1]?._factorIds || []
  for (const fid of lastFactors) {
    addBullet(factorPhrase(fid, 'single'))
  }

  // Category-based fallback bullets if still empty
  if (bullets.length === 0) {
    const allCats = [...new Set(entries.flatMap((e) => e._categories))]
    for (const cat of allCats) {
      addBullet(cat)
    }
  }

  // Final fallback
  if (bullets.length === 0) {
    addBullet('Nursing notes recorded — no specific risk flags matched')
  }

  return bullets
}

/**
 * Generate full condition summary for a patient group.
 * @param {PatientGroup} group
 * @returns {PatientConditionSummary}
 */
export function generatePatientConditionSummary(group) {
  const trend = detectTrend(group)
  const bullets = deriveConditionBullets(group, trend)
  return { bullets, statusLine: trend.trendSummary, trend }
}

// ─── Full Timeline Report ─────────────────────────────────────────────────────

/**
 * @typedef {{
 *   key: string,
 *   name: string,
 *   room: string|null,
 *   summary: PatientConditionSummary,
 *   entryCount: number,
 *   firstSeen: string,
 *   lastSeen: string,
 * }} PatientTimeline
 */

/**
 * Run the complete timeline pipeline over a set of raw memory entries.
 *
 * @param {object[]} rawEntries — all nursing memory entries (any date range)
 * @param {object} [opts]
 * @param {string} [opts.filterRoom]   — restrict to a specific room
 * @param {string} [opts.filterName]   — restrict to patients whose name matches (case-insensitive)
 * @param {number} [opts.maxDays]      — only include entries from the last N days (default: all)
 * @returns {PatientTimeline[]}
 */
export function buildPatientTimelines(rawEntries, opts = {}) {
  let entries = Array.isArray(rawEntries) ? [...rawEntries] : []

  // Date filter
  if (opts.maxDays != null && opts.maxDays > 0) {
    const cutoff = Date.now() - opts.maxDays * 24 * 3600 * 1000
    entries = entries.filter((e) => parseTimestampMs(e.timestamp) >= cutoff)
  }

  const groups = groupEntriesByPatient(entries)

  // Room / name filter
  let filtered = groups
  if (opts.filterRoom) {
    const r = String(opts.filterRoom).trim().toUpperCase()
    filtered = filtered.filter((g) => String(g.room || '').trim().toUpperCase() === r)
  }
  if (opts.filterName) {
    const n = opts.filterName.toLowerCase()
    filtered = filtered.filter((g) => g.name.toLowerCase().includes(n))
  }

  const timelines = filtered.map((group) => ({
    key: group.key,
    name: group.name,
    room: group.room,
    summary: generatePatientConditionSummary(group),
    entryCount: group.entryCount,
    firstSeen: group.firstSeen,
    lastSeen: group.lastSeen,
  }))

  // Sort: deteriorating / critical first, then by most-recent activity
  const TREND_SORT_ORDER = { critical_ongoing: 0, deteriorating: 1, stable: 2, improving: 3, unknown: 4 }
  timelines.sort((a, b) => {
    const ta = TREND_SORT_ORDER[a.summary.trend.trend] ?? 5
    const tb = TREND_SORT_ORDER[b.summary.trend.trend] ?? 5
    if (ta !== tb) return ta - tb
    return b.lastSeen.localeCompare(a.lastSeen)
  })

  return timelines
}

// ─── Telegram Report Formatter ────────────────────────────────────────────────

/**
 * Format a single patient timeline block for Telegram.
 *
 * Example:
 *   Ali (Room 2) 📉
 *   - Appetite worsening
 *   - Increasing mobility weakness
 *   - Recent fall detected
 *
 *   Status: Condition deteriorating.
 *
 * @param {PatientTimeline} timeline
 * @returns {string}
 */
export function formatPatientTimelineBlock(timeline) {
  const { name, room, summary, entryCount } = timeline
  const { bullets, statusLine, trend } = summary
  const roomPart = room ? ` (Room ${room})` : ''
  const lines = []

  lines.push(`${name}${roomPart} ${trend.trendEmoji}`)
  for (const b of bullets) {
    lines.push(`- ${b}`)
  }
  lines.push('')
  lines.push(`Status: ${statusLine}`)
  if (trend.scoreRecent != null) {
    lines.push(`Risk Score: ${trend.scoreRecent}`)
  }
  if (entryCount > 0) {
    lines.push(`Records: ${entryCount} nursing note${entryCount !== 1 ? 's' : ''}`)
  }

  return lines.join('\n')
}

/**
 * Format the complete patient timeline report for Telegram.
 *
 * @param {PatientTimeline[]} timelines
 * @param {object} [opts]
 * @param {Date}   [opts.now]
 * @param {number} [opts.maxDays]
 * @returns {string}
 */
export function formatTimelineReport(timelines, opts = {}) {
  const now = opts.now || new Date()
  const dateStr = now.toLocaleDateString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const lines = []
  lines.push('🧠 Patient Timeline Memory')
  lines.push(`Generated: ${dateStr}`)
  if (opts.maxDays) lines.push(`Window: Last ${opts.maxDays} day${opts.maxDays !== 1 ? 's' : ''}`)
  lines.push(`Patients tracked: ${timelines.length}`)
  lines.push('')

  if (timelines.length === 0) {
    lines.push('No patient records found.')
    return lines.join('\n')
  }

  for (const tl of timelines) {
    lines.push(formatPatientTimelineBlock(tl))
    lines.push('')
    lines.push('─'.repeat(28))
    lines.push('')
  }

  // Deterioration alert section
  const deteriorating = timelines.filter(
    (t) => t.summary.trend.trend === 'deteriorating' || t.summary.trend.trend === 'critical_ongoing',
  )
  if (deteriorating.length > 0) {
    lines.push('⚠️ Attention Required:')
    for (const t of deteriorating) {
      const room = t.room ? `Room ${t.room} – ` : ''
      lines.push(`- ${room}${t.name}: ${t.summary.statusLine}`)
    }
  }

  return lines.join('\n').trimEnd()
}

// ─── Pipeline Entry Point ─────────────────────────────────────────────────────

/**
 * Full timeline pipeline: load entries → build timelines → format report.
 *
 * @param {object[]} rawEntries
 * @param {object} [opts]
 * @param {string} [opts.filterRoom]
 * @param {string} [opts.filterName]
 * @param {number} [opts.maxDays]
 * @param {Date}   [opts.now]
 * @returns {{ report: string, timelines: PatientTimeline[], total: number }}
 */
export function runTimelinePipeline(rawEntries, opts = {}) {
  const timelines = buildPatientTimelines(rawEntries, opts)
  const report = formatTimelineReport(timelines, { now: opts.now, maxDays: opts.maxDays })
  return { report, timelines, total: timelines.length }
}
