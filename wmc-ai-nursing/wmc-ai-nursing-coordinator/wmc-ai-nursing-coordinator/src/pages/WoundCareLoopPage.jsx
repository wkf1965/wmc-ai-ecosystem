import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bandage,
  BellRing,
  Camera,
  ClipboardPlus,
  FileText,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import {
  appendWoundCareNote,
  bumpWoundCareScore,
  upsertWoundCarePatient,
} from '../db/woundLoopStorage.js'
import {
  buildWoundCareLoopAiAlerts,
  formatWoundTime,
  listWoundCareLoopRows,
  nextDressingDueIso,
  woundCareLoopAiSummary,
  woundCareScoreTotalsDisplay,
} from '../lib/woundLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`

const COLS = [
  { key: 'dressing_due_now', title: 'Dressing due now', sub: 'Change window', badge: 'warning' },
  { key: 'overdue_dressing', title: 'Overdue dressing', sub: 'Late change', badge: 'danger' },
  { key: 'infection_risk', title: 'Infection risk', sub: 'Inflammation cluster', badge: 'danger' },
  { key: 'healing_progress', title: 'Healing progress', sub: 'Trend favorable', badge: 'success' },
  { key: 'doctor_review_needed', title: 'Doctor review', sub: 'Escalated / urgent', badge: 'warning' },
]

function BucketBadge({ bucket }) {
  const map = {
    dressing_due_now: { label: 'Due now', v: 'warning' },
    overdue_dressing: { label: 'Overdue', v: 'danger' },
    infection_risk: { label: 'Infection risk', v: 'danger' },
    healing_progress: { label: 'Healing', v: 'success' },
    doctor_review_needed: { label: 'MD review', v: 'danger' },
  }
  const x = map[bucket] || { label: bucket, v: 'info' }
  return <Badge variant={x.v}>{x.label}</Badge>
}

function woundReportText(row) {
  return [
    `WOUND CARE LOOP REPORT (SIMULATION)`,
    `Patient: ${row.patientName} · Room ${row.room}`,
    `Location: ${row.woundLocation}`,
    `Type: ${row.woundType}`,
    `Size: ${row.woundSize}`,
    `Redness: ${row.redness} · Swelling: ${row.swelling}`,
    `Discharge: ${row.discharge} · Odor: ${row.odor}`,
    `Pain: ${row.painScore}/10`,
    `Dressing due: ${formatWoundTime(row.dressingDueAt)} · Last dressing: ${formatWoundTime(row.lastDressingAt)}`,
    `Nurse: ${row.nurseAssigned}`,
    `Photo (mock): ${row.photoUploaded ? `Yes — ${row.mockPhotoFilename || 'file on record'}` : 'No'}`,
    `Healing trend: ${row.healingTrend} · AI infection score: ${row.infectionScore ?? '—'}`,
    '',
    `Generated locally — not a signed clinical note.`,
  ].join('\n')
}

function WoundCard({
  row,
  onRecordDressing,
  onUploadPhoto,
  onNote,
  onEscalate,
  onReport,
}) {
  return (
    <Card className="border-slate-100 shadow-sm" padding="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.room}</span>
            {row.escalatedInfection ? (
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
          <dt className="text-slate-500 shrink-0">Location</dt>
          <dd className="text-right font-medium">{row.woundLocation}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Type</dt>
          <dd className="max-w-[62%] text-right leading-snug">{row.woundType}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Size</dt>
          <dd>{row.woundSize}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Redness</dt>
          <dd>
            <Badge variant={/severe/i.test(row.redness) ? 'danger' : /moderate/i.test(row.redness) ? 'warning' : 'success'}>
              {row.redness}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Swelling</dt>
          <dd>{row.swelling}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Discharge</dt>
          <dd className="max-w-[58%] text-right">{row.discharge}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Odor</dt>
          <dd>
            <Badge variant={/foul/i.test(row.odor) ? 'danger' : /mild/i.test(row.odor) ? 'warning' : 'success'}>
              {row.odor}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Pain</dt>
          <dd>
            <Badge variant={(row.painScore ?? 0) >= 7 ? 'danger' : (row.painScore ?? 0) >= 4 ? 'warning' : 'success'}>
              {row.painScore}/10
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Dressing due</dt>
          <dd className="font-semibold text-slate-900">{formatWoundTime(row.dressingDueAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Last dressing</dt>
          <dd>{formatWoundTime(row.lastDressingAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Nurse</dt>
          <dd>{row.nurseAssigned}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Photo</dt>
          <dd className="text-right">
            {row.photoUploaded ? (
              <span>
                <Badge variant="success">Yes</Badge>
                {row.mockPhotoFilename ? (
                  <span className="mt-1 block text-[10px] text-slate-500">{row.mockPhotoFilename}</span>
                ) : null}
              </span>
            ) : (
              <Badge variant="warning">No</Badge>
            )}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          <Badge variant={row.healingTrend === 'improving' ? 'success' : row.healingTrend === 'worsening' ? 'danger' : 'info'}>
            {row.healingTrend}
          </Badge>
          <Badge variant="info">Risk pts {row.infectionScore ?? 0}</Badge>
        </div>
      </dl>

      <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-3 text-center">
        <Camera className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
        <p className="mt-1 text-[11px] font-medium text-slate-600">Mock photo placeholder</p>
        <p className="text-[10px] text-slate-500">No image stored — simulation filename only</p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" className={btnPrimary} onClick={() => onRecordDressing(row)}>
          Record dressing
        </button>
        <button type="button" className={btnMuted} onClick={() => onUploadPhoto(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Upload wound photo
          </span>
        </button>
        <button type="button" className={btnMuted} onClick={() => onNote(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <ClipboardPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Wound note
          </span>
        </button>
        <button type="button" className={btnDanger} onClick={() => onEscalate(row)}>
          Escalate infection
        </button>
        <button type="button" className={`${btnMuted} sm:col-span-2`} onClick={() => onReport(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Generate wound report
          </span>
        </button>
      </div>
    </Card>
  )
}

export default function WoundCareLoopPage() {
  const { patients } = usePatients()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [mobileCol, setMobileCol] = useState('dressing_due_now')

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 45 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-wound-care-loop-updated', bump)
    return () => window.removeEventListener('wmc-wound-care-loop-updated', bump)
  }, [])

  const rows = useMemo(() => listWoundCareLoopRows(patients, Date.now()), [patients, tick])

  const alerts = useMemo(() => buildWoundCareLoopAiAlerts(rows), [rows])

  const summary = useMemo(() => woundCareLoopAiSummary(rows), [rows, tick])

  const scores = useMemo(() => woundCareScoreTotalsDisplay(), [tick])

  const buckets = useMemo(() => {
    const base = {
      dressing_due_now: [],
      overdue_dressing: [],
      infection_risk: [],
      healing_progress: [],
      doctor_review_needed: [],
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

  function handleRecordDressing(row) {
    const ts = Date.now()
    bumpWoundCareScore('stable', 1)
    if (row.healingTrend === 'improving') bumpWoundCareScore('improving', 1)
    upsertWoundCarePatient(row.patientId, {
      lastDressingAt: new Date(ts).toISOString(),
      dressingDueAt: nextDressingDueIso(ts),
    })
    showToast('Dressing recorded — next due updated (simulation).', 'success')
  }

  function handleUploadPhoto(row) {
    const ok = window.confirm(`Simulate wound photo upload for ${row.patientName}? (No real file)`)
    if (!ok) return
    const fn = `wound_${row.patientId}_${Date.now()}.jpg`
    upsertWoundCarePatient(row.patientId, {
      photoUploaded: true,
      mockPhotoFilename: fn,
    })
    showToast(`Placeholder image registered: ${fn}`, 'success')
  }

  function handleNote(row) {
    const text = window.prompt(`Wound note — ${row.patientName}`, '')
    if (text === null) return
    appendWoundCareNote(row.patientId, text)
    if (text.trim()) showToast('Note saved.')
  }

  function handleEscalate(row) {
    bumpWoundCareScore('infectionRisk', 2)
    bumpWoundCareScore('urgentReview', 2)
    bumpWoundCareScore('worsening', 1)
    upsertWoundCarePatient(row.patientId, {
      escalatedInfection: true,
      doctorReviewNeeded: true,
    })
    showToast('Infection concern escalated (simulation).', 'warn')
  }

  async function copyReport(row) {
    const text = woundReportText(row)
    try {
      await navigator.clipboard.writeText(text)
      showToast('Wound report copied to clipboard.', 'success')
    } catch {
      showToast(text.slice(0, 220) + '…', 'info')
    }
  }

  return (
    <div className="mx-auto max-w-[1680px] pb-8">
      <PageHeader
        title="Wound care loop"
        description="Simulated dressing surveillance with infection-style scoring and mock imaging placeholders. Demo only — not a wound-care order set."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Simulation mode</Badge>
            <Link
              to="/doctor-review"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Doctor review queue
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
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-rose-400 to-red-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Bandage className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">High-risk wounds</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.highRiskWoundsCount}</p>
              <p className="text-xs text-slate-600">Infection score / worsening trend</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden p-4 sm:col-span-2 xl:col-span-2">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-teal-400 to-cyan-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dressing compliance</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.dressingComplianceSummary}</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-violet-400 to-purple-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Healing trend</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.healingTrendSummary}</p>
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
          <FileText className="h-5 w-5 text-amber-700" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Doctor review recommendation</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary.doctorReviewRecommendation}</p>
      </Card>

      <Card className="mt-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Bandage className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Wound scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Simulation tally · includes demo baseline</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Improving', val: scores.improving },
            { label: 'Stable', val: scores.stable },
            { label: 'Worsening', val: scores.worsening },
            { label: 'Infection risk', val: scores.infectionRisk },
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
            <p className="text-sm text-slate-500">Infection · deterioration · overdue · pressure · pain · MD</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No wound alerts on current roster snapshot.
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
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Wound board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`shrink-0 rounded-full px-2.5 py-2 text-[11px] font-semibold ring-1 ring-inset transition-colors ${
                mobileCol === c.key ? 'bg-teal-600 text-white ring-teal-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
              onClick={() => setMobileCol(c.key)}
            >
              <span className="hidden min-[400px]:inline">{c.title}</span>
              <span className="min-[400px]:hidden">{c.title.split(' ')[0]}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {buckets[mobileCol].map((row) => (
            <WoundCard
              key={row.patientId}
              row={row}
              onRecordDressing={handleRecordDressing}
              onUploadPhoto={handleUploadPhoto}
              onNote={handleNote}
              onEscalate={handleEscalate}
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
            <div className="shrink-0 border-b border-slate-200/80 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold leading-tight text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key].length}</Badge>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-14rem)] min-h-[200px] space-y-3 overflow-y-auto overscroll-contain p-2">
              {buckets[col.key].map((row) => (
                <WoundCard
                  key={row.patientId}
                  row={row}
                  onRecordDressing={handleRecordDressing}
                  onUploadPhoto={handleUploadPhoto}
                  onNote={handleNote}
                  onEscalate={handleEscalate}
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
