/**
 * Read tab rows from Google Sheet via deployed Apps Script (action: read_table).
 * Used by the Telegram Node webhook — requires GOOGLE_SHEET_MODE=live and GOOGLE_SHEET_WEBHOOK_URL.
 */

import { normalizePatientRecord } from './src/lib/patientRosterResolve.js'

function envStr(k) {
  return String(process.env[k] || process.env[`VITE_${k}`] || '').trim()
}

function webhookUrlAbsolute(webhookUrl) {
  let href = String(webhookUrl || '').trim()
  if (!href) return ''
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`
  return href
}

/**
 * Telegram roster: GET only, no cache — matches Apps Script doGet(?action=read_table&sheet=Patientsroom).
 */
async function readPatientsroomTableGET(webhookUrl, sheetId) {
  const base = webhookUrlAbsolute(webhookUrl)
  if (!base) {
    return { ok: false, error: 'GOOGLE_SHEET_WEBHOOK_URL is not configured.', rows: [] }
  }
  const url = new URL(base)
  url.searchParams.set('action', 'read_table')
  url.searchParams.set('sheet', 'Patientsroom')
  if (sheetId) url.searchParams.set('sheetId', sheetId)

  const res = await fetch(url.href, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text }
  }
  if (!res.ok || body.ok === false) {
    return {
      ok: false,
      error: body.error || body.message || `HTTP ${res.status}`,
      rows: [],
    }
  }
  const rows = Array.isArray(body.rows) ? body.rows : []
  return { ok: true, rows }
}

/**
 * @param {string} table — e.g. patientsroom | nursing_notes
 * @returns {Promise<{ ok: boolean, rows?: object[], error?: string }>}
 */
export async function readGoogleSheetTable(table) {
  const mode = envStr('GOOGLE_SHEET_MODE').toLowerCase() || 'simulation'
  const webhookUrl = envStr('GOOGLE_SHEET_WEBHOOK_URL')
  const sheetId = envStr('GOOGLE_SHEET_ID')

  if (mode !== 'live' && mode !== 'production') {
    return {
      ok: false,
      error: 'GOOGLE_SHEET_MODE must be live or production to load roster from Google Sheets.',
      rows: [],
    }
  }
  if (!webhookUrl) {
    return { ok: false, error: 'GOOGLE_SHEET_WEBHOOK_URL is not configured.', rows: [] }
  }

  const t = String(table || '').trim().toLowerCase()
  if (t === 'patientsroom') {
    try {
      return await readPatientsroomTableGET(webhookUrl, sheetId)
    } catch (e) {
      return { ok: false, error: String(e?.message || e), rows: [] }
    }
  }

  try {
    const res = await fetch(webhookUrlAbsolute(webhookUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'read_table',
        table: t,
        sheetId: sheetId || undefined,
      }),
    })
    const text = await res.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text }
    }
    if (!res.ok || body.ok === false) {
      return {
        ok: false,
        error: body.error || body.message || `HTTP ${res.status}`,
        rows: [],
      }
    }
    const rows = Array.isArray(body.rows) ? body.rows : []
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: String(e?.message || e), rows: [] }
  }
}

/**
 * Roster only: Google Sheet tab **Patientsroom** via GET read_table (physical tab **Patientsroom**).
 * Never use `nursing_notes` as roster. Telegram resolves **room_number** → **patient_name** on tab **Patientsroom** only.
 */
export async function fetchPatientsFromGoogleSheet() {
  const result = await readGoogleSheetTable('patientsroom')
  const rawRows = Array.isArray(result.rows) ? result.rows : []
  console.log('Loaded Patientsroom rows:', rawRows)
  for (const rr of rawRows) {
    const pname = String(rr?.patient_name ?? rr?.patientName ?? '').trim()
    console.log('patientName:', JSON.stringify(pname))
  }

  if (!result.ok) {
    return result
  }

  const patientsroom = rawRows.map(normalizePatientRecord).filter(Boolean)
  if (rawRows.length > 0 && patientsroom.length === 0) {
    console.warn(
      '[Patientsroom] API returned rows but none normalized — verify headers are exactly room_number and patient_name.',
    )
  }

  return { ok: true, rows: patientsroom }
}

export async function fetchNursingNotesFromGoogleSheet() {
  return readGoogleSheetTable('nursing_notes')
}
