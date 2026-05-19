import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPlus,
  RefreshCw,
  ScanHeart,
  Stethoscope,
  UserRoundPen,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import {
  appendHealthLoopNote,
  upsertHealthLoopInstance,
} from '../db/healthCheckLoopStorage.js'
import { HEALTH_LOOP_FREQUENCIES } from '../data/healthCheckLoopTypes.js'
import {
  listHealthLoopRows,
  buildHealthCheckAiRisks,
  formatHealthLoopTime,
  nextDueFromNow,
  suggestDemoReading,
} from '../lib/healthCheckLoopSimulation.js'

const btn =
  'rounded-xl px-2.5 py-2 text-xs font-semibold shadow-sm transition-colors disabled:opacity-45 disabled:pointer-events-none'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`

function readingBadge(status) {
  if (status === 'critical') return <Badge variant="danger">Critical</Badge>
  if (status === 'warning') return <Badge variant="warning">Warning</Badge>
  return <Badge variant="success">Normal</Badge>
}

export default function HealthCheckLoopPage() {
  const { patients } = usePatients()
  const [tick, setTick] = useState(0)
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-health-check-loops-updated', bump)
    return () => window.removeEventListener('wmc-health-check-loops-updated', bump)
  }, [])

  const patientsById = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p])), [patients])

  const rows = useMemo(() => listHealthLoopRows(patients), [patients, tick])

  const aiRisks = useMemo(() => buildHealthCheckAiRisks(rows, patientsById), [rows, patientsById])

  const filtered = useMemo(() => {
    if (filter === 'urgent') return rows.filter((r) => r.urgent)
    if (filter === 'critical') return rows.filter((r) => r.readingStatus === 'critical')
    if (filter === 'overdue') return rows.filter((r) => r.overdue)
    return rows
  }, [rows, filter])

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }

  function handleRecord(row) {
    const { placeholder, hint } = suggestDemoReading(row.checkTypeId)
    const text = window.prompt(`Record ${row.checkTypeLabel} — ${row.patientName}\n(${hint})`, placeholder)
    if (text === null) return
    const v = text.trim()
    if (!v) {
      showToast('No value entered.', 'warn')
      return
    }
    const now = Date.now()
    upsertHealthLoopInstance(row.key, {
      lastValue: v,
      lastRecordedAt: new Date().toISOString(),
      nextDueAt: nextDueFromNow(row.frequencyMinutes, now),
      doctorEscalated: false,
      cycleCompletedAt: null,
    })
    showToast('Reading saved (simulation).')
  }

  function handleComplete(row) {
    upsertHealthLoopInstance(row.key, {
      cycleCompletedAt: new Date().toISOString(),
      nextDueAt: nextDueFromNow(row.frequencyMinutes),
      doctorEscalated: false,
    })
    showToast('Loop marked completed — next due scheduled.')
  }

  function handleEscalate(row) {
    upsertHealthLoopInstance(row.key, { doctorEscalated: true })
    showToast('Flagged for doctor review (simulation).', 'warn')
  }

  function handleNote(row) {
    const text = window.prompt(`Nursing note — ${row.patientName} · ${row.checkTypeLabel}`, '')
    if (text === null) return
    appendHealthLoopNote(row.key, text)
    if (text.trim()) showToast('Note attached to loop.')
  }

  function handleRepeat(row) {
    upsertHealthLoopInstance(row.key, {
      nextDueAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    showToast('Repeat check queued (+30 min).')
  }

  function handleFrequencyChange(row, frequencyId) {
    const opt = HEALTH_LOOP_FREQUENCIES.find((f) => f.id === frequencyId)
    const minutes = opt?.minutes ?? row.frequencyMinutes
    upsertHealthLoopInstance(row.key, {
      frequencyId,
      frequencyMinutes: minutes,
      nextDueAt: nextDueFromNow(minutes),
    })
    showToast(`Cadence set to ${opt?.label ?? frequencyId}.`)
  }

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Health check loops"
        description="Recurring vital and assessment surveillance with simulated ranges and AI-style pattern hints. Demo only — not for clinical decisions."
        action={
          <Badge variant="info" className="self-start">
            Simulation mode
          </Badge>
        }
      />

      {toast ? (
        <div
          role="status"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
            toast.tone === 'warn'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : toast.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      <Card className="mb-6" padding="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ScanHeart className="h-5 w-5 text-teal-600" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-slate-900">AI risk detection</h3>
              <p className="text-sm text-slate-500">
                Fever / glucose / BP / SpO₂ / fluid balance / sepsis cluster / cognition — heuristic simulation
              </p>
            </div>
          </div>
          <Link
            to="/doctor-review"
            className="text-xs font-semibold text-teal-700 hover:underline"
          >
            Doctor review queue
          </Link>
        </div>
        {aiRisks.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No elevated patterns from current simulated readings.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {aiRisks.map((a) => (
              <li
                key={a.id}
                className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-sm"
              >
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    a.severity === 'critical' ? 'text-red-600' : a.severity === 'high' ? 'text-orange-600' : 'text-amber-600'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{a.title}</p>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{a.category}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{filtered.length}</span> loops · {patients.length} patients (demo roster)
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'urgent', label: 'Urgent' },
            { id: 'critical', label: 'Critical read' },
            { id: 'overdue', label: 'Missed due' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors ${
                filter === t.id ? 'bg-teal-600 text-white ring-teal-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}
              onClick={() => setFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((row) => (
          <Card
            key={row.key}
            className={`relative overflow-hidden ${row.readingStatus === 'critical' ? 'ring-2 ring-red-300/80' : ''}`}
            padding="p-4 sm:p-5"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-linear-to-br from-teal-400/15 to-cyan-500/10 blur-2xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                  <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  Room <span className="font-semibold">{row.room}</span>
                  {row.doctorEscalated ? (
                    <Badge variant="danger" className="ml-2">
                      MD review
                    </Badge>
                  ) : null}
                </p>
              </div>
              {readingBadge(row.readingStatus)}
            </div>

            <div className="relative mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Check type</span>
                <span className="text-right font-semibold text-slate-900">{row.checkTypeLabel}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Last value</span>
                <span className="text-right font-medium text-slate-800">{row.lastValue || '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Normal range</span>
                <span className="max-w-[60%] text-right text-xs leading-snug text-slate-600">{row.normalRange}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Last recorded</span>
                <span className="text-right text-slate-700">{formatHealthLoopTime(row.lastRecordedAt)}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-500">Next due</span>
                <span className="text-right">
                  <span className="font-medium text-slate-800">{formatHealthLoopTime(row.nextDueAt)}</span>
                  {row.overdue ? (
                    <Badge variant="danger" className="ml-2">
                      Overdue
                    </Badge>
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Nurse</span>
                <span className="text-right text-slate-800">{row.nurseAssigned}</span>
              </div>
              <div className="pt-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loop frequency</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-400/30"
                  value={row.frequencyId}
                  onChange={(e) => handleFrequencyChange(row, e.target.value)}
                >
                  {HEALTH_LOOP_FREQUENCIES.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="relative mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4">
              <button type="button" className={btnPrimary} onClick={() => handleRecord(row)}>
                <span className="inline-flex items-center gap-1">
                  <ClipboardPlus className="h-3.5 w-3.5" aria-hidden />
                  Record reading
                </span>
              </button>
              <button type="button" className={btnMuted} onClick={() => handleComplete(row)}>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Mark completed
                </span>
              </button>
              <button type="button" className={btnWarn} onClick={() => handleEscalate(row)}>
                Escalate doctor review
              </button>
              <button type="button" className={btnMuted} onClick={() => handleNote(row)}>
                <span className="inline-flex items-center gap-1">
                  <UserRoundPen className="h-3.5 w-3.5" aria-hidden />
                  Add nursing note
                </span>
              </button>
              <button type="button" className={btnDanger} onClick={() => handleRepeat(row)}>
                <span className="inline-flex items-center gap-1">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Repeat check
                </span>
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
