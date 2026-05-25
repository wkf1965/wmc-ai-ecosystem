const { randomUUID } = require('crypto')
const nursingBridge = require('./nursing-bridge')
const telegramInput = require('./telegram-input.service')

const SUPPORTED_COMMANDS = [
  '/handover',
  '/tasks',
  '/risk',
  '/patient',
  '/alerts',
  '/nightshift',
  '/room',
  '/med',
  '/vitals',
  '/turning',
  '/note',
]

/** @type {Array<object>} */
const interactionLogs = []

function validateMockMessageInput(body) {
  const errors = []
  if (!body || typeof body !== 'object') {
    return ['Request body must be a JSON object']
  }
  if (!body.user || typeof body.user !== 'string' || !body.user.trim()) {
    errors.push('user is required')
  }
  if (!body.group || typeof body.group !== 'string' || !body.group.trim()) {
    errors.push('group is required')
  }
  if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
    errors.push('message is required')
  }
  return errors
}

/**
 * Parse "/patient Ah Chong" → { command: '/patient', args: 'Ah Chong' }
 */
function parseCommand(message) {
  const trimmed = message.trim()
  const match = trimmed.match(/^(\/\w+)(?:\s+(.*))?$/)
  if (!match) {
    return { command: trimmed.split(/\s+/)[0]?.toLowerCase() ?? '', args: '' }
  }
  return {
    command: match[1].toLowerCase(),
    args: (match[2] ?? '').trim(),
  }
}

function isSupportedCommand(command) {
  if (command === '/patient') return true
  return SUPPORTED_COMMANDS.includes(command)
}

async function buildRiskResponse() {
  const [summary, nightShift, predictive] = await Promise.all([
    nursingBridge.getDashboardSummary(),
    nursingBridge.getNightShift(),
    nursingBridge.getPredictiveRisk(),
  ])

  const criticalFromNight = nightShift.nightShiftSummary?.criticalAlerts ?? []

  return {
    highRiskPatients: summary.highRiskPatients ?? [],
    criticalAlerts:
      criticalFromNight.length > 0
        ? criticalFromNight.map((a) =>
            a.replace(/\s+for\s+[\w\s]+$/i, '').trim()
          )
        : ['Low oxygen detected', 'Bed exit alert'],
    pendingTasks: summary.pendingTasks ?? [],
    overallPrediction: predictive.overallPrediction ?? null,
    highConcernAreas: predictive.highConcernAreas ?? [],
  }
}

async function buildHandoverResponse() {
  const handover = await nursingBridge.getHandover()
  return {
    shift: handover.shift,
    overallShiftStatus: handover.overallShiftStatus,
    handoverSummary: handover.handoverSummary,
    highRiskPatients: handover.highRiskPatients,
    pendingTasks: handover.pendingTasks,
    criticalAlerts: handover.criticalAlerts,
    recommendations: handover.recommendations,
    preparedByAI: handover.preparedByAI ?? false,
  }
}

async function buildTasksResponse() {
  const data = await nursingBridge.getTasks()
  return {
    summary: data.summary,
    tasks: (data.tasks ?? []).slice(0, 10),
  }
}

async function buildAlertsResponse() {
  const [escalation, summary, nightShift] = await Promise.all([
    nursingBridge.getEscalationQueue(),
    nursingBridge.getDashboardSummary(),
    nursingBridge.getNightShift(),
  ])

  return {
    systemStatus: escalation.systemStatus,
    escalationQueue: escalation.queue ?? [],
    escalationSummary: escalation.summary,
    alertCounts: summary.alerts ?? {},
    criticalAlerts: nightShift.nightShiftSummary?.criticalAlerts ?? [],
  }
}

async function buildNightShiftResponse() {
  const data = await nursingBridge.getNightShift()
  return {
    systemStatus: data.systemStatus,
    nightShiftSummary: data.nightShiftSummary,
    recommendations: data.recommendations,
  }
}

async function buildPatientResponse(patientName) {
  const name = patientName.trim() || 'Ah Chong'
  const [summary, tasks, escalation] = await Promise.all([
    nursingBridge.getDashboardSummary(),
    nursingBridge.getTasks(),
    nursingBridge.getEscalationQueue(),
  ])

  const isHighRisk = (summary.highRiskPatients ?? []).some(
    (p) => p.toLowerCase() === name.toLowerCase()
  )

  if (name.toLowerCase() === 'ah chong') {
    return nursingBridge.MOCK.patientAhChong
  }

  const patientTasks = (tasks.tasks ?? []).filter(
    (t) => t.patientName?.toLowerCase() === name.toLowerCase()
  )
  const patientEscalations = (escalation.queue ?? []).filter(
    (q) => q.patientName?.toLowerCase() === name.toLowerCase()
  )

  return {
    patientName: name,
    riskLevel: isHighRisk ? 'High' : 'Moderate',
    openAlerts: patientEscalations.map((e) => e.issue),
    pendingTasks: patientTasks.map((t) => t.task),
    lastUpdated: new Date().toISOString(),
  }
}

async function buildRoomResponse() {
  const roomsService = require('../rooms/rooms.service')
  const data = roomsService.getRooms({})
  return {
    totalRooms:    data.totalRooms,
    totalBeds:     data.totalBeds,
    occupiedBeds:  data.occupiedBeds,
    availableBeds: data.availableBeds,
    occupancyRate: `${data.occupancyRate}%`,
    rooms: data.rooms.map((r) => ({
      room:      r.roomNumber,
      ward:      r.ward,
      status:    r.status,
      beds:      `${r.occupiedBeds}/${r.totalBeds}`,
    })),
  }
}

async function buildMedResponse(patientName) {
  const medicineService = require('../medicine/medicine.service')
  const pending = medicineService.getPendingMedications()
  const summary = medicineService.getMedicineSummary()
  const filtered = patientName
    ? pending.pending.filter((s) => s.patientName?.toLowerCase().includes(patientName.toLowerCase()))
    : pending.pending
  return {
    summary: {
      totalSchedules: summary.totalSchedules,
      givenToday:     summary.givenToday,
      pendingToday:   summary.pendingToday,
      overdue:        summary.overdueCount,
    },
    pendingMedications: filtered.map((s) => ({
      patient:      s.patientName,
      medicine:     s.medicineName,
      dosage:       s.dosage,
      scheduledAt:  s.scheduledTime,
      prescribedBy: s.prescribedBy,
    })),
  }
}

async function executeCommand(command, args, meta = {}) {
  switch (command) {
    case '/handover':   return buildHandoverResponse()
    case '/tasks':      return buildTasksResponse()
    case '/risk':       return buildRiskResponse()
    case '/patient':    return buildPatientResponse(args)
    case '/alerts':     return buildAlertsResponse()
    case '/nightshift': return buildNightShiftResponse()
    case '/room':       return buildRoomResponse()
    case '/med':        return buildMedResponse(args)
    // ── Input commands ────────────────────────────────────────────────────────
    case '/vitals':     return telegramInput.handleVitals(args, meta.nurseName)
    case '/turning':    return telegramInput.handleTurning(args, meta.nurseName)
    case '/note':       return telegramInput.handleNote(args, meta.nurseName)
    default:
      return {
        error: 'Unknown command',
        supportedCommands: SUPPORTED_COMMANDS,
        hint: 'Try /handover /tasks /risk /patient /alerts /nightshift /room /med /vitals /turning /note',
      }
  }
}

async function processMockMessage(input) {
  const user = input.user.trim()
  const group = input.group.trim()
  const message = input.message.trim()
  const { command, args } = parseCommand(message)

  const id = randomUUID()
  const processedAt = new Date().toISOString()

  const meta = { nurseName: user }

  if (!isSupportedCommand(command)) {
    const response = await executeCommand(command, args, meta)
    const entry = {
      id,
      user,
      group,
      message,
      command,
      response,
      status: 'unknown_command',
      mock: true,
      processedAt,
    }
    interactionLogs.unshift(entry)
    return {
      user,
      group,
      command,
      response,
      status: 'unknown_command',
      mock: true,
    }
  }

  const response = await executeCommand(command, args, meta)
  const entry = {
    id,
    user,
    group,
    message,
    command,
    response,
    status: 'processed',
    mock: true,
    processedAt,
  }
  interactionLogs.unshift(entry)

  if (process.env.NODE_ENV !== 'test') {
    console.info('[MOCK TELEGRAM]', JSON.stringify({ user, command, group }))
  }

  return {
    user,
    group,
    command,
    response,
    status: 'processed',
    mock: true,
  }
}

function getTelegramLogs(filters = {}) {
  let results = [...interactionLogs]

  if (filters.user) {
    const u = String(filters.user).toLowerCase()
    results = results.filter((log) => log.user.toLowerCase().includes(u))
  }

  if (filters.command) {
    const c = String(filters.command).toLowerCase()
    results = results.filter((log) => log.command === c)
  }

  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 100
  results = results.slice(0, limit)

  return {
    total: interactionLogs.length,
    count: results.length,
    logs: results,
  }
}

function clearTelegramLogs() {
  interactionLogs.length = 0
}

module.exports = {
  SUPPORTED_COMMANDS,
  validateMockMessageInput,
  parseCommand,
  processMockMessage,
  getTelegramLogs,
  clearTelegramLogs,
}
