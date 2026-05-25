import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  ClipboardPlus,
  Download,
  Footprints,
  Home,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import {
  appendFallRiskNote,
  bumpFallPreventionScore,
  mergeFallPreventionInstances,
  upsertFallPreventionInstance,
} from '../db/fallPreventionLoopStorage.js'
import {
  buildFallPreventionAiAlerts,
  buildFallPreventionReportCsv,
  deriveFallPreventionBand,
  fallPreventionAiSummary,
  fallPreventionBucket,
  fallPreventionScoreTotalsDisplay,
  fallRiskDisplay,
  formatFallTime,
  listFallPreventionRows,
} from '../lib/fallPreventionLoopSimulation.js'
import { usePatients } from '../hooks/usePatients.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-amber-600 text-white hover:bg-amber-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`
const btnSuccess = `${btn} border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`

const COLS = [
  { key: 'high_fall_risk', title: 'High fall risk', sub: 'Tier / escalation', badge: 'danger' },
  { key: 'check_due_now', title: 'Check due now', sub: 'Within rounding window', badge: 'warning' },
  { key: 'overdue_checks', title: 'Overdue checks', sub: 'Past grace vs due', badge: 'danger' },
  { key: 'night_monitoring', title: 'Night monitoring', sub: 'Wandering profile', badge: 'info' },
  { key: 'stable_patients', title: 'Stable patients', sub: 'Routine surveillance', badge: 'success' },
]

function stripDerived(row) {
  const { bucket: _b, ...rest } = row
  return rest
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function BoolPill({ label, ok }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        ok ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-800'
      }`}
    >
      {label}: {ok ? 'Y' : 'N'}
    </span>
  )
}

function FallCard({ row, selected, onSelect, nowMs }) {
  const band = deriveFallPreventionBand(row)
  const bucket = row.bucket ?? fallPreventionBucket(row, nowMs)

  const bucketLabel =
    bucket === 'high_fall_risk'
      ? 'High risk'
      : bucket === 'check_due_now'
        ? 'Due now'
        : bucket === 'overdue_checks'
          ? 'Overdue'
          : bucket === 'night_monitoring'
            ? 'Night monitoring'
            : 'Stable'

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row.patientId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(row.patientId)
        }
      }}
      className={`cursor-pointer border shadow-sm transition-shadow ${selected ? 'ring-2 ring-amber-500 ring-offset-2' : 'border-slate-100'}`}
      padding="p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.roomNumber}</span>
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Badge variant={band.variant}>{band.label}</Badge>
          <Badge variant={bucket === 'stable_patients' ? 'success' : bucket === 'overdue_checks' ? 'danger' : 'warning'}>
            {bucketLabel}
          </Badge>
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Fall risk</dt>
          <dd className="font-bold text-slate-900">{fallRiskDisplay(row.fallRiskLevel)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Mobility</dt>
          <dd className="max-w-[62%] text-right leading-snug">{row.mobilityStatus}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Walking aid</dt>
          <dd className="max-w-[58%] text-right font-medium">{row.walkingAid}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Bed rails</dt>
          <dd className="max-w-[58%] text-right">{row.bedRailStatus}</dd>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <BoolPill label="Bell" ok={row.callBellWithinReach} />
          <BoolPill label="Socks" ok={row.nonSlipSocks} />
          <BoolPill label="Wander" ok={row.nightWanderingRisk} />
          <BoolPill label="Prior fall" ok={row.previousFallHistory} />
          <BoolPill label="Env OK" ok={row.environmentMarkedSafe} />
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <dt className="text-slate-500">Last fall check</dt>
          <dd className="text-right">{formatFallTime(row.lastFallCheckTime)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Next due</dt>
          <dd className="text-right font-semibold text-amber-900">{formatFallTime(row.nextFallCheckDueTime)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Nurse</dt>
          <dd className="max-w-[58%] text-right font-medium">{row.nurseAssigned}</dd>
        </div>
        {row.escalatedFallRisk ? (
          <p className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-900">Fall risk escalated</p>
        ) : null}
        {Array.isArray(row.riskNotes) && row.riskNotes.length > 0 ? (
          <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">
            <p className="font-semibold text-slate-600">Latest note</p>
            <p className="mt-0.5 whitespace-pre-wrap">{row.riskNotes[row.riskNotes.length - 1]?.text}</p>
          </div>
        ) : null}
      </dl>
    </Card>
  )
}

export default function FallPreventionLoopPage() {
  const { patients } = usePatients()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [mobileCol, setMobileCol] = useState('check_due_now')

  const nowMs = useMemo(() => Date.now(), [tick])

  useEffect(() => {
    mergeFallPreventionInstances(patients)
  }, [patients])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-fall-prevention-loop-updated', bump)
    return () => window.removeEventListener('wmc-fall-prevention-loop-updated', bump)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

  const rows = useMemo(() => listFallPreventionRows(patients, nowMs), [patients, tick, nowMs])

  const alerts = useMemo(() => buildFallPreventionAiAlerts(rows.map(stripDerived), nowMs), [rows, nowMs])
  const summary = useMemo(() => fallPreventionAiSummary(rows.map(stripDerived), nowMs), [rows, nowMs])
  const scores = useMemo(() => fallPreventionScoreTotalsDisplay(), [tick])

  const buckets = useMemo(() => {
    return {
      high_fall_risk: rows.filter((r) => r.bucket === 'high_fall_risk'),
      check_due_now: rows.filter((r) => r.bucket === 'check_due_now'),
      overdue_checks: rows.filter((r) => r.bucket === 'overdue_checks'),
      night_monitoring: rows.filter((r) => r.bucket === 'night_monitoring'),
      stable_patients: rows.filter((r) => r.bucket === 'stable_patients'),
    }
  }, [rows])

  const selected = rows.find((r) => r.patientId === selectedId) || null

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }

  function requireSelection() {
    if (!selected) {
      showToast('Select a resident card first.', 'warn')
      return null
    }
    return selected
  }

  function handleRecordFallCheck() {
    const row = requireSelection()
    if (!row) return
    const t = Date.now()
    const intervalH = parseFloat(window.prompt('Next fall check interval (hours)', '4') || '4')
    const hrs = Number.isFinite(intervalH) && intervalH > 0 && intervalH <= 24 ? intervalH : 4
    upsertFallPreventionInstance(row.patientId, {
      ...stripDerived(row),
      lastFallCheckTime: new Date(t).toISOString(),
      nextFallCheckDueTime: new Date(t + hrs * 60 * 60 * 1000).toISOString(),
    })
    bumpFallPreventionScore('monitor', 1)
    showToast('Fall check recorded.', 'success')
  }

  function handleAddNote() {
    const row = requireSelection()
    if (!row) return
    const text = window.prompt(`Fall risk note — ${row.patientName}`, 'Unsafe clutter removed · educated on call bell')
    if (text === null) return
    appendFallRiskNote(row.patientId, text)
    const t = Date.now()
    upsertFallPreventionInstance(row.patientId, {
      nextFallCheckDueTime: new Date(t + 45 * 60 * 1000).toISOString(),
    })
    if (text.trim()) showToast('Note saved.')
  }

  function handleMarkEnvironmentSafe() {
    const row = requireSelection()
    if (!row) return
    upsertFallPreventionInstance(row.patientId, {
      ...stripDerived(row),
      environmentMarkedSafe: true,
      callBellWithinReach: true,
      nonSlipSocks: true,
    })
    bumpFallPreventionScore('safe', 1)
    showToast('Environment marked safe.', 'success')
  }

  function handleEscalate() {
    const row = requireSelection()
    if (!row) return
    upsertFallPreventionInstance(row.patientId, {
      ...stripDerived(row),
      escalatedFallRisk: true,
      fallRiskLevel: row.fallRiskLevel === 'low' ? 'moderate' : row.fallRiskLevel === 'moderate' ? 'high' : row.fallRiskLevel,
    })
    bumpFallPreventionScore('urgentSupervision', 1)
    showToast('Fall risk escalated.', 'warn')
  }

  function handleReport() {
    const csv = buildFallPreventionReportCsv(rows.map(stripDerived), nowMs)
    downloadText(`fall-prevention-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    showToast('Fall prevention report downloaded.')
  }

  return (
    <div className="mx-auto max-w-[1600px] pb-8">
      <PageHeader
        title="Fall prevention loop"
        description="Rounding-driven board with mobility aids, environmental cues, and overdue surveillance — follow your facility falls program."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Local mode</Badge>
            <Link
              to="/side-turning"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Side turning
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

      <Card className="mb-3" padding="p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={handleRecordFallCheck} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <ClipboardPlus className="h-4 w-4 shrink-0" aria-hidden />
              Record fall check
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleAddNote} disabled={!selected}>
            Add fall risk note
          </button>
          <button type="button" className={btnSuccess} onClick={handleMarkEnvironmentSafe} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Home className="h-4 w-4 shrink-0" aria-hidden />
              Mark environment safe
            </span>
          </button>
          <button type="button" className={btnDanger} onClick={handleEscalate} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
              Escalate fall risk
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleReport}>
            <span className="inline-flex items-center gap-1">
              <Download className="h-4 w-4 shrink-0" aria-hidden />
              Generate fall prevention report
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Board columns refresh on the clock for overdue / due-now windows. Select a card before bedside actions.
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-amber-400 to-orange-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Close supervision</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">{summary.patientsNeedingCloseSupervision}</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-indigo-400 to-violet-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Moon className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Night fall risk</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-800">{summary.nightFallRiskList}</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden sm:col-span-2 xl:col-span-1" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-teal-400 to-cyan-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Environmental checklist</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.environmentalSafetyChecklist}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-3" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Footprints className="h-5 w-5 text-amber-700" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">AI summary</h3>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nurse action checklist</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{summary.nurseActionChecklist}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Family update suggestion</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{summary.familyUpdateSuggestion}</p>
          </div>
        </div>
      </Card>

      <Card className="mt-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Footprints className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Fall prevention scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Local tally · nurse actions update counters</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Safe', val: scores.safe },
            { label: 'Monitor', val: scores.monitor },
            { label: 'Moderate risk', val: scores.moderateRisk },
            { label: 'High risk', val: scores.highRisk },
            { label: 'Urgent supervision', val: scores.urgentSupervision },
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
            <p className="text-sm text-slate-500">Risk tier · wandering · mobility · confusion · safety gaps · MD review</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No fall prevention alerts on current roster snapshot.
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

      <div className="mt-6 xl:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Fall prevention board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-inset transition-colors ${
                mobileCol === c.key ? 'bg-amber-600 text-white ring-amber-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
              onClick={() => setMobileCol(c.key)}
            >
              <span className="line-clamp-2 max-w-[120px] text-left">{c.title}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {buckets[mobileCol].map((row) => (
            <FallCard key={row.patientId} row={row} selected={selectedId === row.patientId} onSelect={setSelectedId} nowMs={nowMs} />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No residents in this column.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 hidden gap-3 xl:grid xl:grid-cols-5">
        {COLS.map((col) => (
          <div key={col.key} className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold leading-tight text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key].length}</Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-13rem)] min-h-[220px] space-y-3 overflow-y-auto overscroll-contain p-3">
              {buckets[col.key].map((row) => (
                <FallCard key={row.patientId} row={row} selected={selectedId === row.patientId} onSelect={setSelectedId} nowMs={nowMs} />
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
