/**
 * Telegram nurse workflow reply — concise bot message; roster-verified patients only.
 */

import { scoreToLevel } from './aiRiskDetection.js'

/** Maps underlying AI score bands to dashboard Telegram tiers */
const WORKFLOW_RISK_FROM_AI_LABEL = {
  Minimal: 'Low',
  Low: 'Low',
  Moderate: 'Warning',
  High: 'High',
  Critical: 'Emergency',
}

/** Unified reply when room/roster lookup finds no Patientsroom row. */
export const TELEGRAM_PATIENTSROOM_NOT_FOUND_REPLY = 'Patient room not found in roster.'

export const TELEGRAM_PROCESSING_ERROR_REPLY =
  'Could not process this message. Please try again in a moment.'

/** @deprecated Use TELEGRAM_PATIENTSROOM_NOT_FOUND_REPLY */
export const TELEGRAM_PATIENT_NOT_FOUND_REPLY = TELEGRAM_PATIENTSROOM_NOT_FOUND_REPLY

/** @deprecated Use TELEGRAM_PATIENTSROOM_NOT_FOUND_REPLY */
export const TELEGRAM_ROOM_NOT_FOUND_REPLY = TELEGRAM_PATIENTSROOM_NOT_FOUND_REPLY

export const TELEGRAM_ROOM_REQUIRED_REPLY =
  'Please include a room number (e.g. Room 5).'

export function mapOverallScoreToWorkflowRiskLabel(overallScore) {
  if (overallScore == null || !Number.isFinite(Number(overallScore))) return 'N/A'
  const { label } = scoreToLevel(Number(overallScore))
  return WORKFLOW_RISK_FROM_AI_LABEL[label] || label
}

/**
 * Acknowledgement for Telegram — roster-verified success (multi-line confirmation).
 * @param {object} integration — result of processTelegramNurseMessageForIntegration
 */
export function buildTelegramWorkflowReply(integration) {
  const { parsed, patientResolution, patientNameResolved, resolvedRoom } = integration

  if (patientResolution === 'processing_error') {
    return TELEGRAM_PROCESSING_ERROR_REPLY
  }
  if (patientResolution === 'roster_unavailable') {
    return 'Patient roster unavailable. Check Google Sheet connection (GOOGLE_SHEET_MODE=live and webhook).'
  }
  if (patientResolution === 'patient_room_not_found' || patientResolution === 'patient_not_found') {
    return TELEGRAM_PATIENTSROOM_NOT_FOUND_REPLY
  }
  if (patientResolution === 'room_required') {
    return TELEGRAM_ROOM_REQUIRED_REPLY
  }
  if (patientResolution === 'ambiguous_patient') {
    return 'Multiple patients match. Please include room number.'
  }

  const roomAck =
    resolvedRoom != null && String(resolvedRoom).trim() !== ''
      ? String(resolvedRoom).trim()
      : parsed?.patientRoom != null && String(parsed.patientRoom).trim() !== ''
        ? String(parsed.patientRoom).trim()
        : '—'

  const finalPatientName = String(patientNameResolved ?? '').trim() || 'Unknown'
  return `Received Room ${roomAck}.\nPatient: ${finalPatientName}\nSaved to Nursing Dashboard.`
}
