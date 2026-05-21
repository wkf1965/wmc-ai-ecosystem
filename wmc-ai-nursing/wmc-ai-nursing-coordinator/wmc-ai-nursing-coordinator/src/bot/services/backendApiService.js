/**
 * Backend API Service — Stage 5
 *
 * Sends confirmed nursing records to the WMC Central Backend API.
 * This is an optional, non-blocking sync layer — Google Sheet remains
 * the primary backup. A backend failure must never block the nurse workflow.
 *
 * Required env:
 *   WMC_BACKEND_API_URL  — e.g. http://localhost:4000  (no trailing slash)
 *
 * API endpoints:
 *   POST /api/patients           — admissions
 *   POST /api/nursing/vitals     — vital signs
 *   POST /api/nursing/falls      — fall incidents
 *   POST /api/nursing/turning    — side turning records
 *   POST /api/rehab/progress     — rehab sessions
 *   POST /api/nursing/medicine   — medication records
 *   POST /api/nursing/alerts     — clinical alerts
 *
 * Timeout: 10 seconds per request.
 * Stage 6+: add retry logic, JWT auth header, request queue for offline resilience.
 */

import { log } from '../utils/logger.js'

const TIMEOUT_MS = 10_000

// ── Config ───────────────────────────────────────────────────────────────────

function getBaseUrl() {
  return (process.env.WMC_BACKEND_API_URL ?? '').replace(/\/$/, '')
}

export function checkBackendConfig() {
  const url = process.env.WMC_BACKEND_API_URL ?? ''
  return { ok: Boolean(url), url }
}

// ── Core HTTP POST ───────────────────────────────────────────────────────────

/**
 * POST a JSON payload to a backend endpoint with a 10-second timeout.
 * Returns { success, statusCode, error }.
 *
 * @param {string} path   — e.g. '/api/nursing/vitals'
 * @param {object} body
 */
async function postToBackend(path, body) {
  const baseUrl = getBaseUrl()
  if (!baseUrl) {
    return { success: false, error: 'WMC_BACKEND_API_URL not configured' }
  }

  const url = `${baseUrl}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        success: false,
        statusCode: res.status,
        error: `HTTP ${res.status} — ${text.slice(0, 120)}`,
      }
    }

    return { success: true, statusCode: res.status }
  } catch (err) {
    const isTimeout = err?.name === 'AbortError'
    return {
      success: false,
      error: isTimeout ? 'Request timed out after 10 seconds' : (err?.message ?? String(err)),
    }
  } finally {
    clearTimeout(timer)
  }
}

// ── Shared envelope builder ───────────────────────────────────────────────────

/**
 * Wraps workflow data in a standard API envelope so the backend
 * always receives consistent metadata regardless of workflow type.
 */
function envelope(workflowName, data, nurseInfo = {}, recordId = '') {
  return {
    source:     'telegram_bot',
    recordId,
    workflowName,
    timestamp:  new Date().toISOString(),
    nurse: {
      chatId:    nurseInfo.chatId    ?? '',
      username:  nurseInfo.username  ?? '',
      firstName: nurseInfo.firstName ?? '',
    },
    ...data,
  }
}

// ── Public send functions ─────────────────────────────────────────────────────

/**
 * POST /api/patients — patient admission
 */
export async function sendAdmissionToBackend(data, nurseInfo, recordId) {
  const payload = envelope('admit', {
    patientName:   data.patientName   ?? '',
    age:           data.age           ?? '',
    gender:        data.gender        ?? '',
    room:          data.room          ?? '',
    diagnosis:     data.diagnosis     ?? '',
    doctor:        data.doctor        ?? '',
    admissionDate: data.admissionDate ?? '',
    remark:        data.remark        ?? '',
  }, nurseInfo, recordId)

  const result = await postToBackend('/api/patients', payload)
  _log('admit', data.patientName, result)
  return result
}

/**
 * POST /api/nursing/vitals — vital signs
 */
export async function sendVitalsToBackend(data, nurseInfo, recordId) {
  const payload = envelope('vitals', {
    patientName:  data.patientName  ?? '',
    room:         data.room         ?? '',
    bp:           data.bp           ?? '',
    pulse:        data.pulse        ?? '',
    temperature:  data.temperature  ?? '',
    spo2:         data.spo2         ?? '',
    bloodSugar:   data.bloodSugar   ?? '',
    remark:       data.remark       ?? '',
  }, nurseInfo, recordId)

  const result = await postToBackend('/api/nursing/vitals', payload)
  _log('vitals', data.patientName, result)
  return result
}

/**
 * POST /api/nursing/falls — fall incident
 */
export async function sendFallToBackend(data, nurseInfo, recordId) {
  const payload = envelope('fall', {
    patientName:    data.patientName    ?? '',
    room:           data.room           ?? '',
    incidentTime:   data.time           ?? '',
    whatHappened:   data.whatHappened   ?? '',
    injury:         data.injury         ?? '',
    actionTaken:    data.actionTaken    ?? '',
    doctorInformed: data.doctorInformed ?? '',
    familyInformed: data.familyInformed ?? '',
    remark:         data.remark         ?? '',
  }, nurseInfo, recordId)

  const result = await postToBackend('/api/nursing/falls', payload)
  _log('fall', data.patientName, result)
  return result
}

/**
 * POST /api/nursing/turning — side turning record
 */
export async function sendTurningToBackend(data, nurseInfo, recordId) {
  const payload = envelope('turning', {
    patientName:   data.patientName   ?? '',
    room:          data.room          ?? '',
    turningTime:   data.time          ?? '',
    position:      data.position      ?? '',
    skinCondition: data.skinCondition ?? '',
    remark:        data.remark        ?? '',
  }, nurseInfo, recordId)

  const result = await postToBackend('/api/nursing/turning', payload)
  _log('turning', data.patientName, result)
  return result
}

/**
 * POST /api/rehab/progress — rehab session
 */
export async function sendRehabToBackend(data, nurseInfo, recordId) {
  const payload = envelope('rehab', {
    patientName:  data.patientName  ?? '',
    room:         data.room         ?? '',
    sessionDate:  data.date         ?? '',
    therapist:    data.therapist    ?? '',
    sessionType:  data.sessionType  ?? '',
    progress:     data.progress     ?? '',
    nextGoal:     data.nextGoal     ?? '',
    remark:       data.remark       ?? '',
  }, nurseInfo, recordId)

  const result = await postToBackend('/api/rehab/progress', payload)
  _log('rehab', data.patientName, result)
  return result
}

/**
 * POST /api/nursing/medicine — medication administration
 */
export async function sendMedicineToBackend(data, nurseInfo, recordId) {
  const payload = envelope('med', {
    patientName:  data.patientName ?? '',
    room:         data.room        ?? '',
    adminTime:    data.time        ?? '',
    medication:   data.medication  ?? '',
    dose:         data.dose        ?? '',
    indication:   data.indication  ?? '',
    response:     data.response    ?? '',
    remark:       data.remark      ?? '',
  }, nurseInfo, recordId)

  const result = await postToBackend('/api/nursing/medicine', payload)
  _log('med', data.patientName, result)
  return result
}

/**
 * POST /api/nursing/alerts — clinical alert
 */
export async function sendAlertToBackend(data, nurseInfo, recordId) {
  const payload = envelope('alert', {
    patientName:    data.patientName    ?? '',
    room:           data.room           ?? '',
    alertTime:      data.time           ?? '',
    alertType:      data.alertType      ?? '',
    observation:    data.observation    ?? '',
    actionTaken:    data.actionTaken    ?? '',
    doctorInformed: data.doctorInformed ?? '',
    remark:         data.remark         ?? '',
  }, nurseInfo, recordId)

  const result = await postToBackend('/api/nursing/alerts', payload)
  _log('alert', data.patientName, result)
  return result
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

/** Map workflow name → send function */
const SEND_FN = {
  admit:   sendAdmissionToBackend,
  vitals:  sendVitalsToBackend,
  fall:    sendFallToBackend,
  turning: sendTurningToBackend,
  rehab:   sendRehabToBackend,
  med:     sendMedicineToBackend,
  alert:   sendAlertToBackend,
}

/**
 * Route to the correct send function by workflow name.
 * Returns { success: boolean, error?: string }.
 *
 * @param {string} workflowName
 * @param {object} data
 * @param {object} nurseInfo   — { chatId, username, firstName }
 * @param {string} [recordId]  — local record ID for traceability
 */
export async function sendToBackend(workflowName, data, nurseInfo = {}, recordId = '') {
  const fn = SEND_FN[workflowName]
  if (!fn) {
    log.warn('[backend] no send function for workflow:', workflowName)
    return { success: false, error: `No backend handler for workflow: ${workflowName}` }
  }
  return fn(data, nurseInfo, recordId)
}

// ── Logging helper ───────────────────────────────────────────────────────────

function _log(workflow, patientName, result) {
  if (result.success) {
    log.info(`[backend] ✓ ${workflow} | patient: ${patientName} | status: ${result.statusCode ?? 'ok'}`)
  } else {
    log.error(`[backend] ✗ ${workflow} | patient: ${patientName} | error: ${result.error}`)
  }
}
