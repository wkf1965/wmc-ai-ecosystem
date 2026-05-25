/**
 * Telegram Input Service
 *
 * Handles write commands from Telegram nurses:
 *   /vitals patientName bp pulse oxygen temperature painScore
 *   /turning patientName position completed|pending
 *   /note patientName ...free text note
 *
 * Flow: parse args → resolve patient → save nursing record → emit event → return confirmation
 */

const nursingService = require('../nursing/nursing.service')
const patientRepository = require('../../repositories/patient.repository')
const { emitEvent } = require('../../core/events/event-bus')
const { EVENT_TYPES } = require('../../core/events/event-types')

// ── Patient resolution ────────────────────────────────────────────────────────

/**
 * Resolve a patient by name from the patient store.
 * Looks for an exact (case-insensitive) match first, then a partial match.
 * Returns { id, fullName } or null.
 */
async function resolvePatient(namePart) {
  const { data: patients } = await patientRepository.getAll({ limit: 500 })
  const q = namePart.trim().toLowerCase()

  // Exact match
  const exact = patients.find((p) => p.fullName.toLowerCase() === q)
  if (exact) return { id: exact.id, fullName: exact.fullName }

  // Partial match — starts-with
  const partial = patients.find((p) => p.fullName.toLowerCase().startsWith(q))
  if (partial) return { id: partial.id, fullName: partial.fullName }

  // Substring match
  const sub = patients.find((p) => p.fullName.toLowerCase().includes(q))
  if (sub) return { id: sub.id, fullName: sub.fullName }

  return null
}

/**
 * For `/note`, try every prefix length to find the longest name that matches a known patient.
 * e.g. ["Ah","Chong","patient","looks","stable","today"]
 * → tries "Ah Chong patient looks stable today", "Ah Chong patient looks stable", … "Ah Chong", "Ah"
 * → stops at "Ah Chong"
 * Returns { patient, noteText } or null if no patient found.
 */
async function resolvePatientFromPrefix(tokens) {
  const { data: patients } = await patientRepository.getAll({ limit: 500 })
  const names = patients.map((p) => p.fullName.toLowerCase())

  for (let len = tokens.length - 1; len >= 1; len--) {
    const candidate = tokens.slice(0, len).join(' ').toLowerCase()
    const idx = names.findIndex((n) => n === candidate || n.startsWith(candidate))
    if (idx !== -1) {
      const patient = patients[idx]
      const noteText = tokens.slice(len).join(' ')
      return { patient: { id: patient.id, fullName: patient.fullName }, noteText }
    }
  }

  return null
}

// ── Validators ────────────────────────────────────────────────────────────────

function isNumeric(val) {
  return val !== '' && !isNaN(Number(val))
}

// ── /vitals handler ───────────────────────────────────────────────────────────
//
// Format: /vitals <patient name> <bp> <pulse> <oxygen> <temperature> <painScore>
// Example: /vitals Ah Chong 140/90 88 96 36.8 4
// The last 5 tokens (fixed) are always the vitals values.

async function handleVitals(args, nurseName) {
  const tokens = args.trim().split(/\s+/)

  if (tokens.length < 6) {
    return {
      ok: false,
      error: 'Format: /vitals <patient name> <bp> <pulse> <oxygen> <temperature> <painScore>',
      example: '/vitals Ah Chong 140/90 88 96 36.8 4',
    }
  }

  // Last 5 tokens = vitals values; everything before = patient name
  const [bp, pulse, oxygen, temperature, painScore] = tokens.slice(-5)
  const patientNamePart = tokens.slice(0, -5).join(' ')

  if (!isNumeric(pulse) || !isNumeric(temperature) || !isNumeric(painScore) || !isNumeric(oxygen)) {
    return {
      ok: false,
      error: 'pulse, oxygen, temperature and painScore must be numbers',
      parsed: { patientNamePart, bp, pulse, oxygen, temperature, painScore },
    }
  }

  const patient = await resolvePatient(patientNamePart)
  if (!patient) {
    return {
      ok: false,
      error: `Patient "${patientNamePart}" not found. Check name spelling or register patient first.`,
    }
  }

  const oxygenStr = String(oxygen).includes('%') ? String(oxygen) : `${oxygen}%`

  const input = {
    patientId:    patient.id,
    patientName:  patient.fullName,
    nurseName:    nurseName ?? 'Telegram Nurse',
    shiftDate:    new Date().toISOString().slice(0, 10),
    recordType:   'vitals',
    bloodPressure: bp,
    pulse:         Number(pulse),
    oxygen:        oxygenStr,
    temperature:   Number(temperature),
    painScore:     Number(painScore),
    notes:         `Vitals submitted via Telegram by ${nurseName ?? 'nurse'}`,
    status:        'active',
    source:        'telegram',
  }

  const result = await nursingService.createRecord(input)

  emitEvent(EVENT_TYPES.NURSING_RECORD_CREATED, {
    patientId:  patient.id,
    nurseName:  input.nurseName,
    recordId:   result.record.id,
    recordType: 'vitals',
    source:     'telegram',
  })

  // Auto-flag out-of-range vitals
  const warnings = []
  const pulseNum = Number(pulse)
  const oxygenNum = Number(String(oxygen).replace('%', ''))
  const tempNum   = Number(temperature)
  const painNum   = Number(painScore)

  if (oxygenNum < 95) warnings.push(`⚠️ Low SpO2: ${oxygenStr}`)
  if (pulseNum > 100 || pulseNum < 50) warnings.push(`⚠️ Abnormal pulse: ${pulse} bpm`)
  if (tempNum >= 37.5) warnings.push(`⚠️ Elevated temperature: ${temperature}°C`)
  if (painNum >= 7) warnings.push(`⚠️ High pain score: ${painScore}/10`)

  const bpMatch = String(bp).match(/^(\d+)\/(\d+)$/)
  if (bpMatch) {
    const systolic = Number(bpMatch[1])
    if (systolic >= 140) warnings.push(`⚠️ High BP: ${bp} mmHg`)
  }

  return {
    ok: true,
    command: 'vitals',
    recordId:    result.record.id,
    patient:     { id: patient.id, name: patient.fullName },
    vitals:      { bp, pulse: Number(pulse), oxygen: oxygenStr, temperature: Number(temperature), painScore: Number(painScore) },
    recordedBy:  input.nurseName,
    recordedAt:  result.record.createdAt ?? new Date().toISOString(),
    warnings,
    status:      warnings.length > 0 ? 'saved_with_alerts' : 'saved',
    saved:       true,
    mock:        result.mock ?? true,
  }
}

// ── /turning handler ──────────────────────────────────────────────────────────
//
// Format: /turning <patient name> <position> <completed|pending>
// Example: /turning Ah Chong left completed

const VALID_POSITIONS = ['left', 'right', 'supine', 'prone', 'semi-fowler', 'fowler', 'lateral']
const VALID_STATUSES  = ['completed', 'pending', 'skipped', 'done']

async function handleTurning(args, nurseName) {
  const tokens = args.trim().split(/\s+/)

  if (tokens.length < 3) {
    return {
      ok: false,
      error: 'Format: /turning <patient name> <position> <completed|pending>',
      example: '/turning Ah Chong left completed',
    }
  }

  const [status, position] = [tokens[tokens.length - 1], tokens[tokens.length - 2]]
  const patientNamePart = tokens.slice(0, -2).join(' ')

  if (!VALID_STATUSES.includes(status.toLowerCase())) {
    return {
      ok: false,
      error: `Status must be one of: ${VALID_STATUSES.join(', ')}`,
      received: status,
    }
  }

  const patient = await resolvePatient(patientNamePart)
  if (!patient) {
    return {
      ok: false,
      error: `Patient "${patientNamePart}" not found. Check name spelling or register patient first.`,
    }
  }

  const normalizedStatus = status.toLowerCase() === 'done' ? 'completed' : status.toLowerCase()

  const input = {
    patientId:      patient.id,
    patientName:    patient.fullName,
    nurseName:      nurseName ?? 'Telegram Nurse',
    shiftDate:      new Date().toISOString().slice(0, 10),
    recordType:     'turning',
    sideTurning:    `${position} (${normalizedStatus})`,
    mobility:       'bedbound',
    notes:          `Turning ${normalizedStatus}: position ${position}. Logged via Telegram by ${nurseName ?? 'nurse'}.`,
    status:         'active',
    source:         'telegram',
  }

  const result = await nursingService.createRecord(input)

  emitEvent(EVENT_TYPES.NURSING_RECORD_CREATED, {
    patientId:  patient.id,
    nurseName:  input.nurseName,
    recordId:   result.record.id,
    recordType: 'turning',
    source:     'telegram',
  })

  return {
    ok:          true,
    command:     'turning',
    recordId:    result.record.id,
    patient:     { id: patient.id, name: patient.fullName },
    turning:     { position, status: normalizedStatus },
    recordedBy:  input.nurseName,
    recordedAt:  result.record.createdAt ?? new Date().toISOString(),
    status:      'saved',
    saved:       true,
    mock:        result.mock ?? true,
  }
}

// ── /note handler ─────────────────────────────────────────────────────────────
//
// Format: /note <patient name> <free text note>
// Example: /note Ah Chong patient looks stable today

async function handleNote(args, nurseName) {
  const tokens = args.trim().split(/\s+/)

  if (tokens.length < 2) {
    return {
      ok: false,
      error: 'Format: /note <patient name> <nursing note text>',
      example: '/note Ah Chong patient looks stable today',
    }
  }

  const resolved = await resolvePatientFromPrefix(tokens)
  if (!resolved) {
    return {
      ok: false,
      error: `Could not identify patient from "${tokens.slice(0, 3).join(' ')} …". Check name spelling.`,
    }
  }

  const { patient, noteText } = resolved

  if (!noteText.trim()) {
    return {
      ok: false,
      error: `Note text is empty. Format: /note <patient name> <note>`,
      example: `/note ${patient.fullName} patient looks stable today`,
    }
  }

  const input = {
    patientId:   patient.id,
    patientName: patient.fullName,
    nurseName:   nurseName ?? 'Telegram Nurse',
    shiftDate:   new Date().toISOString().slice(0, 10),
    recordType:  'note',
    notes:       noteText.trim(),
    status:      'active',
    source:      'telegram',
  }

  const result = await nursingService.createRecord(input)

  emitEvent(EVENT_TYPES.NURSING_RECORD_CREATED, {
    patientId:  patient.id,
    nurseName:  input.nurseName,
    recordId:   result.record.id,
    recordType: 'note',
    source:     'telegram',
  })

  return {
    ok:         true,
    command:    'note',
    recordId:   result.record.id,
    patient:    { id: patient.id, name: patient.fullName },
    note:       noteText.trim(),
    recordedBy: input.nurseName,
    recordedAt: result.record.createdAt ?? new Date().toISOString(),
    status:     'saved',
    saved:      true,
    mock:       result.mock ?? true,
  }
}

module.exports = { handleVitals, handleTurning, handleNote }
