import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BellRing, CheckCircle2, ClipboardList, Clock } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import {
  appendLoopNote,
  appendScoreHistory,
  upsertLoopInstance,
  scoreCountsFromHistory,
} from '../db/careLoopsStorage.js'
import {
  listCareLoopRows,
  buildCareLoopAiAlerts,
  formatCareLoopTime,
  classifyCompletionScore,
  nextDueAfterComplete,
  effectiveNextDueMs,
} from '../lib/careLoopsSimulation.js'

const btn =
  'rounded-xl px-3 py-2 text-xs font-semibold shadow-sm transition-colors disabled:opacity-45 disabled:pointer-events-none'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`

function statusBadge(status) {
  if (status === 'completed') return <Badge variant="success">Completed</Badge>
  if (status === 'overdue') return <Badge variant="danger">Overdue</Badge>
  return <Badge variant="warning">Due</Badge>
}

export default function CareLoopsPage() {
  const { patients } = usePatients()
  const [tick, setTick] = useState(0)
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function refresh() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-care-loops-updated', refresh)
    return () => window.removeEventListener('wmc-care-loops-updated', refresh)
  }, [])

  const patientsById = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p])), [patients])

  const rows = useMemo(() => listCareLoopRows(patients), [patients, tick])

  const aiAlerts = useMemo(() => buildCareLoopAiAlerts(rows, patientsById), [rows, patientsById])

  const scoreCounts = useMemo(() => scoreCountsFromHistory(patients), [patients, tick])

  const filtered = useMemo(() => {
    if (filter === 'due') return rows.filter((r) => r.status === 'due')
    if (filter === 'overdue') return rows.filter((r) => r.status === 'overdue')
    if (filter === 'active') return rows.filter((r) => r.status === 'due' || r.status === 'overdue')
    return rows
  }, [rows, filter])

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2400)
  }

  function handleComplete(row) {
    const key = row.key
    const now = Date.now()
    const dueMs = effectiveNextDueMs(row, now)
    const scoreKey = classifyCompletionScore(now, dueMs)
    appendScoreHistory({
      key,
      score: scoreKey === 'on_time' ? 'on_time' : 'late',
      at: new Date().toISOString(),
      loopTypeLabel: row.loopTypeLabel,
      patientName: row.patientName,
    })
    upsertLoopInstance(key, {
      lastCompletedAt: new Date().toISOString(),
      nextDueAt: nextDueAfterComplete(row, now),
      snoozeUntil: null,
      escalated: false,
      overdueStreak: 0,
    })
    showToast(`Marked complete · scored ${scoreKey === 'on_time' ? 'on time' : 'late'}`, 'success')
  }

  function handleSnooze(row) {
    const key = row.key
    const now = Date.now()
    const snoozed = now + 15 * 60 * 1000
    const curNext = new Date(row.nextDueAt).getTime()
    upsertLoopInstance(key, {
      snoozeUntil: new Date(snoozed).toISOString(),
      nextDueAt: new Date(Math.max(curNext, snoozed)).toISOString(),
    })
    showToast('Snoozed 15 minutes (simulation).')
  }

  function handleEscalate(row) {
    const key = row.key
    if (row.status === 'overdue') {
      appendScoreHistory({
        key,
        score: 'missed',
        at: new Date().toISOString(),
        loopTypeLabel: row.loopTypeLabel,
        patientName: row.patientName,
      })
    }
    appendScoreHistory({
      key,
      score: 'escalated',
      at: new Date().toISOString(),
      loopTypeLabel: row.loopTypeLabel,
      patientName: row.patientName,
    })
    upsertLoopInstance(key, { escalated: true })
    showToast('Escalation logged (simulation).', 'warn')
  }

  function handleNote(row) {
    const text = window.prompt(`Care loop note — ${row.patientName} · ${row.loopTypeLabel}`, '')
    if (text === null) return
    appendLoopNote(row.key, text)
    if (text.trim()) showToast('Note saved.')
  }

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Nursing care loops"
        description="Recurring bedside tasks with due windows, snooze, escalation, and simulated AI surveillance. Local demo only — not a clinical system of record."
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
            toast.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : toast.tone === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" padding="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-600" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-slate-900">AI loop alerts</h3>
              <p className="text-sm text-slate-500">Missed loops, repeated overdue, pressure &amp; fall risk context</p>
            </div>
          </div>
          {aiAlerts.length === 0 ? (
            <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
              No active loop alerts from current roster — keep monitoring turning and high-risk rounds.
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {aiAlerts.map((a) => (
                <li
                  key={a.id}
                  className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm"
                >
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      a.severity === 'critical' ? 'text-red-600' : a.severity === 'high' ? 'text-orange-600' : 'text-amber-600'
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{a.title}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{a.category}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{a.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="p-4 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-base font-semibold text-slate-900">Loop scoring</h3>
          </div>
          <p className="text-xs text-slate-500">Rolling totals incl. demo baseline + actions on this device</p>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">On time</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">{scoreCounts.onTime}</dd>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-amber-900">Late</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-amber-950">{scoreCounts.late}</dd>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-red-900">Missed</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-red-950">{scoreCounts.missed}</dd>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-violet-900">Escalated</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-violet-950">{scoreCounts.escalated}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="mt-6" padding="p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-600" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Active loops</h3>
              <p className="text-sm text-slate-500">{filtered.length} visible · {rows.length} total assignments</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Due / overdue' },
              { id: 'due', label: 'Due' },
              { id: 'overdue', label: 'Overdue' },
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

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-[920px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-100 px-3 py-3">Patient</th>
                <th className="border-b border-slate-100 px-3 py-3">Room</th>
                <th className="border-b border-slate-100 px-3 py-3">Loop</th>
                <th className="border-b border-slate-100 px-3 py-3">Last done</th>
                <th className="border-b border-slate-100 px-3 py-3">Next due</th>
                <th className="border-b border-slate-100 px-3 py-3">Status</th>
                <th className="border-b border-slate-100 px-3 py-3">Nurse</th>
                <th className="border-b border-slate-100 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.key} className="border-b border-slate-50 hover:bg-teal-50/40">
                  <td className="px-3 py-3 font-semibold text-slate-900">{row.patientName}</td>
                  <td className="px-3 py-3 text-slate-700">{row.room}</td>
                  <td className="px-3 py-3">
                    <span className="font-medium text-slate-800">{row.loopTypeLabel}</span>
                    <p className="text-xs text-slate-500">Every {row.intervalMinutes >= 60 ? `${row.intervalMinutes / 60}h` : `${row.intervalMinutes}m`}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatCareLoopTime(row.lastCompletedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatCareLoopTime(row.nextDueAt)}</td>
                  <td className="px-3 py-3">{statusBadge(row.status)}</td>
                  <td className="px-3 py-3 text-slate-700">
                    <span className="block">{row.nurseInCharge}</span>
                    {row.escalated ? (
                      <Badge variant="danger" className="mt-1">
                        Escalated
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button type="button" className={btnPrimary} onClick={() => handleComplete(row)}>
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Mark completed
                        </span>
                      </button>
                      <button type="button" className={btnMuted} onClick={() => handleSnooze(row)}>
                        Snooze 15 min
                      </button>
                      <button type="button" className={btnWarn} onClick={() => handleEscalate(row)}>
                        Escalate
                      </button>
                      <button type="button" className={btnDanger} onClick={() => handleNote(row)}>
                        Add note
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
