import { useMemo, useState } from 'react'
import { CloudCog, Database, Download, RefreshCw, Send, Smartphone, Table2 } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { analyzeAllPatientsFromNotes } from '../lib/aiRiskDetection.js'
import {
  GOOGLE_SHEET_TABLES,
  exportCurrentData,
  getGoogleSheetConfig,
  getGoogleSheetStatusBadges,
  getDoctorReviewRecords,
  getEscalationRecords,
  getMedicationRecords,
  getAIRiskRecords,
  getVitalSigns,
  getShiftHandoverRecords,
  syncAllMockData,
  sendSampleNursingNoteToGoogleSheet,
  testGoogleSheetConnection,
} from '../lib/googleSheetSync.js'

function makeCsvRows(data) {
  const rows = []
  for (const [tableName, rowsPayload] of Object.entries(data)) {
    if (tableName === 'exportedAt') continue
    if (!Array.isArray(rowsPayload) || rowsPayload.length === 0) {
      rows.push([tableName, 'row_count', '0'])
      continue
    }
    for (const row of rowsPayload) {
      const columns = Object.keys(row)
      for (const column of columns) {
        rows.push([tableName, row.id || row.patientId || 'n/a', `${column}=${row[column]}`])
      }
    }
  }
  rows.unshift(['table', 'record_id', 'field=value'])
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
}

function toBadgeLabel(status) {
  if (status === 'synced') return 'Synced to Google Sheet'
  if (status === 'failed') return 'Sync failed'
  return 'Local only'
}

const tableOrder = [
  GOOGLE_SHEET_TABLES.patients,
  GOOGLE_SHEET_TABLES.nursing_notes,
  GOOGLE_SHEET_TABLES.vital_signs,
  GOOGLE_SHEET_TABLES.medications,
  GOOGLE_SHEET_TABLES.rehab_sessions,
  GOOGLE_SHEET_TABLES.ai_risks,
  GOOGLE_SHEET_TABLES.escalations,
  GOOGLE_SHEET_TABLES.shift_handover,
  GOOGLE_SHEET_TABLES.doctor_review,
]

function toTitleCase(value) {
  return String(value || '')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function GoogleSheetSettingsPage() {
  const { patients, getById } = usePatients()
  const { notes } = useNursingNotes()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [toastKind, setToastKind] = useState('info')

  const [connectionMessage, setConnectionMessage] = useState('')
  const [connectionState, setConnectionState] = useState('idle')

  const config = getGoogleSheetConfig()
  const tableStatuses = getGoogleSheetStatusBadges()
  const doctorReviewRows = useMemo(() => getDoctorReviewRecords(), [])
  const shiftHandoverRows = useMemo(() => getShiftHandoverRecords(), [])
  const vitalSignRows = useMemo(() => getVitalSigns(), [])
  const medicationRows = useMemo(() => getMedicationRecords(), [])
  const aiRiskRows = useMemo(() => getAIRiskRecords(), [])
  const escalationRows = useMemo(() => getEscalationRecords(), [])
  const riskAnalysis = useMemo(() => analyzeAllPatientsFromNotes(patients, notes, getById), [patients, notes, getById])

  const syncSummary = useMemo(() => {
    return tableOrder.map((table) => {
      const isDoctorReview = table === GOOGLE_SHEET_TABLES.doctor_review
      const isShiftHandover = table === GOOGLE_SHEET_TABLES.shift_handover
      const computedCount = isDoctorReview
        ? doctorReviewRows.length
        : isShiftHandover
          ? shiftHandoverRows.length
          : table === GOOGLE_SHEET_TABLES.patients
            ? patients.length
            : table === GOOGLE_SHEET_TABLES.nursing_notes
              ? notes.length
              : table === GOOGLE_SHEET_TABLES.vital_signs
                ? vitalSignRows.length
                : table === GOOGLE_SHEET_TABLES.medications
                  ? medicationRows.length
                  : table === GOOGLE_SHEET_TABLES.ai_risks
                    ? aiRiskRows.length
                    : table === GOOGLE_SHEET_TABLES.escalations
                      ? escalationRows.length
                      : tableStatuses[table]?.count || 0
      const statusInfo = tableStatuses[table] || { status: 'local_only', variant: 'warning', updatedAt: null, label: 'Local only' }
      return {
        table,
        label: toTitleCase(table),
        status: statusInfo.status,
        statusLabel: statusInfo.label || toBadgeLabel(statusInfo.status),
        statusVariant: statusInfo.variant || 'warning',
        count: computedCount,
        updatedAt: statusInfo.updatedAt,
      }
    })
  }, [
    patients.length,
    notes.length,
    tableStatuses,
    vitalSignRows.length,
    medicationRows.length,
    aiRiskRows.length,
    escalationRows.length,
    doctorReviewRows.length,
    shiftHandoverRows.length,
  ])

  function showToast(message, kind = 'success') {
    setToast(message)
    setToastKind(kind)
    window.setTimeout(() => {
      setToast(null)
    }, 3200)
  }

  async function handleTestConnection() {
    setBusy(true)
    setConnectionState('running')
    const result = await testGoogleSheetConnection()
    setConnectionState(result.ok ? 'connected' : 'failed')
    setConnectionMessage(result.message)
    showToast(result.message, result.ok ? 'success' : 'error')
    setBusy(false)
  }

  async function handleSyncMockData() {
    setBusy(true)
    try {
      const result = await syncAllMockData()
      if (result.ok) {
        showToast('Mock data sync completed. Some records may still be local-only in simulation mode.', 'success')
      } else {
        showToast('Sync completed with failed items. Open table statuses for details.', 'error')
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Sync failed unexpectedly.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleSendSampleNursingNote() {
    setBusy(true)
    try {
      const result = await sendSampleNursingNoteToGoogleSheet()
      const isSynced = result.status === 'synced'
      setConnectionState(isSynced ? 'connected' : result.status === 'failed' ? 'failed' : 'running')
      setConnectionMessage(result.message)
      showToast(result.message, isSynced ? 'success' : result.status === 'failed' ? 'error' : 'info')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to send sample nursing note row.', 'error')
      setConnectionState('failed')
      setConnectionMessage(error instanceof Error ? error.message : 'Failed to send sample nursing note row.')
    } finally {
      setBusy(false)
    }
  }

  function handleExport() {
    const data = exportCurrentData()
    const json = JSON.stringify(data, null, 2)
    const csv = makeCsvRows(data)
    const mode = window.prompt('Choose export type: "json" or "csv"', 'json')
    if (!mode) return
    const selected = mode.toLowerCase().trim()
    const fileType = selected === 'csv' ? 'text/csv' : 'application/json'
    const fileName = selected === 'csv' ? `google-sheet-export-${Date.now()}.csv` : `google-sheet-export-${Date.now()}.json`
    const content = selected === 'csv' ? csv : json
    const blob = new Blob([content], { type: fileType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
    showToast(`Exported current data as ${selected.toUpperCase()}.`, 'success')
  }

  return (
    <div>
      <PageHeader
        title="Google Sheet settings"
        description="Simulation-first integration panel for Google Apps Script webhook sync."
        action={
          <Badge variant={config.isSimulation ? 'warning' : 'success'}>
            {config.isSimulation ? 'Simulation mode' : `Live ${config.mode}`}
          </Badge>
        }
      />

      {toast ? (
        <div
          className={`mb-4 rounded-xl border px-3 py-2 text-sm font-semibold ${
            toastKind === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Google Sheet connection</h2>
              <p className="mt-1 text-sm text-slate-600">
                Add webhook URL and sheet ID to your environment for sync. Current mode: {config.mode}
              </p>
            </div>
            <Badge variant="default">
              <CloudCog className="mr-1 inline h-4 w-4" aria-hidden />
              {config.webhookUrl ? 'Webhook set' : 'Webhook missing'}
            </Badge>
          </div>
          <div className="mt-4 space-y-1 text-sm text-slate-700">
            <p>
              <span className="font-semibold">GOOGLE_SHEET_WEBHOOK_URL:</span>{' '}
              {config.webhookUrl ? `${config.webhookUrl.slice(0, 30)}…` : 'Not configured'}
            </p>
            <p>
              <span className="font-semibold">GOOGLE_SHEET_ID:</span>{' '}
              {config.sheetId || 'Not configured'}
            </p>
            <p>
              <span className="font-semibold">Sync status:</span>{' '}
              {config.webhookUrl ? (config.isSimulation ? 'Local-only simulation mode' : 'Live mode') : 'Needs webhook URL'}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Test Google Sheet Connection
            </button>
            <button
              type="button"
              onClick={handleSyncMockData}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" aria-hidden />
              Sync Mock Data
            </button>
            <button
              type="button"
              onClick={handleSendSampleNursingNote}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" aria-hidden />
              Send sample nursing note row
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export Current Data
            </button>
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <p className="font-semibold">Latest test result</p>
            <p className="mt-1">
              {connectionState === 'idle' ? 'Not tested this session.' : `${connectionState}: ${connectionMessage}`}
            </p>
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex items-center gap-2">
            <Table2 className="h-4 w-4 text-slate-600" aria-hidden />
            <h2 className="text-lg font-semibold text-slate-900">Google Sheet tables</h2>
          </div>
          <p className="text-sm text-slate-600">
            These tables are used in webhook payloads. Status reflects local cache and the last sync attempt per row.
          </p>
          <ul className="mt-4 space-y-3">
            {syncSummary.map((entry) => (
              <li key={entry.table} className="rounded-xl border border-slate-100 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{entry.label}</p>
                    <p className="text-xs text-slate-600">{entry.count} local row(s)</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={entry.statusVariant}>{entry.statusLabel}</Badge>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {entry.updatedAt ? `Updated ${new Date(entry.updatedAt).toLocaleString()}` : 'Never synced'}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-600" aria-hidden />
          <h2 className="text-lg font-semibold text-slate-900">Module snapshots</h2>
        </div>
        <p className="text-sm text-slate-600">Live-derived sample payloads used for sheet sync in simulation mode.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">High-risk patients</p>
            <p className="mt-1 text-sm text-slate-700">
              {riskAnalysis.filter((item) => item.overallScore >= 55 || item.anyEscalation).length} candidates currently
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">Doctor review rows</p>
            <p className="mt-1 text-sm text-slate-700">{doctorReviewRows.length} review entries</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">Shift handover rows</p>
            <p className="mt-1 text-sm text-slate-700">{shiftHandoverRows.length} handover row(s)</p>
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-slate-600" aria-hidden />
          <h2 className="text-lg font-semibold text-slate-900">Operational note</h2>
        </div>
        <p className="mt-2 text-sm text-slate-700">
          Starting in simulation mode keeps all local records in mock-only cache. Change environment variable
          <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs">GOOGLE_SHEET_MODE=live</code> to trigger real webhook posts.
        </p>
      </Card>
    </div>
  )
}
