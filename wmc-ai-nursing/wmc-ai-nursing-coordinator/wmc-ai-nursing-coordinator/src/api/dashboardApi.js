/**
 * WMC AI Backend — dashboard API.
 * VITE_API_BASE_URL=http://localhost:4000 (host only; /api/v1 is appended).
 */

import { clearBrowserLocalStorage, clearPatientRecordsLocalStorage } from '../lib/clearAllLocalData.js'

export function resolveApiBase() {
  const raw = import.meta.env.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')
    : 'http://localhost:4000'
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`
}

export const API_BASE = resolveApiBase()

function backendOfflineError(cause) {
  const err = new Error('Backend offline')
  err.name = 'BackendOfflineError'
  if (cause) err.cause = cause
  return err
}

/**
 * GET /api/v1/dashboard — summary + nursing records + side turning + OT + alerts.
 */
export async function fetchDashboard() {
  const url = `${API_BASE}/dashboard`
  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (cause) {
    throw backendOfflineError(cause)
  }

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    if (!res.ok) {
      throw backendOfflineError(new Error(`Invalid JSON (HTTP ${res.status})`))
    }
    throw new Error(`Invalid JSON from ${url}`)
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || text || res.statusText
    if (res.status >= 500 || res.status === 0) {
      throw backendOfflineError(new Error(`HTTP ${res.status}: ${msg}`))
    }
    throw new Error(`HTTP ${res.status}: ${msg}`)
  }

  return { url, ...data }
}

export const DELETE_RECORDS_CONFIRM =
  'Are you sure you want to delete all old records?'

export const DELETE_RECORDS_SUCCESS = 'Records deleted successfully'

/**
 * DELETE /api/v1/admin/reset — wipe stored mock backend records.
 */
export async function resetAdminRecords() {
  const url = `${API_BASE}/admin/reset`
  let res
  try {
    res = await fetch(url, { method: 'DELETE', headers: { Accept: 'application/json' } })
  } catch (cause) {
    throw backendOfflineError(cause)
  }

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`Invalid JSON from ${url}`)
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || text || res.statusText
    throw new Error(`HTTP ${res.status}: ${msg}`)
  }

  console.log('[WMC Admin] DELETE /admin/reset response:', data)
  return { url, ...data }
}

/**
 * Delete all stored records: backend reset, then browser localStorage.
 */
export async function deleteAllOldRecords() {
  const backend = await resetAdminRecords()
  clearBrowserLocalStorage()
  return {
    ok: true,
    message: DELETE_RECORDS_SUCCESS,
    backend,
  }
}

export const RESET_PATIENTS_CONFIRM =
  'Are you sure you want to delete all patient records? This removes patients, nursing notes, side turning, OT, alerts, and rehab progress.'

export const RESET_PATIENTS_SUCCESS = 'Patient records cleared'

/**
 * DELETE /api/v1/admin/reset-patients — wipe patient-linked stored data.
 */
export async function resetPatientRecords() {
  const url = `${API_BASE}/admin/reset-patients`
  let res
  try {
    res = await fetch(url, { method: 'DELETE', headers: { Accept: 'application/json' } })
  } catch (cause) {
    throw backendOfflineError(cause)
  }

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`Invalid JSON from ${url}`)
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || text || res.statusText
    throw new Error(`HTTP ${res.status}: ${msg}`)
  }

  console.log('[WMC Admin] DELETE /admin/reset-patients response:', data)
  return { url, ...data }
}

/**
 * Reset patient records on backend, then clear patient-linked browser storage.
 */
export async function deletePatientRecords() {
  const backend = await resetPatientRecords()
  clearPatientRecordsLocalStorage()
  return {
    ok: true,
    message: RESET_PATIENTS_SUCCESS,
    backend,
  }
}
