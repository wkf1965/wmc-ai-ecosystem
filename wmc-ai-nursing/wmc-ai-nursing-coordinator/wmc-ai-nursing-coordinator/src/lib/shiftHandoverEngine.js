/**
 * AI Shift Handover Engine
 *
 * Reads today's nursing activity from the local memory store (Telegram entries)
 * and optional Google Sheet nursing notes, then generates a structured shift
 * handover report grouped by room / patient.
 *
 * Shift detection (UTC+8 / MYT):
 *   Morning   06:00–13:59  ☀️
 *   Evening   14:00–21:59  🌤️
 *   Night     22:00–05:59  🌙
 *
 * NOT a regulated medical device — always verify at the bedside.
 */

import { runNursingRiskScoring } from './nursingRiskScoring.js'

// ─── Shift Detection ────────────────────────────────────────────────────────

const SHIFT_TIMEZONE_OFFSET_HOURS = 8 // MYT / UTC+8

/** @typedef {'morning'|'evening'|'night'} ShiftKey */

/**
 * @param {Date} [now]
 * @returns {{ key: ShiftKey, label: string, emoji: string }}
 */
export function detectCurrentShift(now = new Date()) {
  const localHour = (now.getUTCHours() + SHIFT_TIMEZONE_OFFSET_HOURS) % 24
  if (localHour >= 6 && localHour < 14) return { key: 'morning', label: 'Morning Shift Handover', emoji: '☀️' }
  if (localHour >= 14 && localHour < 22) return { key: 'evening', label: 'Evening Shift Handover', emoji: '🌤️' }
  return { key: 'night', label: 'Night Shift Handover', emoji: '🌙' }
}

/**
 * Parse an explicit shift keyword from the command text (e.g. "/handover morning").
 * @param {string} text
 * @returns {{ key: ShiftKey, label: string, emoji: string }|null}
 */
export function parseShiftFromCommandText(text) {
  const t = String(text || '').toLowerCase()
  if (/\bmorning\b/.test(t)) return { key: 'morning', label: 'Morning Shift Handover', emoji: '☀️' }
  if (/\bevening\b|\bafternoon\b/.test(t)) return { key: 'evening', label: 'Evening Shift Handover', emoji: '🌤️' }
  if (/\bnight\b/.test(t)) return { key: 'night', label: 'Night Shift Handover', emoji: '🌙' }
  return null
}

/**
 * Resolve shift from command text or fall back to auto-detection.
 * @param {string} [commandText]
 * @returns {{ key: ShiftKey, label: string, emoji: string }}
 */
export function resolveShift(commandText) {
  return parseShiftFromCommandText(commandText || '') || detectCurrentShift()
}

// ─── Date Helpers ────────────────────────────────────────────────────────────

/** ISO date string in MYT for the given Date (default: now). */
export function todayMYT(now = new Date()) {
  const myt = new Date(now.getTime() + SHIFT_TIMEZONE_OFFSET_HOURS * 3600 * 1000)
  return myt.toISOString().slice(0, 10) // YYYY-MM-DD
}

/** Readable date string for the report header. */
export function formatReportDate(now = new Date()) {
  return now.toLocaleDateString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Entry Normalisation ─────────────────────────────────────────────────────

/**
 * @typedef {{
 *   room: string|null,
 *   patientName: string|null,
 *   symptoms: string,
 *   originalMessage: string,
 *   dashboardCategories: string[],
 *   riskLevel: string|null,
 *   nursingRiskScore: number|null,
 *   nursingRiskLevel: string|null,
 *   nursingRiskDetected: string[],
 *   timestamp: string,
 *   nurseName: string|null,
 *   source: 'memory'|'sheet',
 * }} NormalisedEntry
 */

/**
 * Normalise a telegram-nursing-memory entry into a common shape.
 * @param {object} e — raw memory entry
 * @returns {NormalisedEntry}
 */
function normaliseMemoryEntry(e) {
  return {
    room: e.room ? String(e.room).trim() : null,
    patientName: e.patientName && e.patientName !== 'Unknown' ? String(e.patientName).trim() : null,
    symptoms: String(e.symptoms || ''),
    originalMessage: String(e.originalMessage || ''),
    dashboardCategories: Array.isArray(e.dashboardCategories) ? e.dashboardCategories : [],
    riskLevel: e.riskLevel ? String(e.riskLevel) : null,
    nursingRiskScore: e.nursingRiskScore != null ? Number(e.nursingRiskScore) : null,
    nursingRiskLevel: e.nursingRiskLevel ? String(e.nursingRiskLevel) : null,
    nursingRiskDetected: Array.isArray(e.nursingRiskDetected) ? e.nursingRiskDetected : [],
    timestamp: e.timestamp || '',
    nurseName: e.nurseName ? String(e.nurseName).trim() : null,
    source: 'memory',
  }
}

/**
 * Normalise a Google Sheet nursing_notes row into the common shape.
 * Sheet columns (from Apps Script header):
 *   Time, Room, Patient Name, Category, Risk Level, Risk Score, Suggested Action, Original Message, Source
 * Also handles legacy flat note object (patientId, date, abnormalEvents, nurseRemarks…).
 * @param {object} row
 * @returns {NormalisedEntry}
 */
function normaliseSheetNote(row) {
  const room =
    row.Room || row.room || row.room_number || row.roomNumber || null

  const patientName =
    row['Patient Name'] || row.patient_name || row.patientName || row.patientNameSnapshot || null

  const category = row.Category || row.category || ''
  const dashboardCategories = category
    ? category.split(/[+,;]/).map((s) => s.trim()).filter(Boolean)
    : []

  const originalMessage =
    row['Original Message'] || row.original_message || row.originalMessage ||
    row.abnormalEvents || row.nurseRemarks || ''

  const rawScore = row['Risk Score'] || row.risk_score || row.riskScore || null
  const score = rawScore != null && !isNaN(Number(rawScore)) ? Number(rawScore) : null

  const msgForRisk = originalMessage || String(row.symptoms || '')
  const riskResult = msgForRisk.trim() ? runNursingRiskScoring(msgForRisk, room, patientName) : null

  return {
    room: room ? String(room).trim() : null,
    patientName: patientName && String(patientName).trim() !== 'Unknown' ? String(patientName).trim() : null,
    symptoms: String(row.symptoms || row.Symptoms || originalMessage).slice(0, 300),
    originalMessage: String(originalMessage),
    dashboardCategories,
    riskLevel: row['Risk Level'] || row.risk_level || row.riskLevel || null,
    nursingRiskScore: riskResult?.score ?? score,
    nursingRiskLevel: riskResult?.level ?? null,
    nursingRiskDetected: riskResult?.detectedFactors?.map((f) => f.label) ?? [],
    timestamp: row.Time || row.time || row.timestamp || row.date || row.createdAt || '',
    nurseName: row['Nurse'] || row.nurse || row.author || null,
    source: 'sheet',
  }
}

// ─── Filtering ────────────────────────────────────────────────────────────────

/**
 * Keep only entries whose timestamp falls on today (MYT).
 * @param {NormalisedEntry[]} entries
 * @param {string} [dateStr] — YYYY-MM-DD override (default: todayMYT())
 * @returns {NormalisedEntry[]}
 */
export function filterTodayEntries(entries, dateStr) {
  const target = dateStr || todayMYT()
  return entries.filter((e) => {
    if (!e.timestamp) return false
    // Convert timestamp to MYT date string
    try {
      const ts = new Date(e.timestamp)
      if (isNaN(ts.getTime())) {
        // Might already be a YYYY-MM-DD string
        return String(e.timestamp).slice(0, 10) === target
      }
      const myt = new Date(ts.getTime() + SHIFT_TIMEZONE_OFFSET_HOURS * 3600 * 1000)
      return myt.toISOString().slice(0, 10) === target
    } catch {
      return String(e.timestamp).slice(0, 10) === target
    }
  })
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   roomKey: string,
 *   roomDisplay: string,
 *   patientName: string,
 *   entries: NormalisedEntry[],
 *   maxRiskScore: number|null,
 *   dominantRiskLevel: string|null,
 *   allCategories: string[],
 *   bulletPoints: string[],
 *   isCritical: boolean,
 * }} RoomGroup
 */

const RISK_LEVEL_ORDER = ['critical', 'high', 'moderate', 'low', 'low', 'warning', 'emergency']
const CRITICAL_LEVELS = new Set(['critical', 'high', 'emergency'])

function dominantLevel(levels) {
  const normalized = levels.map((l) => String(l || '').toLowerCase())
  for (const tier of ['critical', 'emergency', 'high', 'warning', 'moderate', 'low']) {
    if (normalized.includes(tier)) return tier
  }
  return null
}

/**
 * Derive human-readable bullet points for a room from its entries.
 * @param {NormalisedEntry[]} entries
 * @returns {string[]}
 */
function deriveBulletPoints(entries) {
  const seen = new Set()
  const bullets = []

  // Priority 1: nursing risk detected factors (from the new scoring engine)
  for (const e of entries) {
    for (const label of e.nursingRiskDetected) {
      if (!seen.has(label)) {
        seen.add(label)
        bullets.push(label)
      }
    }
  }

  // Priority 2: dashboard categories not yet covered
  const CATEGORY_BULLET_MAP = {
    'Fall Risk': 'Fall Risk',
    'Nutrition': 'Poor appetite / nutrition concern',
    'Infection': 'Fever / infection risk',
    'Wound Care': 'Wound care needed',
    'Medication': 'Medication issue flagged',
    'Mobility / Rehabilitation': 'Mobility / rehabilitation concern',
    'Behaviour / Mental Status': 'Confusion / behavioural change',
    'Emergency': 'Emergency condition reported',
    'Family Update': 'Family update pending',
  }
  for (const e of entries) {
    for (const cat of e.dashboardCategories) {
      const bullet = CATEGORY_BULLET_MAP[cat] || cat
      if (!seen.has(bullet)) {
        seen.add(bullet)
        bullets.push(bullet)
      }
    }
  }

  // Priority 3: keyword scan of original messages for any remaining signals
  const KEYWORD_BULLETS = [
    { re: /\bfever\b|\bfebrile\b/i, label: 'Fever reported' },
    { re: /\bfever\s+(improv|reduc|subsid|down)\b|\bafebril/i, label: 'Fever improving' },
    { re: /\bstable\b.*\bvital/i, label: 'Stable vital signs' },
    { re: /\bpain\b/i, label: 'Pain reported' },
    { re: /\brefused\s+(med|medication)\b/i, label: 'Medication refused' },
    { re: /\bnausea\b|\bvomit/i, label: 'Nausea / vomiting' },
    { re: /\bblood\s*(pressure|sugar|glucose)\b/i, label: 'Vital signs monitored' },
    { re: /\bwound\b|\bdressing\b/i, label: 'Wound / dressing reviewed' },
    { re: /\bfamily\b|\bnext\s+of\s+kin\b/i, label: 'Family notified' },
    { re: /\bdischarg/i, label: 'Discharge planned' },
  ]
  const combinedText = entries.map((e) => e.originalMessage).join(' ')
  for (const { re, label } of KEYWORD_BULLETS) {
    if (re.test(combinedText) && !seen.has(label)) {
      seen.add(label)
      bullets.push(label)
    }
  }

  // If nothing was detected, add a generic note
  if (bullets.length === 0) {
    bullets.push('Nursing note recorded — no specific risk flags')
  }

  return bullets
}

/**
 * Group normalised entries by room, compute aggregate risk, and derive bullet points.
 * @param {NormalisedEntry[]} entries
 * @returns {RoomGroup[]}
 */
export function groupEntriesByRoom(entries) {
  /** @type {Map<string, NormalisedEntry[]>} */
  const byRoom = new Map()

  for (const e of entries) {
    const key = e.room ? String(e.room).trim().toUpperCase() : '__UNKNOWN__'
    if (!byRoom.has(key)) byRoom.set(key, [])
    byRoom.get(key).push(e)
  }

  const groups = []

  for (const [key, roomEntries] of byRoom.entries()) {
    // Sort entries newest first
    roomEntries.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))

    // Resolve best patient name: prefer non-null, pick most recent
    const resolvedName =
      roomEntries.find((e) => e.patientName)?.patientName || 'Unknown'

    // Aggregate risk
    const scores = roomEntries.map((e) => e.nursingRiskScore).filter((s) => s != null)
    const maxScore = scores.length > 0 ? Math.max(...scores) : null

    const levels = roomEntries
      .map((e) => e.nursingRiskLevel || e.riskLevel)
      .filter(Boolean)
    const dominant = dominantLevel(levels)

    // Aggregate categories
    const allCats = [...new Set(roomEntries.flatMap((e) => e.dashboardCategories))]

    const bullets = deriveBulletPoints(roomEntries)
    const isCritical = CRITICAL_LEVELS.has(dominant || '') ||
      (maxScore != null && maxScore >= 51)

    const roomDisplay = key === '__UNKNOWN__' ? '—' : String(roomEntries[0]?.room || key)

    groups.push({
      roomKey: key,
      roomDisplay,
      patientName: resolvedName,
      entries: roomEntries,
      maxRiskScore: maxScore,
      dominantRiskLevel: dominant,
      allCategories: allCats,
      bulletPoints: bullets,
      isCritical,
    })
  }

  // Sort: critical first, then by risk score descending, then room number
  groups.sort((a, b) => {
    if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1
    const sa = a.maxRiskScore ?? -1
    const sb = b.maxRiskScore ?? -1
    if (sa !== sb) return sb - sa
    return a.roomDisplay.localeCompare(b.roomDisplay, undefined, { numeric: true })
  })

  return groups
}

// ─── Report Formatter ─────────────────────────────────────────────────────────

/**
 * Format the risk level badge for inline display.
 * @param {RoomGroup} group
 * @returns {string}
 */
function riskBadge(group) {
  const level = group.dominantRiskLevel?.toLowerCase()
  if (level === 'critical' || level === 'emergency') return ' 🔴'
  if (level === 'high') return ' 🚨'
  if (level === 'moderate' || level === 'warning') return ' ⚠️'
  return ''
}

/**
 * Generate the critical summary section from all groups.
 * @param {RoomGroup[]} groups
 * @returns {string}
 */
function formatCriticalSection(groups) {
  const critical = groups.filter((g) => g.isCritical)
  if (critical.length === 0) return ''

  const lines = ['', '⚠️ Requires Close Monitoring:']
  for (const g of critical) {
    const scoreNote = g.maxRiskScore != null ? ` (Score: ${g.maxRiskScore})` : ''
    const levelNote = g.dominantRiskLevel
      ? ` – ${g.dominantRiskLevel.charAt(0).toUpperCase() + g.dominantRiskLevel.slice(1)} Risk`
      : ''
    lines.push(`- Room ${g.roomDisplay} ${g.patientName !== 'Unknown' ? `– ${g.patientName}` : ''}${levelNote}${scoreNote}`)
  }

  return lines.join('\n')
}

/**
 * Build the complete shift handover report text.
 *
 * @param {RoomGroup[]} groups
 * @param {{ key: ShiftKey, label: string, emoji: string }} shift
 * @param {object} [opts]
 * @param {Date} [opts.now]
 * @param {number} [opts.totalEntries]
 * @returns {string}
 */
export function generateHandoverReport(groups, shift, opts = {}) {
  const now = opts.now || new Date()
  const lines = []

  lines.push(`${shift.emoji} ${shift.label}`)
  lines.push(`Date: ${formatReportDate(now)}`)
  if (opts.totalEntries != null) {
    lines.push(`Total notes today: ${opts.totalEntries}`)
  }

  if (groups.length === 0) {
    lines.push('')
    lines.push('No nursing notes recorded today.')
    return lines.join('\n')
  }

  lines.push('')

  for (const group of groups) {
    const patientPart = group.patientName !== 'Unknown' ? ` – ${group.patientName}` : ''
    const badge = riskBadge(group)
    lines.push(`Room ${group.roomDisplay}${patientPart}${badge}`)
    for (const bullet of group.bulletPoints) {
      lines.push(`- ${bullet}`)
    }
    lines.push('')
  }

  const criticalSection = formatCriticalSection(groups)
  if (criticalSection) {
    lines.push(criticalSection)
  }

  return lines.join('\n').trimEnd()
}

// ─── Pipeline Entry Point ─────────────────────────────────────────────────────

/**
 * Full handover pipeline: normalise + filter + group + report.
 *
 * @param {object[]} memoryEntries — raw entries from telegram-nursing-memory.json
 * @param {object[]} [sheetNotes]  — raw rows from Google Sheet nursing_notes tab
 * @param {object} [opts]
 * @param {string} [opts.commandText] — raw command text to extract shift override
 * @param {Date}   [opts.now]
 * @param {string} [opts.dateStr] — YYYY-MM-DD override (default: today MYT)
 * @returns {{ report: string, groups: RoomGroup[], shift: object, totalEntries: number }}
 */
export function runHandoverPipeline(memoryEntries = [], sheetNotes = [], opts = {}) {
  const now = opts.now || new Date()
  const shift = resolveShift(opts.commandText || '')
  const dateStr = opts.dateStr || todayMYT(now)

  // Normalise all sources
  const normMemory = memoryEntries.map(normaliseMemoryEntry)
  const normSheet = sheetNotes.map(normaliseSheetNote)

  // Merge and de-duplicate (memory is source of truth for Telegram entries)
  const all = [...normMemory, ...normSheet]

  // Filter to today only
  const todayEntries = filterTodayEntries(all, dateStr)

  // Group and generate
  const groups = groupEntriesByRoom(todayEntries)
  const report = generateHandoverReport(groups, shift, { now, totalEntries: todayEntries.length })

  return { report, groups, shift, totalEntries: todayEntries.length }
}
