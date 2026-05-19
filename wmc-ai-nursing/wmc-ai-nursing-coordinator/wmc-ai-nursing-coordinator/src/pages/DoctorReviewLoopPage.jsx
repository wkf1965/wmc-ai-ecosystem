import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  ClipboardSignature,
  Printer,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import {
  appendDoctorReviewDoctorNote,
  bumpDoctorReviewLoopScore,
  doctorReviewScoreTotalsDisplay,
  getDoctorReviewRecordsSnapshot,
  mergeDoctorReviewLoopRecords,
  upsertDoctorReviewRecord,
} from '../db/doctorReviewLoopStorage.js'
import {
  buildDoctorReviewAiAlerts,
  buildPrintableDoctorReviewHtml,
  deriveDoctorReviewBand,
  doctorReviewBucket,
  doctorReviewLoopAiSummaryBlock,
  doctorReviewMasterAiSummary,
  formatFlagged,
  listDoctorReviewRows,
  severityDisplay,
} from '../lib/doctorReviewLoopSimulation.js'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-violet-600 text-white hover:bg-violet-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`
const btnSuccess = `${btn} border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`

const COLS = [
  { key: 'pending_review', title: 'Pending review', sub: 'Awaiting MD eyes', badge: 'warning' },
  { key: 'urgent_cases', title: 'Urgent cases', sub: 'Immediate callback', badge: 'danger' },
  { key: 'reviewed_today', title: 'Reviewed today', sub: 'Signed today', badge: 'success' },
  { key: 'follow_up_needed', title: 'Follow-up needed', sub: 'Orders pending', badge: 'info' },
  { key: 'resolved_cases', title: 'Resolved cases', sub: 'Closed loop', badge: 'success' },
]

function stripDerived(row) {
  const { bucket: _b, riskBand: _r, ...rest } = row
  return rest
}

function ReviewCard({ row, selected, onSelect, nowMs }) {
  const band = row.riskBand || deriveDoctorReviewBand(row)
  const bucket = row.bucket ?? doctorReviewBucket(row, nowMs)
  const bucketLabel =
    bucket === 'pending_review'
      ? 'Pending'
      : bucket === 'urgent_cases'
        ? 'Urgent'
        : bucket === 'reviewed_today'
          ? 'Reviewed today'
          : bucket === 'follow_up_needed'
            ? 'Follow-up'
            : 'Resolved'

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(row.id)
        }
      }}
      className={`cursor-pointer border shadow-sm transition-shadow ${selected ? 'ring-2 ring-violet-500 ring-offset-2' : 'border-slate-100'}`}
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
          <Badge variant={bucket === 'urgent_cases' ? 'danger' : bucket === 'resolved_cases' ? 'success' : 'info'}>{bucketLabel}</Badge>
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Trigger</dt>
          <dd className="max-w-[62%] text-right font-semibold text-slate-900">{row.triggerReason}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Severity</dt>
          <dd>{severityDisplay(row.severityLevel)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Latest nursing note</p>
          <p className="mt-0.5 leading-snug text-slate-800">{row.latestNursingNote}</p>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Assigned nurse</dt>
          <dd className="font-medium">{row.assignedNurse}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Flagged</dt>
          <dd>{formatFlagged(row.timeFlagged)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Doctor</dt>
          <dd className="max-w-[58%] text-right">{row.doctorAssigned}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Status</dt>
          <dd className="font-semibold capitalize">{String(row.reviewStatus).replace(/_/g, ' ')}</dd>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {row.escalatedUrgent ? <Badge variant="danger">Escalated</Badge> : null}
          {row.familyNotified ? <Badge variant="success">Family notified</Badge> : null}
          {(row.unresolvedRepeats || 0) > 1 ? <Badge variant="warning">Repeat ×{row.unresolvedRepeats}</Badge> : null}
        </div>
        {Array.isArray(row.followUpActions) && row.followUpActions.length > 0 ? (
          <div className="rounded-lg bg-violet-50/80 px-2 py-1.5 text-[11px] text-violet-950">
            <p className="font-semibold text-violet-800">Follow-up</p>
            <p className="mt-0.5">{row.followUpActions[row.followUpActions.length - 1]?.text}</p>
          </div>
        ) : null}
        {Array.isArray(row.doctorNotes) && row.doctorNotes.length > 0 ? (
          <div className="rounded-lg bg-emerald-50/80 px-2 py-1.5 text-[11px] text-emerald-950">
            <p className="font-semibold text-emerald-800">Latest MD note</p>
            <p className="mt-0.5">{row.doctorNotes[row.doctorNotes.length - 1]?.text}</p>
          </div>
        ) : null}
      </dl>
    </Card>
  )
}

export default function DoctorReviewLoopPage() {
  const { patients } = usePatients()
  const { notes } = useNursingNotes()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [mobileCol, setMobileCol] = useState('pending_review')
  const [aiPanel, setAiPanel] = useState(null)

  const nowMs = useMemo(() => Date.now(), [tick])

  const rawRecords = useMemo(() => {
    mergeDoctorReviewLoopRecords(patients, notes)
    return getDoctorReviewRecordsSnapshot()
  }, [patients, notes, tick])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-doctor-review-loop-updated', bump)
    return () => window.removeEventListener('wmc-doctor-review-loop-updated', bump)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 90 * 1000)
    return () => window.clearInterval(id)
  }, [])

  const rows = useMemo(() => listDoctorReviewRows(rawRecords, nowMs), [rawRecords, nowMs])

  const alerts = useMemo(() => buildDoctorReviewAiAlerts(rows.map(stripDerived), nowMs), [rows, nowMs])
  const scores = useMemo(() => doctorReviewScoreTotalsDisplay(), [tick])
  const masterAi = useMemo(() => doctorReviewMasterAiSummary(rows), [rows])

  const buckets = useMemo(() => {
    return {
      pending_review: rows.filter((r) => r.bucket === 'pending_review'),
      urgent_cases: rows.filter((r) => r.bucket === 'urgent_cases'),
      reviewed_today: rows.filter((r) => r.bucket === 'reviewed_today'),
      follow_up_needed: rows.filter((r) => r.bucket === 'follow_up_needed'),
      resolved_cases: rows.filter((r) => r.bucket === 'resolved_cases'),
    }
  }, [rows])

  const selected = rows.find((r) => r.id === selectedId) || null

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }

  function requireSelection() {
    if (!selected) {
      showToast('Select a queue row first.', 'warn')
      return null
    }
    return selected
  }

  function handleMarkReviewed() {
    const row = requireSelection()
    if (!row) return
    upsertDoctorReviewRecord({
      ...stripDerived(row),
      reviewStatus: 'reviewed',
      reviewedAt: new Date().toISOString(),
      escalatedUrgent: false,
    })
    bumpDoctorReviewLoopScore(row.severityLevel === 'critical' ? 'criticalReview' : 'stable', 1)
    showToast('Marked reviewed (simulation).', 'success')
  }

  function handleEscalateUrgent() {
    const row = requireSelection()
    if (!row) return
    upsertDoctorReviewRecord({
      ...stripDerived(row),
      reviewStatus: 'urgent',
      escalatedUrgent: true,
      severityLevel:
        row.severityLevel === 'low' ? 'high' : row.severityLevel === 'moderate' ? 'high' : row.severityLevel,
    })
    bumpDoctorReviewLoopScore('criticalReview', 1)
    showToast('Escalated to urgent (simulation).', 'warn')
  }

  function handleDoctorNote() {
    const row = requireSelection()
    if (!row) return
    const text = window.prompt(`Doctor note — ${row.patientName}`, 'Reviewed chart · adjust laxative · continue monitoring')
    if (text === null) return
    appendDoctorReviewDoctorNote(row.id, text)
    if (text.trim()) showToast('Doctor note saved.')
  }

  function handleGenerateAiSummary() {
    const row = requireSelection()
    if (!row) return
    const block = doctorReviewLoopAiSummaryBlock(stripDerived(row), rawRecords)
    setAiPanel(block)
    showToast('AI summary generated for selected row.')
  }

  function handleNotifyFamily() {
    const row = requireSelection()
    if (!row) return
    upsertDoctorReviewRecord({
      ...stripDerived(row),
      familyNotified: true,
    })
    showToast('Family notified (simulation).', 'success')
  }

  function handlePrintableReport() {
    const row = requireSelection()
    if (!row) return
    const html = buildPrintableDoctorReviewHtml([stripDerived(row)], `Doctor review — ${row.patientName}`)
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) {
      showToast('Popup blocked — allow popups to print.', 'warn')
      return
    }
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <div className="mx-auto max-w-[1600px] pb-8">
      <PageHeader
        title="Doctor review loop"
        description="Auto-queue from AI note signals plus manual stewardship — simulation only; not a regulated CDS device."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Simulation mode</Badge>
            <Link
              to="/doctor-review"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Classic doctor queue
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
          <button type="button" className={btnSuccess} onClick={handleMarkReviewed} disabled={!selected}>
            Mark reviewed
          </button>
          <button type="button" className={btnDanger} onClick={handleEscalateUrgent} disabled={!selected}>
            Escalate urgent
          </button>
          <button type="button" className={btnMuted} onClick={handleDoctorNote} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <ClipboardSignature className="h-4 w-4 shrink-0" aria-hidden />
              Add doctor note
            </span>
          </button>
          <button type="button" className={btnPrimary} onClick={handleGenerateAiSummary} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              Generate AI summary
            </span>
          </button>
          <button type="button" className={btnWarn} onClick={handleNotifyFamily} disabled={!selected}>
            Notify family (sim)
          </button>
          <button type="button" className={btnMuted} onClick={handlePrintableReport} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Printer className="h-4 w-4 shrink-0" aria-hidden />
              Printable review report
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Queue refreshes from roster nursing notes + AI risk scan when data changes. Select a card before row-level actions.
        </p>
      </Card>

      <Card className="mb-3" padding="p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Master AI snapshot</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{masterAi}</p>
          </div>
        </div>
      </Card>

      {aiPanel ? (
        <Card className="mb-3" padding="p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Generated AI summary (selected row)</h3>
            <button type="button" className="text-xs font-semibold text-violet-700 hover:underline" onClick={() => setAiPanel(null)}>
              Dismiss
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {[
              ['Clinical concern summary', aiPanel.clinicalConcernSummary],
              ['Recent changes', aiPanel.recentChanges],
              ['Nursing actions taken', aiPanel.nursingActionsTaken],
              ['Suggested doctor focus', aiPanel.suggestedDoctorFocus],
              ['Follow-up recommendation', aiPanel.followUpRecommendation],
              ['Family communication draft', aiPanel.familyCommunicationDraft],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-100 bg-slate-50/90 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-800">{v}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="mb-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-violet-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Review scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Simulation tally · demo baseline · bumps when you review / escalate</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Stable', val: scores.stable },
            { label: 'Monitor', val: scores.monitor },
            { label: 'Moderate concern', val: scores.moderateConcern },
            { label: 'High risk', val: scores.highRisk },
            { label: 'Critical review', val: scores.criticalReview },
          ].map((x) => (
            <div key={x.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{x.label}</dt>
              <dd className="text-xl font-bold tabular-nums text-slate-900">{x.val}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mb-4" padding="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-600" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-slate-900">AI alerts</h3>
            <p className="text-sm text-slate-500">Deterioration · overdue queue · escalation · repeats · high-risk</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No escalation alerts on current queue snapshot.
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

      <div className="xl:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Doctor review board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-inset transition-colors ${
                mobileCol === c.key ? 'bg-violet-600 text-white ring-violet-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
              onClick={() => setMobileCol(c.key)}
            >
              <span className="line-clamp-2 max-w-[118px] text-left">{c.title}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3 pb-8">
          {buckets[mobileCol].map((row) => (
            <ReviewCard key={row.id} row={row} selected={selectedId === row.id} onSelect={setSelectedId} nowMs={nowMs} />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No rows in this column.
            </p>
          ) : null}
        </div>
      </div>

      <div className="hidden gap-3 xl:grid xl:grid-cols-5">
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
                <ReviewCard key={row.id} row={row} selected={selectedId === row.id} onSelect={setSelectedId} nowMs={nowMs} />
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
