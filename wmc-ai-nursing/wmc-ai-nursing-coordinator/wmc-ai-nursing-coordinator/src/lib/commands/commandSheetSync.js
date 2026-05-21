/**
 * Command Sheet Sync — writes structured command records to Google Sheets.
 *
 * Each command type targets a specific sheet tab via the existing Apps Script webhook.
 * The payload schema is compatible with the existing `saveTelegramNursingNoteToGoogleSheet` route,
 * using the `targets` array to specify which tabs receive the row.
 *
 * PostgreSQL-ready: the dbRow from buildDbRow() can be inserted directly into the
 * command-specific table when a DB adapter is available.
 */

import { getCommandDef } from './commandRegistry.js'

const ALWAYS_INCLUDE_TABS = ['nursing_notes']

/**
 * Map command names to additional sheet tabs they should always write to.
 * The primary sheetTab from the registry is always included.
 */
const COMMAND_EXTRA_TABS = {
  '/admit': ['nursing_notes'],
  '/vitals': ['nursing_notes'],
  '/fall': ['fall_risk', 'risk_alerts', 'nursing_notes'],
  '/turning': ['turning_schedule', 'nursing_notes'],
  '/rehab': ['rehab_tracking', 'nursing_notes'],
  '/med': ['medication', 'medication_notes', 'nursing_notes'],
  '/alert': ['risk_alerts', 'ai_risks', 'nursing_notes'],
}

/**
 * Build the list of sheet tabs for a command.
 * @param {string} commandName
 * @param {object} [data]  collected_data (for dynamic routing based on content)
 * @returns {string[]}
 */
function resolveTargetTabs(commandName, data) {
  const def = getCommandDef(commandName)
  const tabs = new Set(ALWAYS_INCLUDE_TABS)

  if (def?.sheetTab) tabs.add(def.sheetTab)

  const extras = COMMAND_EXTRA_TABS[commandName] ?? []
  for (const t of extras) tabs.add(t)

  // Dynamic: fall with injury → also risk_alerts
  if (commandName === '/fall' && data?.fallType === 'injury') {
    tabs.add('risk_alerts')
  }
  // Dynamic: critical alert → ai_risks
  if (commandName === '/alert' && data?.severity === 'critical') {
    tabs.add('ai_risks')
  }

  return [...tabs].sort()
}

/**
 * Build the flat payload for the Apps Script webhook.
 * @param {string} commandName
 * @param {object} data  collected form data
 * @param {object} meta  { id, timestamp, chatId, nurseName }
 * @returns {object}
 */
function buildSheetPayload(commandName, data, meta) {
  const def = getCommandDef(commandName)
  const targets = resolveTargetTabs(commandName, data)

  // Build a human-readable summary note for nursing_notes tab
  const summaryParts = [commandName]
  if (data.room) summaryParts.push(`Room ${data.room}`)
  if (data.patientName) summaryParts.push(data.patientName)

  const fieldLines = Object.entries(data)
    .filter(([, v]) => v && v !== 'skip')
    .map(([k, v]) => `${k}=${v}`)
  summaryParts.push(`[${fieldLines.join(' ')}]`)

  const originalMessage = summaryParts.join(' ')

  // Risk level mapping
  const riskLevel = commandName === '/alert'
    ? ({ low: 'Low', medium: 'Warning', high: 'High', critical: 'Emergency' }[data.severity] ?? 'Warning')
    : commandName === '/fall'
      ? (data.fallType === 'injury' ? 'High' : 'Warning')
      : 'Low'

  return {
    source: 'telegram_command',
    routingVersion: 4,
    commandName,
    targets,
    timestamp: meta.timestamp ?? new Date().toISOString(),
    room: String(data.room ?? ''),
    patientName: String(data.patientName ?? ''),
    nurseName: String(data.nurseInitials ?? meta.nurseName ?? ''),
    category: def?.description ?? commandName,
    categories: def?.description ?? commandName,
    dashboardCategories: targets.join('; '),
    riskLevel,
    riskScore: '',
    suggestedAction: '',
    symptoms: buildSymptomsSummary(commandName, data),
    originalMessage,
    // Command-specific payload fields (Apps Script can read these)
    commandPayload: JSON.stringify(data),
  }
}

/** Build a short symptoms/notes string for the nursing_notes tab. */
function buildSymptomsSummary(commandName, data) {
  switch (commandName) {
    case '/vitals':
      return [
        data.bp && `BP ${data.bp}`,
        data.pulse && `P ${data.pulse}`,
        data.temperature && `T ${data.temperature}`,
        data.spo2 && `SpO2 ${data.spo2}%`,
        data.bloodSugar && `BSL ${data.bloodSugar}`,
      ].filter(Boolean).join(', ')
    case '/fall':
      return `${data.whatHappened ?? ''} at ${data.location ?? ''}${data.injury ? ` — ${data.injury}` : ''}`
    case '/turning':
      return `Position: ${data.position ?? ''}${data.skinCondition ? ` | Skin: ${data.skinCondition}` : ''}`
    case '/rehab':
      return `${data.exerciseDone ?? ''}${data.walkingDistance ? ` ${data.walkingDistance}` : ''} — ${data.progress ?? ''}`
    case '/med':
      return `${data.medicineName ?? ''} ${data.dosage ?? ''} at ${data.timeGiven ?? ''}`
    case '/alert':
      return `${data.emergencyType ?? ''} (${data.urgencyLevel ?? ''}): ${data.currentCondition ?? ''}`
    case '/admit':
      return `Admitted — ${data.diagnosis ?? ''}${data.age ? ` | Age ${data.age}` : ''}${data.gender ? ` | ${data.gender}` : ''}`
    default:
      return ''
  }
}

/**
 * Post a command record to Google Sheets via the Apps Script webhook.
 *
 * @param {string} commandName
 * @param {object} data  collected form data
 * @param {object} meta  { id, timestamp, chatId, nurseName }
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: string }>}
 */
export async function syncCommandToGoogleSheet(commandName, data, meta) {
  const mode = String(process.env.GOOGLE_SHEET_MODE || 'simulation').toLowerCase()

  if (mode !== 'live' && mode !== 'production') {
    console.log(`[cmd-sheet] Skipped — GOOGLE_SHEET_MODE=${mode}`)
    return { ok: true, skipped: true, reason: `GOOGLE_SHEET_MODE=${mode}` }
  }

  const webhookUrl = String(process.env.GOOGLE_SHEET_WEBHOOK_URL || '').trim()
  if (!webhookUrl) {
    console.error('[cmd-sheet] GOOGLE_SHEET_WEBHOOK_URL not set')
    return { ok: false, skipped: false, error: 'GOOGLE_SHEET_WEBHOOK_URL missing' }
  }

  const payload = buildSheetPayload(commandName, data, meta)

  console.log('[cmd-sheet] Posting command record:', {
    command: commandName,
    tabs: payload.targets,
    room: payload.room,
  })

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = text }

    console.log('[cmd-sheet] Apps Script response:', res.status, parsed)
    return { ok: res.ok, status: res.status, response: parsed }
  } catch (err) {
    console.error('[cmd-sheet] Fetch failed:', err?.message)
    return { ok: false, error: String(err?.message || err) }
  }
}
