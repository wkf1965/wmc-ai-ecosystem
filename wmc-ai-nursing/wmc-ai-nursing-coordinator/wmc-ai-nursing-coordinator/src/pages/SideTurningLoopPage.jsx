import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  BellRing,
  Camera,
  CheckCircle2,
  ClipboardPlus,
  Clock,
  Sparkles,
  Timer,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import {
  appendSkinObservation,
  bumpScoreField,
  upsertSideTurningLoopPatient,
} from '../db/sideTurningLoopStorage.js'
import {
  POSITION_LABEL,
  buildTurningLoopAiAlerts,
  effectiveNextDueMs,
  formatTurningTime,
  listSideTurningLoopRows,
  nextDueAfterTurn,
  scoreTotalsDisplay,
  turningLoopAiSummary,
} from '../lib/sideTurningLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`

const COLUMN_META = [
  { key: 'due_now', title: 'Due now', subtitle: 'Within 30 min window', badge: 'warning' },
  { key: 'upcoming', title: 'Upcoming', subtitle: 'Scheduled', badge: 'teal' },
  { key: 'overdue', title: 'Overdue', subtitle: 'Past due', badge: 'danger' },
  { key: 'completed', title: 'Completed', subtitle: 'Current cycle OK', badge: 'success' },
]

function posBadge(pos) {
  const label = POSITION_LABEL[pos] || pos
  return <Badge variant="info">{label}</Badge>
}

function LoopPatientCard({
  row,
  onMarkTurned,
  onPickPhoto,
  onSkinNote,
  onEscalate,
  onSnooze,
}) {
  return (
    <Card className="border-slate-100 shadow-sm" padding="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.room}</span> · Bed{' '}
            <span className="font-semibold">{row.bedNumber}</span>
          </p>
        </div>
        {row.woundEscalated ? (
          <Badge variant="danger">Wound flag</Badge>
        ) : row.pressureSoreRisk === 'High' ? (
          <Badge variant="danger">High PI risk</Badge>
        ) : (
          <Badge variant="teal">Loop</Badge>
        )}
      </div>

      <dl className="mt-3 space-y-1.5 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Risk level</dt>
          <dd className="max-w-[58%] text-right font-medium leading-snug">{row.riskLevel}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Pressure sore risk</dt>
          <dd className="font-semibold">{row.pressureSoreRisk}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Last turning</dt>
          <dd>{formatTurningTime(row.lastTurnedAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Next due</dt>
          <dd className="flex flex-wrap items-center justify-end gap-1">
            <span>{formatTurningTime(new Date(row.effectiveNextDueMs).toISOString())}</span>
            {row.bucket === 'overdue' ? (
              <Badge variant="danger">{row.overdueMin}m late</Badge>
            ) : null}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Position</dt>
          <dd>{posBadge(row.currentPosition)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Nurse</dt>
          <dd className="font-medium">{row.nurseAssigned}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Skin</dt>
          <dd className="max-w-[60%] text-right leading-snug">{row.skinCondition}</dd>
        </div>
        {row.lastPhotoLabel ? (
          <div className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
            Mock photo: <span className="font-semibold">{row.lastPhotoLabel}</span>
            {row.lastPhotoAt ? ` · ${formatTurningTime(row.lastPhotoAt)}` : ''}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 px-2 py-1 text-[11px] text-slate-500">
            No turning photo on file
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mark to:</span>
        {(['left', 'right', 'supine']).map((p) => (
          <button key={p} type="button" className={`${btnPrimary} min-h-0! py-1.5!`} onClick={() => onMarkTurned(row, p)}>
            {POSITION_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button type="button" className={btnMuted} onClick={() => onPickPhoto(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Upload photo
          </span>
        </button>
        <button type="button" className={btnMuted} onClick={() => onSkinNote(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <ClipboardPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Skin obs.
          </span>
        </button>
        <button type="button" className={btnWarn} onClick={() => onEscalate(row)}>
          Escalate wound
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

export default function SideTurningLoopPage() {
  const { patients } = usePatients()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [mobileCol, setMobileCol] = useState('due_now')
  const fileRef = useRef(null)
  const [photoPatientId, setPhotoPatientId] = useState(null)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 45 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-side-turning-loop-updated', bump)
    return () => window.removeEventListener('wmc-side-turning-loop-updated', bump)
  }, [])

  const rows = useMemo(() => listSideTurningLoopRows(patients), [patients, tick])

  const alerts = useMemo(() => buildTurningLoopAiAlerts(rows), [rows])

  const summary = useMemo(() => turningLoopAiSummary(rows), [rows])

  const scores = useMemo(() => scoreTotalsDisplay(), [tick])

  const buckets = useMemo(() => {
    return {
      due_now: rows.filter((r) => r.bucket === 'due_now'),
      upcoming: rows.filter((r) => r.bucket === 'upcoming'),
      overdue: rows.filter((r) => r.bucket === 'overdue'),
      completed: rows.filter((r) => r.bucket === 'completed'),
    }
  }, [rows])

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }

  function handleMarkTurned(row, position) {
    const now = Date.now()
    const due = effectiveNextDueMs(row, now)
    if (row.bucket === 'overdue' && row.overdueMin >= 45) {
      bumpScoreField('missed', 1)
    } else if (now > due + 20 * 60 * 1000) {
      bumpScoreField('late', 1)
    } else {
      bumpScoreField('onTime', 1)
    }
    upsertSideTurningLoopPatient(row.patientId, {
      lastTurnedAt: new Date().toISOString(),
      nextDueAt: nextDueAfterTurn(row.intervalMinutes, now),
      currentPosition: position,
      snoozeUntil: null,
      overdueStreak: 0,
      woundEscalated: false,
    })
    showToast(`Turn logged · patient now ${POSITION_LABEL[position]}`, 'success')
  }

  function handlePickPhoto(row) {
    setPhotoPatientId(row.patientId)
    fileRef.current?.click()
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file || !photoPatientId) return
    bumpScoreField('photoUploaded', 1)
    upsertSideTurningLoopPatient(photoPatientId, {
      lastPhotoLabel: file.name,
      lastPhotoAt: new Date().toISOString(),
    })
    showToast(`Mock upload saved: ${file.name}`, 'success')
    setPhotoPatientId(null)
    e.target.value = ''
  }

  function handleSkinNote(row) {
    const text = window.prompt(`Skin observation — ${row.patientName}`, '')
    if (text === null) return
    appendSkinObservation(row.patientId, text)
    if (text.trim()) showToast('Skin observation saved.')
  }

  function handleEscalate(row) {
    if (row.bucket === 'overdue' && row.overdueMin >= 30) bumpScoreField('missed', 1)
    upsertSideTurningLoopPatient(row.patientId, { woundEscalated: true })
    showToast('Wound concern escalated.', 'warn')
  }

  function handleSnooze(row) {
    const now = Date.now()
    const snoozeUntil = new Date(now + 15 * 60 * 1000).toISOString()
    const curNext = new Date(row.nextDueAt).getTime()
    const nextDueAt = new Date(Math.max(curNext, now + 15 * 60 * 1000)).toISOString()
    const streak = row.bucket === 'overdue' ? (row.overdueStreak || 0) + 1 : row.overdueStreak || 0
    upsertSideTurningLoopPatient(row.patientId, { snoozeUntil, nextDueAt, overdueStreak: streak })
    showToast('Snoozed 15 minutes.')
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <PageHeader
        title="Side turning loop"
        description="q2h repositioning board with skin cues, mock imaging, and local AI surveillance. Not a medical device."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Local mode</Badge>
            <Link
              to="/side-turning-posture"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Posture &amp; photo workflow
            </Link>
          </div>
        }
      />

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

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
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-orange-400 to-amber-500 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Clock className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Urgent turning</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.urgentPatientCount}</p>
              <p className="text-xs text-slate-600">Patients due now or overdue</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-rose-500 to-red-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <ArrowLeftRight className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">High-risk beds</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.highRiskBeds}</p>
              <p className="text-xs text-slate-600">High fall or pressure index</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-teal-400 to-cyan-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nurse compliance</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.compliancePct}%</p>
              <p className="text-xs text-slate-600">On-time / all scored turns</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden sm:col-span-2 xl:col-span-1" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-indigo-400 to-violet-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PI prevention summary</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.preventionSummary}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Turning scoring */}
      <Card className="mt-4" padding="p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-slate-900">Turning scoring</h3>
        <p className="text-xs text-slate-500">Local tally · updates with care actions</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { k: 'onTime', label: 'On time', val: scores.onTime },
            { k: 'late', label: 'Late', val: scores.late },
            { k: 'missed', label: 'Missed', val: scores.missed },
            { k: 'photo', label: 'Photo uploaded', val: scores.photoUploaded },
            { k: 'skin', label: 'Skin checked', val: scores.skinChecked },
          ].map((x) => (
            <div key={x.k} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
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
            <p className="text-sm text-slate-500">Missed turns · overdue streak · PI · redness · immobility</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No active turning alerts on current roster.
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

      {/* Mobile column tabs */}
      <div className="mt-6 lg:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLUMN_META.map((c) => (
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
            <LoopPatientCard
              key={row.patientId}
              row={row}
              onMarkTurned={handleMarkTurned}
              onPickPhoto={handlePickPhoto}
              onSkinNote={handleSkinNote}
              onEscalate={handleEscalate}
              onSnooze={handleSnooze}
            />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              No patients in this column.
            </p>
          ) : null}
        </div>
      </div>

      {/* Desktop board */}
      <div className="mt-6 hidden gap-4 lg:grid lg:grid-cols-4">
        {COLUMN_META.map((col) => (
          <div key={col.key} className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key].length}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{col.subtitle}</p>
            </div>
            <div className="max-h-[calc(100vh-14rem)] min-h-[200px] space-y-3 overflow-y-auto overscroll-contain p-3">
              {buckets[col.key].map((row) => (
                <LoopPatientCard
                  key={row.patientId}
                  row={row}
                  onMarkTurned={handleMarkTurned}
                  onPickPhoto={handlePickPhoto}
                  onSkinNote={handleSkinNote}
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
