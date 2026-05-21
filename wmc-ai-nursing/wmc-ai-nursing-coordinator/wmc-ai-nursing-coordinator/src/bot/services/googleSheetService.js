/**
 * Google Sheet Service — Stage 3
 *
 * Appends confirmed nursing workflow records to the correct Google Sheet tab.
 * Uses a Service Account for authentication (no OAuth flow required).
 *
 * Required environment variables:
 *   GOOGLE_SHEET_ID              — the spreadsheet ID from its URL
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL — e.g. bot@project-id.iam.gserviceaccount.com
 *   GOOGLE_PRIVATE_KEY           — full PEM key, newlines as \n in .env
 *
 * Sheet tab names (create these tabs in the spreadsheet):
 *   Admissions | Vitals | Falls | Turning | Rehab | Medicine | Alerts
 *
 * Stage 4+: replace with a write-through cache + batch flush for high volume.
 */

import { google } from 'googleapis'
import { log } from '../utils/logger.js'

// ── Config ───────────────────────────────────────────────────────────────────
// Read credentials lazily (inside functions) so dotenv has time to load first.

/** @type {Record<string, string>} workflow name → sheet tab name */
const TAB = {
  admit:   'Admissions',
  vitals:  'Vitals',
  fall:    'Falls',
  turning: 'Turning',
  rehab:   'Rehab',
  med:     'Medicine',
  alert:   'Alerts',
}

// ── Credential helpers (lazy — read at call time, not at module load) ─────────

function getCredentials() {
  const sheetId     = process.env.GOOGLE_SHEET_ID ?? ''
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''
  const rawKey      = process.env.GOOGLE_PRIVATE_KEY ?? ''
  const privateKey  = rawKey.replace(/\\n/g, '\n')
  return { sheetId, clientEmail, privateKey, rawKey }
}

// ── Debug credential log ──────────────────────────────────────────────────────

function logCredentialStatus(creds) {
  console.log('\n[sheet-debug] ─── Google Sheet Credential Check ───────────────────')
  console.log(`[sheet-debug]  GOOGLE_SHEET_ID              : ${creds.sheetId      ? `SET   (${creds.sheetId.slice(0,20)}...)` : '❌ MISSING'}`)
  console.log(`[sheet-debug]  GOOGLE_SERVICE_ACCOUNT_EMAIL : ${creds.clientEmail  ? `SET   (${creds.clientEmail})` : '❌ MISSING'}`)
  console.log(`[sheet-debug]  GOOGLE_PRIVATE_KEY           : ${creds.rawKey       ? `SET   (length: ${creds.rawKey.length} chars, starts: ${creds.rawKey.slice(0,30).replace(/\n/g,'\\n')}...)` : '❌ MISSING'}`)
  if (creds.rawKey && !creds.rawKey.includes('BEGIN')) {
    console.log('[sheet-debug]  ⚠️  WARNING: PRIVATE_KEY does not contain "BEGIN" — key may be malformed')
  }
  if (creds.rawKey && creds.rawKey.includes('BEGIN') && !creds.privateKey.includes('\n')) {
    console.log('[sheet-debug]  ⚠️  WARNING: private key has no real newlines after \\n replacement — check .env format')
  }
  console.log('[sheet-debug] ────────────────────────────────────────────────────────\n')
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function createAuth(creds) {
  return new google.auth.JWT({
    email:  creds.clientEmail,
    key:    creds.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

// ── Core append ──────────────────────────────────────────────────────────────

/**
 * Append a single row to a named sheet tab.
 * Throws with full error details if the API call fails.
 */
async function appendRow(tabName, values) {
  const creds = getCredentials()

  // ── Step 1: credential check ─────────────────────────────────────────────
  log.info(`[sheet] ── saving to tab: "${tabName}" ──`)
  logCredentialStatus(creds)

  if (!creds.sheetId || !creds.clientEmail || !creds.privateKey) {
    const missing = [
      !creds.sheetId      && 'GOOGLE_SHEET_ID',
      !creds.clientEmail  && 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      !creds.privateKey   && 'GOOGLE_PRIVATE_KEY',
    ].filter(Boolean).join(', ')
    throw new Error(`Missing credentials: ${missing}`)
  }

  // ── Step 2: build auth ───────────────────────────────────────────────────
  log.info('[sheet] creating Google JWT auth...')
  let auth
  try {
    auth = createAuth(creds)
    log.info('[sheet] JWT auth object created OK')
  } catch (authErr) {
    console.error('[sheet] ❌ JWT auth creation failed:', authErr?.message ?? authErr)
    throw authErr
  }

  // ── Step 3: API call ─────────────────────────────────────────────────────
  log.info(`[sheet] calling sheets.spreadsheets.values.append → spreadsheetId:${creds.sheetId} range:${tabName}!A1`)
  const sheets = google.sheets({ version: 'v4', auth })
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: creds.sheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    })
    log.info(`[sheet] ✅ append OK — updatedRange: ${res.data?.updates?.updatedRange ?? '(unknown)'}`)
  } catch (apiErr) {
    // Print full error — do not hide anything
    console.error('\n[sheet] ❌ GOOGLE API ERROR ──────────────────────────────────────────')
    console.error('[sheet]  message  :', apiErr?.message ?? apiErr)
    console.error('[sheet]  code     :', apiErr?.code)
    console.error('[sheet]  status   :', apiErr?.status)
    console.error('[sheet]  errors   :', JSON.stringify(apiErr?.errors ?? [], null, 2))
    if (apiErr?.response?.data) {
      console.error('[sheet]  API body :', JSON.stringify(apiErr.response.data, null, 2))
    }
    console.error('[sheet] ─────────────────────────────────────────────────────────────\n')
    throw apiErr
  }
}

// ── Shared header columns ────────────────────────────────────────────────────

/**
 * Returns the first 4 standard columns for every row:
 *   [Timestamp, CommandType, NurseChatId, NurseUsername]
 */
function metaColumns(workflowName, nurseInfo = {}) {
  return [
    new Date().toLocaleString('en-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }),
    workflowName.toUpperCase(),
    String(nurseInfo.chatId ?? ''),
    nurseInfo.username ? `@${nurseInfo.username}` : (nurseInfo.firstName ?? 'Unknown Nurse'),
  ]
}

// ── Public save functions ─────────────────────────────────────────────────────

/**
 * Save an admission record to the "Admissions" tab.
 * Columns: Timestamp | Command | ChatId | Username | PatientName | Age | Gender
 *          | Room | Diagnosis | Doctor | AdmissionDate | Remark
 */
export async function saveAdmissionRecord(data, nurseInfo) {
  const row = [
    ...metaColumns('admit', nurseInfo),
    data.patientName   ?? '',
    data.age           ?? '',
    data.gender        ?? '',
    data.room          ?? '',
    data.diagnosis     ?? '',
    data.doctor        ?? '',
    data.admissionDate ?? '',
    data.remark        ?? '',
  ]
  await appendRow(TAB.admit, row)
  log.info('[sheet] admission saved — patient:', data.patientName)
}

/**
 * Save a vitals record to the "Vitals" tab.
 * Columns: Timestamp | Command | ChatId | Username | PatientName | Room
 *          | BP | Pulse | Temperature | SpO2 | BloodSugar | Remark
 */
export async function saveVitalsRecord(data, nurseInfo) {
  const row = [
    ...metaColumns('vitals', nurseInfo),
    data.patientName  ?? '',
    data.room         ?? '',
    data.bp           ?? '',
    data.pulse        ?? '',
    data.temperature  ?? '',
    data.spo2         ?? '',
    data.bloodSugar   ?? '',
    data.remark       ?? '',
  ]
  await appendRow(TAB.vitals, row)
  log.info('[sheet] vitals saved — patient:', data.patientName)
}

/**
 * Save a fall incident to the "Falls" tab.
 * Columns: Timestamp | Command | ChatId | Username | PatientName | Room
 *          | IncidentTime | WhatHappened | Injury | ActionTaken
 *          | DoctorInformed | FamilyInformed | Remark
 */
export async function saveFallRecord(data, nurseInfo) {
  const row = [
    ...metaColumns('fall', nurseInfo),
    data.patientName    ?? '',
    data.room           ?? '',
    data.time           ?? '',
    data.whatHappened   ?? '',
    data.injury         ?? '',
    data.actionTaken    ?? '',
    data.doctorInformed ?? '',
    data.familyInformed ?? '',
    data.remark         ?? '',
  ]
  await appendRow(TAB.fall, row)
  log.info('[sheet] fall record saved — patient:', data.patientName)
}

/**
 * Save a turning record to the "Turning" tab.
 * Columns: Timestamp | Command | ChatId | Username | PatientName | Room
 *          | Time | Position | SkinCondition | Remark
 */
export async function saveTurningRecord(data, nurseInfo) {
  const row = [
    ...metaColumns('turning', nurseInfo),
    data.patientName    ?? '',
    data.room           ?? '',
    data.time           ?? '',
    data.position       ?? '',
    data.skinCondition  ?? '',
    data.remark         ?? '',
  ]
  await appendRow(TAB.turning, row)
  log.info('[sheet] turning record saved — patient:', data.patientName)
}

/**
 * Save a rehab session to the "Rehab" tab.
 * Columns: Timestamp | Command | ChatId | Username | PatientName | Room
 *          | Date | Therapist | SessionType | Progress | NextGoal | Remark
 */
export async function saveRehabRecord(data, nurseInfo) {
  const row = [
    ...metaColumns('rehab', nurseInfo),
    data.patientName  ?? '',
    data.room         ?? '',
    data.date         ?? '',
    data.therapist    ?? '',
    data.sessionType  ?? '',
    data.progress     ?? '',
    data.nextGoal     ?? '',
    data.remark       ?? '',
  ]
  await appendRow(TAB.rehab, row)
  log.info('[sheet] rehab record saved — patient:', data.patientName)
}

/**
 * Save a medication record to the "Medicine" tab.
 * Columns: Timestamp | Command | ChatId | Username | PatientName | Room
 *          | Time | Medication | Dose | Indication | Response | Remark
 */
export async function saveMedicineRecord(data, nurseInfo) {
  const row = [
    ...metaColumns('med', nurseInfo),
    data.patientName ?? '',
    data.room        ?? '',
    data.time        ?? '',
    data.medication  ?? '',
    data.dose        ?? '',
    data.indication  ?? '',
    data.response    ?? '',
    data.remark      ?? '',
  ]
  await appendRow(TAB.med, row)
  log.info('[sheet] medicine record saved — patient:', data.patientName)
}

/**
 * Save a clinical alert to the "Alerts" tab.
 * Columns: Timestamp | Command | ChatId | Username | PatientName | Room
 *          | AlertTime | AlertType | Observation | ActionTaken | DoctorInformed | Remark
 */
export async function saveAlertRecord(data, nurseInfo) {
  const row = [
    ...metaColumns('alert', nurseInfo),
    data.patientName    ?? '',
    data.room           ?? '',
    data.time           ?? '',
    data.alertType      ?? '',
    data.observation    ?? '',
    data.actionTaken    ?? '',
    data.doctorInformed ?? '',
    data.remark         ?? '',
  ]
  await appendRow(TAB.alert, row)
  log.info('[sheet] alert record saved — patient:', data.patientName)
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

/** Map workflow name → save function */
const SAVE_FN = {
  admit:   saveAdmissionRecord,
  vitals:  saveVitalsRecord,
  fall:    saveFallRecord,
  turning: saveTurningRecord,
  rehab:   saveRehabRecord,
  med:     saveMedicineRecord,
  alert:   saveAlertRecord,
}

/**
 * Route to the correct save function by workflow name.
 * Returns { success: true } or { success: false, error: string }.
 *
 * @param {string} workflowName
 * @param {object} data
 * @param {object} nurseInfo  — { chatId, username, firstName }
 */
export async function saveToSheet(workflowName, data, nurseInfo = {}) {
  const fn = SAVE_FN[workflowName]
  if (!fn) {
    log.warn('[sheet] no save function for workflow:', workflowName)
    return { success: false, error: `No sheet handler for workflow: ${workflowName}` }
  }

  try {
    await fn(data, nurseInfo)
    return { success: true }
  } catch (err) {
    const msg = err?.message ?? String(err)
    log.error('[sheet] save failed:', msg)
    return { success: false, error: msg }
  }
}

/**
 * Quick config check — call on bot startup to surface missing credentials early.
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkSheetConfig() {
  const { sheetId, clientEmail, privateKey } = getCredentials()
  const missing = []
  if (!sheetId)     missing.push('GOOGLE_SHEET_ID')
  if (!clientEmail) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  if (!privateKey)  missing.push('GOOGLE_PRIVATE_KEY')
  return { ok: missing.length === 0, missing }
}
