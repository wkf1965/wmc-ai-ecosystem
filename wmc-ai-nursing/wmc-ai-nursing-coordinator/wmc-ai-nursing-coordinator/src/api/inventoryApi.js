/**
 * Inventory API Client
 *
 * Calls the backend REST endpoints at /api/inventory/*.
 * In the Vite dev server these requests are proxied to port 3001 (webhook server).
 * In production set VITE_INVENTORY_API_BASE to point to the deployed server.
 *
 * All functions:
 *  - Return a consistent { ok, data, source, warning? } shape.
 *  - Fall back to localStorage data (from inventoryStorage.js) when the backend
 *    is unavailable (network error, server not running, etc.).
 *  - Never throw — callers can assume a resolved promise.
 */

import {
  getAllInventoryLogs,
  getCurrentStockBalance,
  getCurrentAlerts,
  getPatientUsage,
  getNurseUsage,
  addInventoryLog,
} from '../db/inventoryStorage.js'

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Base URL for all inventory API calls.
 *
 * Dev  → empty string (Vite proxy handles /api/inventory/… → :3001)
 * Prod → set VITE_INVENTORY_API_BASE=https://your-server.com
 */
const BASE = (import.meta.env?.VITE_INVENTORY_API_BASE ?? '').replace(/\/$/, '')

const TIMEOUT_MS = 8000   // 8 s before falling back to localStorage

// ── Core fetch wrapper ────────────────────────────────────────────────────────

/**
 * Fetch with a timeout.  Returns the parsed JSON or throws on error / timeout.
 */
async function apiFetch(path, options = {}) {
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// ── Public API functions ──────────────────────────────────────────────────────

/**
 * GET /api/inventory/logs
 * @param {{ date?: string, month?: string, limit?: number }} [params]
 * @returns {Promise<{ ok: boolean, logs: object[], source: string, warning?: string }>}
 */
export async function fetchInventoryLogs(params = {}) {
  try {
    const qs = new URLSearchParams()
    if (params.date)  qs.set('date',  params.date)
    if (params.month) qs.set('month', params.month)
    if (params.limit) qs.set('limit', String(params.limit))
    const data = await apiFetch(`/api/inventory/logs?${qs}`)
    return { ok: true, logs: data.logs ?? [], source: data.source ?? 'api' }
  } catch {
    // Fallback: localStorage
    const logs = getAllInventoryLogs()
    return { ok: true, logs, source: 'localStorage', warning: 'Backend unavailable — showing local data.' }
  }
}

/**
 * GET /api/inventory/stock
 * @returns {Promise<{ ok: boolean, balance: object, source: string }>}
 */
export async function fetchStockBalance() {
  try {
    const data = await apiFetch('/api/inventory/stock')
    return { ok: true, balance: data.balance ?? {}, source: data.source ?? 'api' }
  } catch {
    return { ok: true, balance: getCurrentStockBalance(), source: 'localStorage', warning: 'Backend unavailable.' }
  }
}

/**
 * GET /api/inventory/alerts
 * @returns {Promise<{ ok: boolean, alerts: object[], source: string }>}
 */
export async function fetchStockAlerts() {
  try {
    const data = await apiFetch('/api/inventory/alerts')
    return { ok: true, alerts: data.alerts ?? [], source: data.source ?? 'api' }
  } catch {
    return { ok: true, alerts: getCurrentAlerts(), source: 'localStorage', warning: 'Backend unavailable.' }
  }
}

/**
 * GET /api/inventory/patient-usage?month=YYYY-MM
 * @param {string} [month]
 * @returns {Promise<{ ok: boolean, usage: object[], source: string }>}
 */
export async function fetchPatientUsage(month) {
  try {
    const qs = month ? `?month=${month}` : ''
    const data = await apiFetch(`/api/inventory/patient-usage${qs}`)
    return { ok: true, usage: data.usage ?? [], source: data.source ?? 'api' }
  } catch {
    return { ok: true, usage: getPatientUsage(month), source: 'localStorage', warning: 'Backend unavailable.' }
  }
}

/**
 * GET /api/inventory/nurse-usage?month=YYYY-MM
 * @param {string} [month]
 * @returns {Promise<{ ok: boolean, usage: object[], source: string }>}
 */
export async function fetchNurseUsage(month) {
  try {
    const qs = month ? `?month=${month}` : ''
    const data = await apiFetch(`/api/inventory/nurse-usage${qs}`)
    return { ok: true, usage: data.usage ?? [], source: data.source ?? 'api' }
  } catch {
    return { ok: true, usage: getNurseUsage(month), source: 'localStorage', warning: 'Backend unavailable.' }
  }
}

/**
 * POST /api/inventory/add
 * @param {object} record
 * @returns {Promise<{ ok: boolean, record: object, saved: string }>}
 */
export async function postInventoryAdd(record) {
  // Always write to localStorage first (instant, offline-safe)
  const localRecord = addInventoryLog(record)

  try {
    const data = await apiFetch('/api/inventory/add', {
      method: 'POST',
      body:   JSON.stringify(record),
    })
    return { ok: true, record: data.record ?? localRecord, saved: data.saved ?? 'sheet' }
  } catch {
    return { ok: true, record: localRecord, saved: 'localStorage', warning: 'Backend unavailable — saved locally only.' }
  }
}

// ── Billing API functions ─────────────────────────────────────────────────────

/** GET /api/inventory/billing */
export async function fetchBilling({ month, patient_name, room, billing_status } = {}) {
  try {
    const qs = new URLSearchParams()
    if (month)          qs.set('month',          month)
    if (patient_name)   qs.set('patient_name',   patient_name)
    if (room)           qs.set('room',            room)
    if (billing_status) qs.set('billing_status',  billing_status)
    const d = await apiFetch(`/api/inventory/billing?${qs}`)
    return { ok: true, billing: d.billing ?? [], prices: d.prices ?? {}, count: d.count ?? 0, source: d.source ?? 'api' }
  } catch {
    return { ok: false, billing: [], prices: {}, count: 0, source: 'error', warning: 'Backend unavailable.' }
  }
}

/** POST /api/inventory/billing/generate */
export async function generateBilling({ month, patient_name } = {}) {
  try {
    const d = await apiFetch('/api/inventory/billing/generate', {
      method: 'POST',
      body: JSON.stringify({ month, patient_name }),
    })
    return { ok: true, generated: d.generated ?? 0, source: d.source ?? 'api', warning: d.warning }
  } catch {
    return { ok: false, generated: 0, source: 'error', warning: 'Backend unavailable.' }
  }
}

/** POST /api/inventory/billing/update-price */
export async function updateBillingPrice(category, unit_price) {
  try {
    const d = await apiFetch('/api/inventory/billing/update-price', {
      method: 'POST',
      body: JSON.stringify({ category, unit_price }),
    })
    return { ok: true, prices: d.prices ?? {} }
  } catch {
    return { ok: false, prices: {}, warning: 'Backend unavailable.' }
  }
}

/** POST /api/inventory/billing/mark-paid */
export async function markBillingPaid({ month, patient_name, billing_status = 'Paid', remarks } = {}) {
  try {
    const d = await apiFetch('/api/inventory/billing/mark-paid', {
      method: 'POST',
      body: JSON.stringify({ month, patient_name, billing_status, remarks }),
    })
    return { ok: true, updated_rows: d.updated_rows ?? 0, warning: d.warning }
  } catch {
    return { ok: false, updated_rows: 0, warning: 'Backend unavailable.' }
  }
}

/** GET /api/inventory/billing/prices */
export async function fetchBillingPrices() {
  try {
    const d = await apiFetch('/api/inventory/billing/prices')
    return { ok: true, prices: d.prices ?? {}, defaults: d.defaults ?? {} }
  } catch {
    return { ok: false, prices: {}, defaults: {} }
  }
}

// ── Report API functions ──────────────────────────────────────────────────────

/**
 * GET /api/inventory/report/daily?date=YYYY-MM-DD
 */
export async function fetchDailyReport(date) {
  try {
    const qs = date ? `?date=${date}` : ''
    const d  = await apiFetch(`/api/inventory/report/daily${qs}`)
    return { ok: true, ...d, source: d.source ?? 'api' }
  } catch {
    return { ok: false, byCategory: {}, byItem: {}, totalQty: 0, recordCount: 0, source: 'error', warning: 'Backend unavailable.' }
  }
}

/**
 * GET /api/inventory/report/monthly-patient?month=YYYY-MM
 */
export async function fetchMonthlyPatientReport(month) {
  try {
    const qs = month ? `?month=${month}` : ''
    const d  = await apiFetch(`/api/inventory/report/monthly-patient${qs}`)
    return { ok: true, patients: d.patients ?? [], month: d.month, source: d.source ?? 'api' }
  } catch {
    return { ok: false, patients: [], source: 'error', warning: 'Backend unavailable.' }
  }
}

/**
 * GET /api/inventory/report/monthly-nurse?month=YYYY-MM
 */
export async function fetchMonthlyNurseReport(month) {
  try {
    const qs = month ? `?month=${month}` : ''
    const d  = await apiFetch(`/api/inventory/report/monthly-nurse${qs}`)
    return { ok: true, nurses: d.nurses ?? [], month: d.month, source: d.source ?? 'api' }
  } catch {
    return { ok: false, nurses: [], source: 'error', warning: 'Backend unavailable.' }
  }
}

/**
 * GET /api/inventory/report/low-stock
 */
export async function fetchLowStockReport() {
  try {
    const d = await apiFetch('/api/inventory/report/low-stock')
    return { ok: true, alerts: d.alerts ?? [], count: d.count ?? 0, source: d.source ?? 'api' }
  } catch {
    return { ok: false, alerts: [], count: 0, source: 'error', warning: 'Backend unavailable.' }
  }
}

/**
 * GET /api/inventory/report/abnormal?date=YYYY-MM-DD
 */
export async function fetchAbnormalReport(date) {
  try {
    const qs = date ? `?date=${date}` : ''
    const d  = await apiFetch(`/api/inventory/report/abnormal${qs}`)
    return { ok: true, abnormal: d.abnormal ?? [], count: d.count ?? 0, source: d.source ?? 'api' }
  } catch {
    return { ok: false, abnormal: [], count: 0, source: 'error', warning: 'Backend unavailable.' }
  }
}

// ── Stage 9: Health check + Seed data ────────────────────────────────────────

/**
 * GET /api/inventory/health
 * Returns operational status of all inventory sub-systems.
 */
export async function fetchInventoryHealth() {
  try {
    const d = await apiFetch('/api/inventory/health')
    return { ok: true, ...d }
  } catch {
    return {
      ok: false,
      status: 'unreachable',
      services: {
        inventory:    'unknown',
        googleSheets: 'unknown',
        telegram:     'unknown',
        dashboard:    'unknown',
      },
      warning: 'Backend server is not running. Start with: npm run telegram',
    }
  }
}

/**
 * POST /api/inventory/seed-test-data
 * Populates the system with realistic test records.
 */
export async function seedTestData() {
  try {
    const d = await apiFetch('/api/inventory/seed-test-data', { method: 'POST' })
    return { ok: true, ...d }
  } catch (err) {
    throw new Error(err.message ?? 'Backend unavailable')
  }
}

// ── Stage 8: Admin Stock Control API functions ────────────────────────────────

/**
 * POST /api/inventory/stock/add
 * @param {string} itemKey
 * @param {number} qty
 * @param {string} [remarks]
 */
export async function addStockApi(itemKey, qty, remarks) {
  try {
    const d = await apiFetch('/api/inventory/stock/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_key: itemKey, qty, remarks }),
    })
    return { ok: true, balance: d.balance, opening_stock: d.opening_stock, source: d.source ?? 'api' }
  } catch (err) {
    throw new Error(err.message ?? 'Backend unavailable')
  }
}

/**
 * POST /api/inventory/stock/adjust
 * @param {string} itemKey
 * @param {number} newBalance
 * @param {string} [reason]
 */
export async function adjustStockApi(itemKey, newBalance, reason) {
  try {
    const d = await apiFetch('/api/inventory/stock/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_key: itemKey, new_balance: newBalance, reason }),
    })
    return { ok: true, balance: d.balance, source: d.source ?? 'api' }
  } catch (err) {
    throw new Error(err.message ?? 'Backend unavailable')
  }
}

/**
 * POST /api/inventory/stock/set-minimum
 * @param {string} itemKey
 * @param {number} minimumLevel
 */
export async function setMinimumApi(itemKey, minimumLevel) {
  try {
    const d = await apiFetch('/api/inventory/stock/set-minimum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_key: itemKey, minimum_level: minimumLevel }),
    })
    return { ok: true, minimum_level: d.minimum_level, source: d.source ?? 'api' }
  } catch (err) {
    throw new Error(err.message ?? 'Backend unavailable')
  }
}

/**
 * POST /api/inventory/price/set
 * @param {string} category   pampers | wet | milk | gloves
 * @param {number} unitPrice
 */
export async function setPriceApi(category, unitPrice) {
  try {
    const d = await apiFetch('/api/inventory/price/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, unit_price: unitPrice }),
    })
    return { ok: true, prices: d.prices, source: 'api' }
  } catch (err) {
    throw new Error(err.message ?? 'Backend unavailable')
  }
}

// ── Stage 7: Audit Trail API functions ───────────────────────────────────────

/**
 * GET /api/inventory/audit
 * @param {{ date?, month?, nurse?, patient?, item_key?, limit? }} [opts]
 */
export async function fetchAuditTrail(opts = {}) {
  try {
    const qs = new URLSearchParams(Object.fromEntries(
      Object.entries(opts).filter(([, v]) => v !== undefined && v !== '')
    )).toString()
    const d = await apiFetch(`/api/inventory/audit${qs ? '?' + qs : ''}`)
    return { ok: true, records: d.records ?? [], source: d.source ?? 'api' }
  } catch {
    return { ok: false, records: [], source: 'error', warning: 'Backend unavailable.' }
  }
}

/**
 * GET /api/inventory/audit/by-nurse?name=&date=
 */
export async function fetchAuditByNurse(name, date) {
  try {
    const qs = new URLSearchParams({ name: name ?? '', ...(date ? { date } : {}) }).toString()
    const d  = await apiFetch(`/api/inventory/audit/by-nurse?${qs}`)
    return { ok: true, records: d.records ?? [], suspicious: d.suspicious ?? [], source: d.source ?? 'api' }
  } catch {
    return { ok: false, records: [], suspicious: [], source: 'error', warning: 'Backend unavailable.' }
  }
}

/**
 * GET /api/inventory/audit/by-patient?name=&month=
 */
export async function fetchAuditByPatient(name, month) {
  try {
    const qs = new URLSearchParams({ name: name ?? '', ...(month ? { month } : {}) }).toString()
    const d  = await apiFetch(`/api/inventory/audit/by-patient?${qs}`)
    return { ok: true, records: d.records ?? [], source: d.source ?? 'api' }
  } catch {
    return { ok: false, records: [], source: 'error', warning: 'Backend unavailable.' }
  }
}

/**
 * GET /api/inventory/audit/by-item?item_key=&date=
 */
export async function fetchAuditByItem(itemKey, date) {
  try {
    const qs = new URLSearchParams({ item_key: itemKey ?? '', ...(date ? { date } : {}) }).toString()
    const d  = await apiFetch(`/api/inventory/audit/by-item?${qs}`)
    return { ok: true, records: d.records ?? [], source: d.source ?? 'api' }
  } catch {
    return { ok: false, records: [], source: 'error', warning: 'Backend unavailable.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all data needed for the full inventory dashboard in one parallel call.
 * Returns { logs, balance, alerts, patientUsage, nurseUsage, source }.
 */
export async function fetchDashboardData(month) {
  const [logsRes, stockRes, alertsRes, patientRes, nurseRes] = await Promise.all([
    fetchInventoryLogs(),
    fetchStockBalance(),
    fetchStockAlerts(),
    fetchPatientUsage(month),
    fetchNurseUsage(month),
  ])

  // Determine data source (sheet > api > demo > localStorage)
  const sources = [logsRes.source, stockRes.source, patientRes.source]
  const source  = sources.includes('sheet')
    ? 'sheet'
    : sources.includes('api')
    ? 'api'
    : sources.includes('demo')
    ? 'demo'
    : 'localStorage'

  return {
    logs:         logsRes.logs,
    balance:      stockRes.balance,
    alerts:       alertsRes.alerts,
    patientUsage: patientRes.usage,
    nurseUsage:   nurseRes.usage,
    source,
    warnings: [logsRes.warning, stockRes.warning, alertsRes.warning]
      .filter(Boolean),
  }
}
