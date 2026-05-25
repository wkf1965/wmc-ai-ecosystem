import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardPlus,
  Droplets,
  Sparkles,
  Timer,
  UserRoundX,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import {
  appendHydrationNote,
  bumpHydrationScore,
  upsertHydrationPatient,
} from '../db/hydrationLoopStorage.js'
import {
  buildHydrationLoopAiAlerts,
  formatHydrationTime,
  hydrationLoopAiSummary,
  hydrationScoreTotalsDisplay,
  listHydrationLoopRows,
  nextHydrationDueAfter,
} from '../lib/hydrationLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`

const COLS = [
  { key: 'due_now', title: 'Due now', sub: 'Fluid round window', badge: 'warning' },
  { key: 'upcoming', title: 'Upcoming', sub: 'Later today', badge: 'teal' },
  { key: 'low_intake', title: 'Low intake', sub: 'Behind curve', badge: 'danger' },
  { key: 'completed_target', title: 'Completed target', sub: 'Goal met', badge: 'success' },
]

function BucketBadge({ bucket }) {
  const label =
    bucket === 'completed_target'
      ? 'Target met'
      : bucket === 'low_intake'
        ? 'Low intake'
        : bucket === 'due_now'
          ? 'Due now'
          : 'Upcoming'
  const v =
    bucket === 'completed_target'
      ? 'success'
      : bucket === 'low_intake'
        ? 'danger'
        : bucket === 'due_now'
          ? 'warning'
          : 'info'
  return <Badge variant={v}>{label}</Badge>
}

function HydrationCard({
  row,
  onRecordDrink,
  onRefused,
  onNote,
  onEscalate,
  onSnooze,
}) {
  return (
    <Card className="border-slate-100 shadow-sm" padding="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.room}</span>
            {row.escalated ? (
              <Badge variant="danger" className="ml-2">
                Escalated
              </Badge>
            ) : null}
          </p>
        </div>
        <BucketBadge bucket={row.bucket} />
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Fluid target</dt>
          <dd className="font-semibold">{row.fluidTargetMl} mL / day</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Intake so far</dt>
          <dd>
            <span className="font-bold text-slate-900">{row.intakeSoFarMl} mL</span>
            <span className="text-slate-500"> ({row.intakePercent}%)</span>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Expected by now</dt>
          <dd className="text-slate-600">~{row.expectedSoFarMl} mL (target curve)</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Last drink</dt>
          <dd>{formatHydrationTime(row.lastDrinkAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Next hydration due</dt>
          <dd className="font-medium">{formatHydrationTime(new Date(row.effectiveNextDueMs).toISOString())}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Nurse</dt>
          <dd>{row.nurseAssigned}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Swallowing risk</dt>
          <dd className="max-w-[58%] text-right leading-snug">{row.swallowingRisk}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Dehydration risk</dt>
          <dd>
            <Badge variant={row.dehydrationRiskLevel === 'High' ? 'danger' : row.dehydrationRiskLevel === 'Moderate' ? 'warning' : 'success'}>
              {row.dehydrationRiskLevel}
            </Badge>
          </dd>
        </div>
        {(row.refusedToday || 0) > 0 ? (
          <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900">
            Refusals today: {row.refusedToday}
          </p>
        ) : null}
      </dl>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button type="button" className={btnPrimary} onClick={() => onRecordDrink(row)}>
          Record drink
        </button>
        <button type="button" className={btnDanger} onClick={() => onRefused(row)}>
          Patient refused
        </button>
        <button type="button" className={btnMuted} onClick={() => onNote(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <ClipboardPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Hydration note
          </span>
        </button>
        <button type="button" className={btnWarn} onClick={() => onEscalate(row)}>
          Escalate risk
        </button>
        <button type="button" className={`${btnMuted} col-span-2 sm:col-span-1`} onClick={() => onSnooze(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Snooze 15m
          </span>
        </button>
      </div>
    </Card>
  )
}

export default function HydrationLoopPage() {
  const { patients } = usePatients()
  const { notes } = useNursingNotes()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [mobileCol, setMobileCol] = useState('due_now')

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [tick])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 45 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-hydration-loop-updated', bump)
    return () => window.removeEventListener('wmc-hydration-loop-updated', bump)
  }, [])

  const rows = useMemo(() => listHydrationLoopRows(patients), [patients, tick])

  const alerts = useMemo(() => buildHydrationLoopAiAlerts(rows, notes), [rows, notes])

  const summary = useMemo(() => hydrationLoopAiSummary(rows, notes), [rows, notes, tick])

  const scores = useMemo(() => hydrationScoreTotalsDisplay(), [tick])

  const buckets = useMemo(() => {
    return {
      due_now: rows.filter((r) => r.bucket === 'due_now'),
      upcoming: rows.filter((r) => r.bucket === 'upcoming'),
      low_intake: rows.filter((r) => r.bucket === 'low_intake'),
      completed_target: rows.filter((r) => r.bucket === 'completed_target'),
    }
  }, [rows])

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }

  function handleRecordDrink(row) {
    const raw = window.prompt(`Fluid amount (mL) — ${row.patientName}`, '120')
    if (raw === null) return
    const ml = parseInt(String(raw).replace(/\D/g, ''), 10)
    if (!Number.isFinite(ml) || ml <= 0) {
      showToast('Enter a positive number of mL.', 'warn')
      return
    }
    const nextIntake = row.intakeSoFarMl + ml
    const now = Date.now()
    const patch = {
      intakeSoFarMl: nextIntake,
      intakeDay: todayStr,
      lastDrinkAt: new Date().toISOString(),
      nextHydrationDueAt: nextHydrationDueAfter(row.intervalMinutes, now),
      snoozeUntil: null,
    }

    let extra = {}
    if (nextIntake >= row.fluidTargetMl * 0.92 && row.onTargetScoredDay !== todayStr) {
      bumpHydrationScore('onTarget', 1)
      extra = { onTargetScoredDay: todayStr }
      showToast('Daily fluid target reached — great job.', 'success')
    } else {
      showToast(`Recorded +${ml} mL`, 'success')
    }

    upsertHydrationPatient(row.patientId, { ...patch, ...extra })
  }

  function handleRefused(row) {
    const refusedToday = (row.refusedToday || 0) + 1
    bumpHydrationScore('refused', 1)
    upsertHydrationPatient(row.patientId, {
      refusedToday,
      refusedDay: todayStr,
    })
    showToast('Refusal documented.', 'warn')
  }

  function handleNote(row) {
    const text = window.prompt(`Hydration note — ${row.patientName}`, '')
    if (text === null) return
    appendHydrationNote(row.patientId, text)
    if (text.trim()) showToast('Note saved.')
  }

  function handleEscalate(row) {
    bumpHydrationScore('escalated', 1)
    bumpHydrationScore('highRisk', 1)
    bumpHydrationScore('belowTarget', 1)
    upsertHydrationPatient(row.patientId, { escalated: true })
    showToast('Dehydration risk escalated.', 'warn')
  }

  function handleSnooze(row) {
    const now = Date.now()
    const snoozeUntil = new Date(now + 15 * 60 * 1000).toISOString()
    const curNext = new Date(row.nextHydrationDueAt).getTime()
    upsertHydrationPatient(row.patientId, {
      snoozeUntil,
      nextHydrationDueAt: new Date(Math.max(curNext, now + 15 * 60 * 1000)).toISOString(),
    })
    showToast('Snoozed 15 minutes.')
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <PageHeader
        title="Hydration loop"
        description="Shift fluid rounds with intake tracking, refusal logs, and local dehydration surveillance. Not clinical fluid orders."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Local mode</Badge>
            <Link
              to="/health-check-loop"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Health Check Loop
            </Link>
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-sky-400 to-cyan-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <UserRoundX className="h-5 w-5 shrink-0 text-sky-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Low intake patients</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.patientsLowIntake}</p>
              <p className="text-xs text-slate-600">Behind target fluid curve</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-orange-400 to-red-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Droplets className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">High dehydration risk</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.highDehydrationRiskCount}</p>
              <p className="text-xs text-slate-600">Open high-risk rows</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden sm:col-span-2 xl:col-span-2" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-teal-400 to-emerald-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nurse action checklist</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.nurseActionChecklist}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-3" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Family update suggestion</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary.familyUpdateSuggestion}</p>
      </Card>

      <Card className="mt-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Droplets className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Hydration scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Local tally · updates with care actions</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'On target', val: scores.onTarget },
            { label: 'Below target', val: scores.belowTarget },
            { label: 'High risk', val: scores.highRisk },
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

      <Card className="mt-4" padding="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-600" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-slate-900">AI alerts</h3>
            <p className="text-sm text-slate-500">Intake · refusal · symptoms · appetite tie-in · MD review</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No hydration alerts on current roster snapshot.
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

      <div className="mt-6 lg:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Hydration board</p>
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
            <HydrationCard
              key={row.patientId}
              row={row}
              onRecordDrink={handleRecordDrink}
              onRefused={handleRefused}
              onNote={handleNote}
              onEscalate={handleEscalate}
              onSnooze={handleSnooze}
            />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No patients in this column.
            </p>
          ) : null}
        </div>
      </div>

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
                <HydrationCard
                  key={row.patientId}
                  row={row}
                  onRecordDrink={handleRecordDrink}
                  onRefused={handleRefused}
                  onNote={handleNote}
                  onEscalate={handleEscalate}
                  onSnooze={handleSnooze}
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
