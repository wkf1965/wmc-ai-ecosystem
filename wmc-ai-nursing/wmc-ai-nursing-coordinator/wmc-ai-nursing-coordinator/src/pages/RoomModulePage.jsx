import { Component, lazy, Suspense, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { useTelegramDashboardSnapshot } from '../hooks/useTelegramDashboardSnapshot'

const PatientsroomRegistrationForm = lazy(() => import('../components/PatientsroomRegistrationForm.jsx'))

class RoomModuleErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[RoomModulePage] Uncaught render error:', error)
    console.error('[RoomModulePage] Component stack:', info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="space-y-4 px-4 pb-10 pt-6 md:px-8">
          <p className="rounded-lg border-2 border-teal-600 bg-teal-50 px-4 py-3 text-center text-sm font-bold text-teal-950">
            Room Module Loaded
          </p>
          <PageHeader
            title="Room Module"
            description="Something went wrong while rendering this page. Details are logged to the browser console."
          />
          <Card className="border-red-200 bg-red-50 text-sm text-red-900">
            <p className="font-semibold">Room Module crashed</p>
            <p className="mt-2 whitespace-pre-wrap">{String(this.state.error?.message || this.state.error)}</p>
            <p className="mt-3 text-xs text-red-800">
              Open DevTools → Console and look for <code className="rounded bg-white/80 px-1">[RoomModulePage]</code>.
            </p>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}

function RoomModuleContent() {
  const { snapshot, loading, error, refetch, generatedAt } = useTelegramDashboardSnapshot(15_000)

  useEffect(() => {
    console.log('[RoomModulePage] mounted', { path: typeof window !== 'undefined' ? window.location.pathname : '' })
  }, [])

  const rawBoard = snapshot?.roomModuleBoard
  const rows = Array.isArray(rawBoard) ? rawBoard : []
  if (snapshot && rawBoard != null && !Array.isArray(rawBoard)) {
    console.warn('[RoomModulePage] roomModuleBoard is not an array; falling back to empty list.', rawBoard)
  }

  const sheetPatients = snapshot?.sources?.googleSheet?.patientsroom
  const sheetReadFailed = Boolean(snapshot && sheetPatients && sheetPatients.ok === false)

  const showInitialLoading = loading && !snapshot && !error

  return (
    <div className="space-y-6 px-4 pb-10 pt-6 md:px-8">
      <p
        className="rounded-lg border-2 border-teal-600 bg-teal-50 px-4 py-3 text-center text-sm font-bold text-teal-950 shadow-sm"
        data-testid="room-module-loaded-banner"
      >
        Room Module Loaded
      </p>

      <PageHeader
        title="Room Module"
        description="Rooms from Google Sheet Patientsroom tab (room_number, patients_name), enriched with Telegram activity, Room_Status, and roster clinical columns."
        action={
          <Link
            to="/patient-registration"
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-teal-800 shadow-sm hover:bg-teal-50"
          >
            Full-page registration
          </Link>
        }
      />

      {showInitialLoading ? (
        <Card className="flex items-center gap-3 border-teal-100 bg-teal-50/60 text-sm text-slate-800">
          <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-teal-600" aria-hidden />
          <span>Loading room roster from dashboard API…</span>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-900">
          <p className="font-semibold">Could not load dashboard snapshot</p>
          <p className="mt-2">{error}</p>
          <p className="mt-2 text-xs text-red-800">
            Ensure <code className="rounded bg-white/90 px-1">npm run dev</code> is running (Vite serves{' '}
            <code className="rounded bg-white/90 px-1">/api/integrations/telegram/dashboard</code>). Check the console
            for <code className="rounded bg-white/90 px-1">[useTelegramDashboardSnapshot]</code>.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-100 px-4 py-2 text-xs font-semibold text-red-900 hover:bg-red-200"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Retry
          </button>
        </Card>
      ) : null}

      {sheetReadFailed ? (
        <Card className="border-amber-200 bg-amber-50 text-sm text-amber-950">
          <p className="font-semibold">Google Sheet — Patientsroom</p>
          <p className="mt-1">
            Roster read failed: {sheetPatients?.error || 'Unknown error'}. The table below may be empty until{' '}
            <code className="rounded bg-white px-1">GOOGLE_SHEET_MODE</code> is live/production and the webhook can read
            the spreadsheet.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => refetch()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh Room Roster
        </button>
        {generatedAt ? (
          <span className="text-xs text-slate-500">Updated {new Date(generatedAt).toLocaleString()}</span>
        ) : null}
      </div>

      <Card className="overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="border-b px-3 py-3">Room</th>
                <th className="border-b px-3 py-3">Patient</th>
                <th className="border-b px-3 py-3">Latest nursing note</th>
                <th className="border-b px-3 py-3">Risk level</th>
                <th className="border-b px-3 py-3">Mobility</th>
                <th className="border-b px-3 py-3">Appetite</th>
                <th className="border-b px-3 py-3">Fall risk</th>
                <th className="border-b px-3 py-3">Rehab</th>
                <th className="border-b px-3 py-3">Turning</th>
                <th className="border-b px-3 py-3">OT required</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                    {loading ? 'Loading roster…' : 'No rooms in roster.'}
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={String(r?.patientId ?? r?.room ?? idx)} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-medium text-slate-900">{r?.room ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-800">{r?.patientName ?? '—'}</td>
                    <td className="max-w-[300px] px-3 py-2 text-slate-700">{r?.latestNursingNote ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r?.riskLevel ?? '—'}</td>
                    <td className="px-3 py-2">{r?.mobilityStatus ?? '—'}</td>
                    <td className="px-3 py-2">{r?.appetiteStatus ?? '—'}</td>
                    <td className="px-3 py-2">{r?.fallRisk ?? '—'}</td>
                    <td className="px-3 py-2">{r?.rehabStatus ?? '—'}</td>
                    <td className="px-3 py-2">{r?.turningStatus ?? '—'}</td>
                    <td className="px-3 py-2">{r?.otRequired ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">Patient registration (Patientsroom)</h3>
        <p className="mb-4 text-sm text-slate-600">
          Add or update a row by room number. After saving, use <strong>Refresh Room Roster</strong> to pull the latest Sheet
          data.
        </p>
        <Card padding="p-5 sm:p-8">
          <Suspense
            fallback={
              <p className="text-sm text-slate-600">Loading patient registration form…</p>
            }
          >
            <PatientsroomRegistrationForm formIdPrefix="rm-" onSaved={() => refetch()} />
          </Suspense>
        </Card>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Sheet tabs (exact names): <code className="text-slate-700">Patientsroom</code> —{' '}
        <code className="text-slate-700">room_number</code>, <code className="text-slate-700">patients_name</code>, and
        clinical columns; <code className="text-slate-700">room_status</code> — updated per Telegram message;{' '}
        <code className="text-slate-700">room_module_nursing_notes</code> — canonical nursing log (
        timestamp, room_number, patient_name, nurse_name, message, category, risk_level, action, source). Legacy{' '}
        <code className="text-slate-700">nursing_notes</code> routing tabs still receive Telegram structured rows.
      </p>
    </div>
  )
}

export default function RoomModulePage() {
  useEffect(() => {
    console.log('[RoomModulePage] shell render')
  }, [])
  return (
    <RoomModuleErrorBoundary>
      <RoomModuleContent />
    </RoomModuleErrorBoundary>
  )
}
