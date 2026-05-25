import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  ClipboardPlus,
  FileText,
  Sparkles,
  Toilet,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import {
  appendContinenceNote,
  bumpContinenceScore,
  upsertContinencePatient,
} from '../db/continenceLoopStorage.js'
import {
  buildContinenceLoopAiAlerts,
  continenceLoopAiSummary,
  continenceScoreTotalsDisplay,
  formatContinenceTime,
  listContinenceLoopRows,
  nextContinenceRoundIso,
  nextDiaperChangeIso,
} from '../lib/continenceLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`

const COLS = [
  { key: 'diaper_change_due', title: 'Diaper change due', sub: 'Product change window', badge: 'warning' },
  { key: 'constipation_concern', title: 'Constipation concern', sub: 'Stool / risk', badge: 'danger' },
  { key: 'frequent_urination', title: 'Frequent urination', sub: 'Output pattern', badge: 'warning' },
  { key: 'skin_irritation_risk', title: 'Skin irritation risk', sub: 'Perineal care', badge: 'danger' },
  { key: 'overdue_continence_check', title: 'Overdue check', sub: 'Round missed', badge: 'danger' },
]

function BucketBadge({ bucket }) {
  const map = {
    diaper_change_due: { label: 'Diaper due', v: 'warning' },
    constipation_concern: { label: 'Constipation', v: 'danger' },
    frequent_urination: { label: 'Freq. voiding', v: 'warning' },
    skin_irritation_risk: { label: 'Skin risk', v: 'danger' },
    overdue_continence_check: { label: 'Overdue', v: 'danger' },
  }
  const x = map[bucket] || { label: bucket, v: 'info' }
  return <Badge variant={x.v}>{x.label}</Badge>
}

function continenceReportText(row) {
  return [
    `CONTINENCE LOOP REPORT`,
    `Patient: ${row.patientName} · Room ${row.room}`,
    `Toileting assist: ${row.toiletAssistanceNeeded}`,
    `Urination frequency: ${row.urinationFrequency}`,
    `Bowel status: ${row.bowelMovementStatus}`,
    `Diaper due: ${formatContinenceTime(row.nextDiaperChangeDueAt)} · Last change: ${formatContinenceTime(row.lastDiaperChangeAt)}`,
    `Incontinence episodes (counter): ${row.incontinenceEpisodes}`,
    `Stool: ${row.stoolConsistency} · Urine color: ${row.urineColorObservation}`,
    `Constipation risk: ${row.constipationRisk} · Skin: ${row.skinIrritation}`,
    `Nurse: ${row.nurseAssigned}`,
    `Last continence check: ${formatContinenceTime(row.lastContinenceCheckAt)} · Next due: ${formatContinenceTime(row.nextDueAt)}`,
    '',
    `Generated locally — verify with orders before clinical use.`,
  ].join('\n')
}

function ContinenceCard({
  row,
  onRecordToileting,
  onDiaperChange,
  onBowelNote,
  onEscalateConstipation,
  onReport,
}) {
  return (
    <Card className="border-slate-100 shadow-sm" padding="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.room}</span>
            {row.escalatedConstipation ? (
              <Badge variant="danger" className="ml-2">
                GI escalated
              </Badge>
            ) : null}
          </p>
        </div>
        <BucketBadge bucket={row.bucket} />
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Toilet assist</dt>
          <dd className="max-w-[58%] text-right leading-snug">{row.toiletAssistanceNeeded}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Urination freq.</dt>
          <dd className="font-medium">{row.urinationFrequency}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Bowel status</dt>
          <dd>{row.bowelMovementStatus}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Diaper change due</dt>
          <dd className="font-semibold text-slate-900">{formatContinenceTime(row.nextDiaperChangeDueAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Last diaper</dt>
          <dd>{formatContinenceTime(row.lastDiaperChangeAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Incontinence #</dt>
          <dd>{row.incontinenceEpisodes}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Stool</dt>
          <dd>{row.stoolConsistency}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Urine color</dt>
          <dd>
            <Badge variant={/dark amber|pink/i.test(row.urineColorObservation) ? 'danger' : /cloudy/i.test(row.urineColorObservation) ? 'warning' : 'success'}>
              {row.urineColorObservation}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Constipation risk</dt>
          <dd>
            <Badge variant={row.constipationRisk === 'High' ? 'danger' : row.constipationRisk === 'Moderate' ? 'warning' : 'success'}>
              {row.constipationRisk}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Skin irritation</dt>
          <dd>
            <Badge variant={/severe|moderate/i.test(row.skinIrritation) ? 'danger' : row.skinIrritation === 'Mild' ? 'warning' : 'success'}>
              {row.skinIrritation}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Nurse</dt>
          <dd>{row.nurseAssigned}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Last check</dt>
          <dd>{formatContinenceTime(row.lastContinenceCheckAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Next due</dt>
          <dd>{formatContinenceTime(row.nextDueAt)}</dd>
        </div>
      </dl>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" className={btnPrimary} onClick={() => onRecordToileting(row)}>
          Record toileting
        </button>
        <button type="button" className={btnMuted} onClick={() => onDiaperChange(row)}>
          Record diaper change
        </button>
        <button type="button" className={btnMuted} onClick={() => onBowelNote(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <ClipboardPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Bowel movement note
          </span>
        </button>
        <button type="button" className={btnWarn} onClick={() => onEscalateConstipation(row)}>
          Escalate constipation
        </button>
        <button type="button" className={`${btnMuted} sm:col-span-2`} onClick={() => onReport(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Generate continence report
          </span>
        </button>
      </div>
    </Card>
  )
}

export default function ContinenceLoopPage() {
  const { patients } = usePatients()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [mobileCol, setMobileCol] = useState('diaper_change_due')

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 45 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-continence-loop-updated', bump)
    return () => window.removeEventListener('wmc-continence-loop-updated', bump)
  }, [])

  const rows = useMemo(() => listContinenceLoopRows(patients, Date.now()), [patients, tick])

  const alerts = useMemo(() => buildContinenceLoopAiAlerts(rows), [rows])

  const summary = useMemo(() => continenceLoopAiSummary(rows), [rows, tick])

  const scores = useMemo(() => continenceScoreTotalsDisplay(), [tick])

  const buckets = useMemo(() => {
    const base = {
      diaper_change_due: [],
      constipation_concern: [],
      frequent_urination: [],
      skin_irritation_risk: [],
      overdue_continence_check: [],
    }
    for (const r of rows) {
      base[r.bucket]?.push(r)
    }
    return base
  }, [rows])

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  function handleRecordToileting(row) {
    const raw = window.prompt(
      `Urination frequency, Urine color (comma) — ${row.patientName}`,
      `${row.urinationFrequency},${row.urineColorObservation}`,
    )
    if (raw === null) return
    const p = String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (p.length < 2) {
      showToast('Enter frequency and urine color separated by comma.', 'warn')
      return
    }
    const ts = Date.now()
    bumpContinenceScore('monitor', 1)
    if (/frequent|hourly/i.test(p[0])) bumpContinenceScore('moderateConcern', 1)
    upsertContinencePatient(row.patientId, {
      urinationFrequency: p[0],
      urineColorObservation: p[1],
      lastContinenceCheckAt: new Date(ts).toISOString(),
      nextDueAt: nextContinenceRoundIso(ts),
    })
    showToast('Toileting snapshot saved.', 'success')
  }

  function handleDiaperChange(row) {
    const ts = Date.now()
    bumpContinenceScore('stable', 1)
    upsertContinencePatient(row.patientId, {
      lastDiaperChangeAt: new Date(ts).toISOString(),
      nextDiaperChangeDueAt: nextDiaperChangeIso(ts),
      lastContinenceCheckAt: new Date(ts).toISOString(),
      nextDueAt: nextContinenceRoundIso(ts),
      incontinenceEpisodes: Math.max(0, (row.incontinenceEpisodes ?? 0) - 1),
    })
    showToast('Diaper change recorded.', 'success')
  }

  function handleBowelNote(row) {
    const text = window.prompt(`Bowel movement note — ${row.patientName}`, '')
    if (text === null) return
    appendContinenceNote(row.patientId, text)
    if (text.trim()) showToast('Bowel note saved.')
  }

  function handleEscalateConstipation(row) {
    bumpContinenceScore('urgentReview', 2)
    bumpContinenceScore('highRisk', 1)
    bumpContinenceScore('moderateConcern', 1)
    upsertContinencePatient(row.patientId, {
      escalatedConstipation: true,
      doctorReviewNeeded: true,
      constipationRisk: 'High',
    })
    showToast('Constipation concern escalated.', 'warn')
  }

  async function copyReport(row) {
    const text = continenceReportText(row)
    try {
      await navigator.clipboard.writeText(text)
      showToast('Continence report copied.', 'success')
    } catch {
      showToast(text.slice(0, 220) + '…', 'info')
    }
  }

  return (
    <div className="mx-auto max-w-[1680px] pb-8">
      <PageHeader
        title="Toilet / continence loop"
        description="Local continence rounds with stool/voiding cues, skin-risk flags, and escalation hooks."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Local mode</Badge>
            <Link
              to="/hydration-loop"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Hydration Loop
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
        <Card className="relative overflow-hidden p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-amber-400 to-orange-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Constipation concern</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.constipationConcernCount}</p>
              <p className="text-xs text-slate-600">Risk / irregular stool cluster</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-sky-400 to-indigo-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Toilet className="h-5 w-5 shrink-0 text-sky-700" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Frequent diaper changes</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.frequentDiaperChangeCount}</p>
              <p className="text-xs text-slate-600">High episode / diaper dependency</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden p-4 sm:col-span-2 xl:col-span-2">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-teal-400 to-emerald-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skin care recommendations</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.skinCareRecommendations}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-3" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ClipboardPlus className="h-5 w-5 text-slate-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Nurse action checklist</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary.nurseActionChecklist}</p>
      </Card>

      <Card className="mt-3" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-violet-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Doctor review recommendation</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary.doctorReviewRecommendation}</p>
      </Card>

      <Card className="mt-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Toilet className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Continence scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Local tally · updates with care actions</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Stable', val: scores.stable },
            { label: 'Monitor', val: scores.monitor },
            { label: 'Moderate concern', val: scores.moderateConcern },
            { label: 'High risk', val: scores.highRisk },
            { label: 'Urgent review', val: scores.urgentReview },
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
            <p className="text-sm text-slate-500">GI · hydration proxy · skin · voiding · MD</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No continence alerts on current roster snapshot.
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
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Continence board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`shrink-0 rounded-full px-2 py-2 text-[10px] font-semibold ring-1 ring-inset transition-colors sm:px-2.5 sm:text-[11px] ${
                mobileCol === c.key ? 'bg-teal-600 text-white ring-teal-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
              onClick={() => setMobileCol(c.key)}
            >
              <span className="hidden min-[440px]:inline">{c.title}</span>
              <span className="min-[440px]:hidden">{c.title.split(' ')[0]}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {buckets[mobileCol].map((row) => (
            <ContinenceCard
              key={row.patientId}
              row={row}
              onRecordToileting={handleRecordToileting}
              onDiaperChange={handleDiaperChange}
              onBowelNote={handleBowelNote}
              onEscalateConstipation={handleEscalateConstipation}
              onReport={copyReport}
            />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No patients in this column.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 hidden gap-3 xl:grid xl:grid-cols-5">
        {COLS.map((col) => (
          <div key={col.key} className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-2 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold leading-tight text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key].length}</Badge>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-14rem)] min-h-[200px] space-y-3 overflow-y-auto overscroll-contain p-2">
              {buckets[col.key].map((row) => (
                <ContinenceCard
                  key={row.patientId}
                  row={row}
                  onRecordToileting={handleRecordToileting}
                  onDiaperChange={handleDiaperChange}
                  onBowelNote={handleBowelNote}
                  onEscalateConstipation={handleEscalateConstipation}
                  onReport={copyReport}
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
