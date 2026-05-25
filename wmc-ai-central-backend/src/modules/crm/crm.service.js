const { randomUUID } = require('crypto')

const VALID_SOURCES = ['WhatsApp', 'Telegram', 'Walk-in', 'Referral', 'Google Form', 'Phone', 'Other']
const VALID_LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost']
const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
const VALID_APPOINTMENT_STATUSES = ['Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No-show']

/** @type {Array<object>} */
const leads = []

/** @type {Array<object>} */
const appointments = []

/** @type {Array<object>} */
const followUpTasks = []

/** @type {Array<object>} */
const crmLogs = []

function nowIso() {
  return new Date().toISOString()
}

function addCrmLog(action, entityType, entityId, detail = {}) {
  const entry = {
    id: randomUUID(),
    action,
    entityType,
    entityId,
    detail,
    createdAt: nowIso(),
    mock: true,
  }
  crmLogs.unshift(entry)
  return entry
}

function normalizeEnum(value, allowed, fallback) {
  if (!value) return fallback
  const found = allowed.find((a) => a.toLowerCase() === String(value).trim().toLowerCase())
  return found ?? fallback
}

/**
 * Rule-based lead priority classification.
 * @param {{ message?: string, source?: string, interest?: string, leadStatus?: string }} input
 */
function classifyLeadPriority(input) {
  const message = (input.message ?? '').toLowerCase()
  const source = (input.source ?? '').toLowerCase()
  const interest = (input.interest ?? '').toLowerCase()

  const urgentKeywords = [
    'urgent',
    'emergency',
    'immediately',
    'asap',
    'today',
    'critical',
    'hospital',
  ]
  const highKeywords = ['consultation', 'admission', 'bed', 'care home', 'nursing home', 'rehab']

  if (urgentKeywords.some((k) => message.includes(k))) return 'Urgent'
  if (source === 'whatsapp' && message.length > 0) return 'High'
  if (highKeywords.some((k) => message.includes(k) || interest.includes(k))) return 'High'
  if (source === 'referral') return 'High'
  if (source === 'walk-in') return 'Medium'
  return 'Medium'
}

function computeFollowUpDueAt(priority) {
  const d = new Date()
  switch (priority) {
    case 'Urgent':
      d.setHours(d.getHours() + 1)
      break
    case 'High':
      d.setHours(d.getHours() + 4)
      break
    case 'Medium':
      d.setDate(d.getDate() + 1)
      break
    default:
      d.setDate(d.getDate() + 2)
  }
  return d.toISOString()
}

function validateLeadInput(body) {
  const errors = []
  if (!body || typeof body !== 'object') return ['Request body must be a JSON object']
  if (!body.name?.trim()) errors.push('name is required')
  if (!body.phone?.trim()) errors.push('phone is required')
  return errors
}

function validateAppointmentInput(body) {
  const errors = []
  if (!body || typeof body !== 'object') return ['Request body must be a JSON object']
  if (!body.leadName?.trim()) errors.push('leadName is required')
  if (!body.phone?.trim()) errors.push('phone is required')
  if (!body.service?.trim()) errors.push('service is required')
  if (!body.appointmentDate?.trim()) errors.push('appointmentDate is required')
  if (!body.appointmentTime?.trim()) errors.push('appointmentTime is required')
  return errors
}

function createFollowUpTaskForLead(lead) {
  const task = {
    id: randomUUID(),
    leadId: lead.id,
    leadName: lead.name,
    phone: lead.phone,
    type: 'follow_up',
    title: `Follow up new lead: ${lead.name}`,
    description: `Contact ${lead.name} regarding ${lead.interest || 'inquiry'} — source ${lead.source}`,
    priority: lead.priority,
    status: 'pending',
    dueAt: computeFollowUpDueAt(lead.priority),
    createdAt: nowIso(),
    mock: true,
  }
  followUpTasks.unshift(task)
  addCrmLog('follow_up_task_created', 'task', task.id, {
    leadId: lead.id,
    dueAt: task.dueAt,
    priority: task.priority,
  })
  return task
}

function createLead(input) {
  const userPriority = input.priority
    ? normalizeEnum(input.priority, VALID_PRIORITIES, 'Medium')
    : null
  const classifiedPriority = classifyLeadPriority(input)
  const priority = userPriority ?? classifiedPriority

  const lead = {
    id: randomUUID(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    source: normalizeEnum(input.source, VALID_SOURCES, 'Other'),
    interest: input.interest?.trim() ?? '',
    message: input.message?.trim() ?? '',
    leadStatus: normalizeEnum(input.leadStatus, VALID_LEAD_STATUSES, 'New'),
    priority,
    classifiedPriority,
    prioritySource: userPriority ? 'user' : 'auto',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    mock: true,
  }

  leads.unshift(lead)
  addCrmLog('lead_created', 'lead', lead.id, {
    name: lead.name,
    source: lead.source,
    priority: lead.priority,
    classifiedPriority: lead.classifiedPriority,
  })

  const followUpTask = createFollowUpTaskForLead(lead)

  return { lead, followUpTask }
}

function listLeads(filters = {}) {
  let results = [...leads]
  if (filters.status) {
    const s = normalizeEnum(filters.status, VALID_LEAD_STATUSES, null)
    if (s) results = results.filter((l) => l.leadStatus === s)
  }
  if (filters.priority) {
    const p = normalizeEnum(filters.priority, VALID_PRIORITIES, null)
    if (p) results = results.filter((l) => l.priority === p)
  }
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 100
  return { total: leads.length, count: Math.min(results.length, limit), leads: results.slice(0, limit) }
}

function createAppointment(input) {
  const appointment = {
    id: randomUUID(),
    leadName: input.leadName.trim(),
    phone: input.phone.trim(),
    service: input.service.trim(),
    appointmentDate: input.appointmentDate.trim(),
    appointmentTime: input.appointmentTime.trim(),
    status: normalizeEnum(input.status, VALID_APPOINTMENT_STATUSES, 'Scheduled'),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    mock: true,
  }

  appointments.unshift(appointment)
  addCrmLog('appointment_created', 'appointment', appointment.id, {
    leadName: appointment.leadName,
    service: appointment.service,
    appointmentDate: appointment.appointmentDate,
    status: appointment.status,
  })

  const linkedLead = leads.find((l) => l.phone === appointment.phone)
  if (linkedLead && linkedLead.leadStatus === 'New') {
    linkedLead.leadStatus = 'Contacted'
    linkedLead.updatedAt = nowIso()
    addCrmLog('lead_status_updated', 'lead', linkedLead.id, {
      leadStatus: 'Contacted',
      reason: 'appointment_booked',
    })
  }

  return appointment
}

function listAppointments(filters = {}) {
  let results = [...appointments]
  if (filters.status) {
    const s = normalizeEnum(filters.status, VALID_APPOINTMENT_STATUSES, null)
    if (s) results = results.filter((a) => a.status === s)
  }
  if (filters.date) {
    results = results.filter((a) => a.appointmentDate === String(filters.date).trim())
  }
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 100
  return {
    total: appointments.length,
    count: Math.min(results.length, limit),
    appointments: results.slice(0, limit),
  }
}

function getCrmLogs(filters = {}) {
  let results = [...crmLogs]
  if (filters.entityType) {
    results = results.filter((l) => l.entityType === String(filters.entityType).toLowerCase())
  }
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 100
  return { total: crmLogs.length, count: Math.min(results.length, limit), logs: results.slice(0, limit) }
}

function listFollowUpTasks() {
  return { total: followUpTasks.length, tasks: followUpTasks.slice(0, 100) }
}

function clearCrmData() {
  leads.length = 0
  appointments.length = 0
  followUpTasks.length = 0
  crmLogs.length = 0
}

module.exports = {
  VALID_SOURCES,
  VALID_LEAD_STATUSES,
  VALID_PRIORITIES,
  validateLeadInput,
  validateAppointmentInput,
  classifyLeadPriority,
  createLead,
  listLeads,
  createAppointment,
  listAppointments,
  getCrmLogs,
  listFollowUpTasks,
  clearCrmData,
}
