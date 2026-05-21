/**
 * Sheet Read Service — Stage 4
 *
 * Reads today's nursing records from each Google Sheet tab.
 * Returns structured objects ready for the AI handover prompt.
 *
 * Column order matches googleSheetService.js — any schema change there
 * must be reflected here.
 *
 * Tab layouts (0-indexed columns):
 *   All tabs:  [0]Timestamp [1]Command [2]ChatId [3]Username …workflow fields
 */

import { google }  from 'googleapis'
import { log }     from '../utils/logger.js'

// ── Auth (lazy — reads env at call time so dotenv has loaded first) ──────────

function createAuth() {
  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  return new google.auth.JWT({
    email,
    key:    privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

// ── Today date string helper ─────────────────────────────────────────────────
// Timestamps saved by googleSheetService use en-MY locale → "DD/MM/YYYY, HH:MM:SS"
// We filter by the DD/MM/YYYY portion.

function todayDateString() {
  const now = new Date()
  const dd   = String(now.getDate()).padStart(2, '0')
  const mm   = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function isToday(timestamp = '') {
  return String(timestamp).includes(todayDateString())
}

// ── Generic tab reader ───────────────────────────────────────────────────────

/**
 * Fetch all rows from a sheet tab (excluding header row if present).
 * Returns [] on error.
 */
async function readTab(tabName) {
  const sheetId    = process.env.GOOGLE_SHEET_ID ?? ''
  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ''
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  if (!sheetId || !email || !privateKey) {
    log.warn('[sheet-read] credentials not configured — cannot read sheet')
    return []
  }
  try {
    const sheets = google.sheets({ version: 'v4', auth: createAuth() })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:Z`,
    })
    const rows = res.data.values ?? []
    // If first row is a header (contains "Timestamp" text), skip it
    if (rows.length > 0 && String(rows[0][0]).toLowerCase().includes('timestamp')) {
      return rows.slice(1)
    }
    return rows
  } catch (err) {
    log.error(`[sheet-read] failed to read tab "${tabName}":`, err?.message)
    return []
  }
}

// ── Column mappers ───────────────────────────────────────────────────────────
// Each mapper converts a raw row array → labelled object.

const mapAdmission = (r) => ({
  timestamp:     r[0]  ?? '',
  nurseName:     r[3]  ?? '',
  patientName:   r[4]  ?? '',
  age:           r[5]  ?? '',
  gender:        r[6]  ?? '',
  room:          r[7]  ?? '',
  diagnosis:     r[8]  ?? '',
  doctor:        r[9]  ?? '',
  admissionDate: r[10] ?? '',
  remark:        r[11] ?? '',
})

const mapVitals = (r) => ({
  timestamp:   r[0] ?? '',
  nurseName:   r[3] ?? '',
  patientName: r[4] ?? '',
  room:        r[5] ?? '',
  bp:          r[6] ?? '',
  pulse:       r[7] ?? '',
  temperature: r[8] ?? '',
  spo2:        r[9] ?? '',
  bloodSugar:  r[10] ?? '',
  remark:      r[11] ?? '',
})

const mapFall = (r) => ({
  timestamp:      r[0]  ?? '',
  nurseName:      r[3]  ?? '',
  patientName:    r[4]  ?? '',
  room:           r[5]  ?? '',
  time:           r[6]  ?? '',
  whatHappened:   r[7]  ?? '',
  injury:         r[8]  ?? '',
  actionTaken:    r[9]  ?? '',
  doctorInformed: r[10] ?? '',
  familyInformed: r[11] ?? '',
  remark:         r[12] ?? '',
})

const mapTurning = (r) => ({
  timestamp:     r[0] ?? '',
  nurseName:     r[3] ?? '',
  patientName:   r[4] ?? '',
  room:          r[5] ?? '',
  time:          r[6] ?? '',
  position:      r[7] ?? '',
  skinCondition: r[8] ?? '',
  remark:        r[9] ?? '',
})

const mapRehab = (r) => ({
  timestamp:   r[0]  ?? '',
  nurseName:   r[3]  ?? '',
  patientName: r[4]  ?? '',
  room:        r[5]  ?? '',
  date:        r[6]  ?? '',
  therapist:   r[7]  ?? '',
  sessionType: r[8]  ?? '',
  progress:    r[9]  ?? '',
  nextGoal:    r[10] ?? '',
  remark:      r[11] ?? '',
})

const mapMedicine = (r) => ({
  timestamp:   r[0]  ?? '',
  nurseName:   r[3]  ?? '',
  patientName: r[4]  ?? '',
  room:        r[5]  ?? '',
  time:        r[6]  ?? '',
  medication:  r[7]  ?? '',
  dose:        r[8]  ?? '',
  indication:  r[9]  ?? '',
  response:    r[10] ?? '',
  remark:      r[11] ?? '',
})

const mapAlert = (r) => ({
  timestamp:      r[0]  ?? '',
  nurseName:      r[3]  ?? '',
  patientName:    r[4]  ?? '',
  room:           r[5]  ?? '',
  time:           r[6]  ?? '',
  alertType:      r[7]  ?? '',
  observation:    r[8]  ?? '',
  actionTaken:    r[9]  ?? '',
  doctorInformed: r[10] ?? '',
  remark:         r[11] ?? '',
})

// ── Public read functions ─────────────────────────────────────────────────────

export async function getTodayAdmissions() {
  const rows = await readTab('Admissions')
  return rows.filter(r => isToday(r[0])).map(mapAdmission)
}

export async function getTodayVitals() {
  const rows = await readTab('Vitals')
  return rows.filter(r => isToday(r[0])).map(mapVitals)
}

export async function getTodayFalls() {
  const rows = await readTab('Falls')
  return rows.filter(r => isToday(r[0])).map(mapFall)
}

export async function getTodayTurning() {
  const rows = await readTab('Turning')
  return rows.filter(r => isToday(r[0])).map(mapTurning)
}

export async function getTodayRehab() {
  const rows = await readTab('Rehab')
  return rows.filter(r => isToday(r[0])).map(mapRehab)
}

export async function getTodayMedicine() {
  const rows = await readTab('Medicine')
  return rows.filter(r => isToday(r[0])).map(mapMedicine)
}

export async function getTodayAlerts() {
  const rows = await readTab('Alerts')
  return rows.filter(r => isToday(r[0])).map(mapAlert)
}

/**
 * Fetch all 7 categories in parallel.
 * @returns {Promise<{
 *   admissions: object[], vitals: object[], falls: object[],
 *   turning: object[], rehab: object[], medicine: object[], alerts: object[]
 * }>}
 */
export async function getAllTodayRecords() {
  const [admissions, vitals, falls, turning, rehab, medicine, alerts] =
    await Promise.all([
      getTodayAdmissions(),
      getTodayVitals(),
      getTodayFalls(),
      getTodayTurning(),
      getTodayRehab(),
      getTodayMedicine(),
      getTodayAlerts(),
    ])

  log.info(
    `[sheet-read] today's records — admissions:${admissions.length} vitals:${vitals.length}` +
    ` falls:${falls.length} turning:${turning.length} rehab:${rehab.length}` +
    ` medicine:${medicine.length} alerts:${alerts.length}`,
  )

  return { admissions, vitals, falls, turning, rehab, medicine, alerts }
}

/**
 * Returns true if there is at least one record across all categories.
 */
export function hasAnyRecords(records) {
  return Object.values(records).some(arr => arr.length > 0)
}
