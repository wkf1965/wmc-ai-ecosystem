import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardPlus,
  PillBottle,
  Printer,
  ShieldAlert,
  Sparkles,
  UserRoundX,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import {
  appendMedLoopNote,
  bumpMedLoopScore,
  upsertMedLoopDose,
} from '../db/medicationLoopStorage.js'
import {
  buildMedicationLoopAiAlerts,
  buildMedicationLoopPrintText,
  dueMsToday,
  listMedicationLoopRows,
  medicationLoopAiSummary,
  scoreTotalsDisplay,
} from '../lib/medicationLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`

const COLS = [
  { key: 'due_now', title: 'Due now', sub: 'MAR window', badge: 'warning' },
  { key: 'upcoming', title: 'Upcoming', sub: 'Later today', badge: 'teal' },
  { key: 'missed', title: 'Missed', sub: 'Refused / slipped', badge: 'danger' },
  { key: 'completed', title: 'Completed', sub: 'Given this cycle', badge: 'success' },
]

function formatTs(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function StatusBadge({ status }) {
  const v =
    status === 'given'
      ? 'success'
      : status === 'missed'
        ? 'danger'
        : status === 'refused'
          ? 'danger'
          : status === 'delayed'
            ? 'warning'
            : status === 'due'
              ? 'info'
              : 'default'
  const label =
    status === 'due'
      ? 'Due'
      : status === 'given'
        ? 'Given'
        : status === 'missed'
          ? 'Missed'
          : status === 'delayed'
            ? 'Delayed'
            : status === 'refused'
              ? 'Refused'
              : status
  return <Badge variant={v}>{label}</Badge>
}

function DoseCard({ row, onGiven, onMissed, onRefused, onNote, onDoctor }) {
  return (
    <Card className="border-slate-100 shadow-sm" padding="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.room}</span>
            {row.highRiskMed ? (
              <Badge variant="danger" className="ml-2">
                High-risk
              </Badge>
            ) : null}
            {row.doctorEscalated ? (
              <Badge variant="warning" className="ml-1">
                MD flag
              </Badge>
            ) : null}
          </p>
        </div>
        <StatusBadge status={row.displayStatus} />
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Medication</dt>
          <dd className="text-right font-semibold text-slate-900">{row.medicationName}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Dosage</dt>
          <dd>{row.dosage}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Frequency</dt>
          <dd className="max-w-[55%] text-right leading-snug">{row.frequency}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Due time</dt>
          <dd className="font-medium">{row.timeDue}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Last given</dt>
          <dd>{formatTs(row.lastGivenAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Nurse</dt>
          <dd>{row.nurseAssigned}</dd>
        </div>
      </dl>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button type="button" className={btnPrimary} onClick={() => onGiven(row)}>
          Mark given
        </button>
        <button type="button" className={btnDanger} onClick={() => onMissed(row)}>
          Mark missed
        </button>
        <button type="button" className={btnWarn} onClick={() => onRefused(row)}>
          Patient refused
        </button>
        <button type="button" className={btnMuted} onClick={() => onNote(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <ClipboardPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Med note
          </span>
        </button>
        <button type="button" className={btnWarn} onClick={() => onDoctor(row)}>
          Escalate MD
        </button>
      </div>
    </Card>
  )
}

export default function MedicationLoopPage() {
  const { patients } = usePatients()
  const { notes } = useNursingNotes()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [mobileCol, setMobileCol] = useState('due_now')

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 45 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-medication-loop-updated', bump)
    return () => window.removeEventListener('wmc-medication-loop-updated', bump)
  }, [])

  const rows = useMemo(() => listMedicationLoopRows(patients), [patients, tick])

  const alerts = useMemo(() => buildMedicationLoopAiAlerts(rows, notes), [rows, notes])

  const summary = useMemo(() => medicationLoopAiSummary(rows), [rows, tick])

  const scores = useMemo(() => scoreTotalsDisplay(), [tick])

  const buckets = useMemo(() => {
    return {
      due_now: rows.filter((r) => r.bucket === 'due_now'),
      upcoming: rows.filter((r) => r.bucket === 'upcoming'),
      missed: rows.filter((r) => r.bucket === 'missed'),
      completed: rows.filter((r) => r.bucket === 'completed'),
    }
  }, [rows])

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }

  function handleGiven(row) {
    const now = Date.now()
    const due = Number.isFinite(row.dueMs) ? row.dueMs : dueMsToday(row.timeDue, now)
    if (now <= due + 15 * 60 * 1000) bumpMedLoopScore('onTime', 1)
    else bumpMedLoopScore('late', 1)
    const day = new Date().toISOString().slice(0, 10)
    upsertMedLoopDose(row.id, {
      adminStatus: 'given',
      lastGivenAt: new Date().toISOString(),
      lastGivenDay: day,
      doctorEscalated: false,
    })
    showToast('Documented as given (simulation).', 'success')
  }

  function handleMissed(row) {
    bumpMedLoopScore('missed', 1)
    upsertMedLoopDose(row.id, { adminStatus: 'missed' })
    showToast('Marked missed.', 'warn')
  }

  function handleRefused(row) {
    bumpMedLoopScore('refused', 1)
    upsertMedLoopDose(row.id, { adminStatus: 'refused' })
    showToast('Refusal recorded.', 'warn')
  }

  function handleNote(row) {
    const text = window.prompt(`Medication note — ${row.medicationName}`, '')
    if (text === null) return
    appendMedLoopNote(row.id, text)
    if (text.trim()) showToast('Note saved.')
  }

  function handleDoctor(row) {
    bumpMedLoopScore('escalated', 1)
    upsertMedLoopDose(row.id, { doctorEscalated: true })
    showToast('Escalated to doctor (simulation).', 'warn')
  }

  function handlePrint() {
    const text = buildMedicationLoopPrintText(rows)
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) {
      showToast('Allow pop-ups to print.', 'warn')
      return
    }
    w.document.write(`<pre style="font-family:system-ui,sans-serif;padding:16px;">${text.replace(/</g, '&lt;')}</pre>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <PageHeader
        title="Medication loop"
        description="Shift MAR-style round board with simulated scoring, AI cues, and escalation placeholders. Demo only — not an eMAR."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Simulation mode</Badge>
            <Link
              to="/medications"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Medication Tracking
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4" aria-hidden />
              Print report
            </button>
          </div>
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

      {/* AI summary */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-rose-400 to-red-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <UserRoundX className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Missed doses (patients)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.patientsWithMissedMed}</p>
              <p className="text-xs text-slate-600">Unique patients with slips</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-orange-400 to-amber-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <ShieldAlert className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">High-risk open doses</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.highRiskMedicationCases}</p>
              <p className="text-xs text-slate-600">Insulin / anticoag / opioids etc.</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-teal-400 to-cyan-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nurse compliance</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.nurseCompliancePct}%</p>
              <p className="text-xs text-slate-600">Weighted on-time proxy</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden sm:col-span-2 xl:col-span-1" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-violet-400 to-indigo-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Doctor review</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.doctorReviewRecommendations}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Scoring */}
      <Card className="mt-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <PillBottle className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Medication scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Simulation tally · includes demo baseline</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'On time', val: scores.onTime },
            { label: 'Late', val: scores.late },
            { label: 'Missed', val: scores.missed },
            { label: 'Refused', val: scores.refused },
            { label: 'Escalated', val: scores.escalated },
          ].map((x) => (
            <div key={x.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{x.label}</dt>
              <dd className="text-xl font-bold tabular-nums text-slate-900">{x.val}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* AI alerts */}
      <Card className="mt-4" padding="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-600" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-slate-900">AI alerts</h3>
            <p className="text-sm text-slate-500">Missed dose · delays · high-risk · refusal · vitals · MD review</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No medication loop alerts on current mock roster.
          </p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-sm">
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

      {/* Mobile board */}
      <div className="mt-6 lg:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Medication round board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-inset transition-colors ${
                mobileCol === c.key ? 'bg-teal-600 text-white ring-teal-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
              onClick={() => setMobileCol(c.key)}
            >
              {c.title}
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {buckets[mobileCol].map((row) => (
            <DoseCard
              key={row.id}
              row={row}
              onGiven={handleGiven}
              onMissed={handleMissed}
              onRefused={handleRefused}
              onNote={handleNote}
              onDoctor={handleDoctor}
            />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No doses in this column.
            </p>
          ) : null}
        </div>
      </div>

      {/* Desktop board */}
      <div className="mt-6 hidden gap-4 lg:grid lg:grid-cols-4">
        {COLS.map((col) => (
          <div key={col.key} className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key].length}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-14rem)] min-h-[200px] space-y-3 overflow-y-auto overscroll-contain p-3">
              {buckets[col.key].map((row) => (
                <DoseCard
                  key={row.id}
                  row={row}
                  onGiven={handleGiven}
                  onMissed={handleMissed}
                  onRefused={handleRefused}
                  onNote={handleNote}
                  onDoctor={handleDoctor}
                />
              ))}
              {buckets[col.key].length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">Empty</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
