import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardPlus,
  Download,
  FileSpreadsheet,
  Sparkles,
  Timer,
  UserCheck,
  UserX,
  PlusCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { readStaff } from '../db/otStorage.js'
import {
  addOvertimeRecordDraft,
  appendOvertimeSupervisorNote,
  bumpOvertimeLoopScore,
  mergeStaffOvertimeLoopRecords,
  upsertOvertimeRecord,
} from '../db/overtimeLoopStorage.js'
import {
  buildMonthlyOtSummaries,
  buildOtReportCsv,
  buildOvertimeLoopAiAlerts,
  buildPayrollSummaryCsv,
  currentMonthPrefix,
  deriveOtRiskBadge,
  formatShiftDate,
  listStaffOvertimeRecordsWithBuckets,
  overtimeLoopAiSummary,
  overtimeLoopScoreTotalsDisplay,
  overtimeRecordBucket,
  roleDisplayLabel,
} from '../lib/overtimeLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`
const btnSuccess = `${btn} border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`

const COLS = [
  { key: 'pending_approval', title: 'Pending approval', sub: 'Supervisor queue', badge: 'warning' },
  { key: 'approved_ot', title: 'Approved OT', sub: 'Within tolerance', badge: 'success' },
  { key: 'rejected_ot', title: 'Rejected OT', sub: 'Not payable', badge: 'danger' },
  { key: 'excessive_ot_warning', title: 'Excessive OT warning', sub: 'Approved heavy OT', badge: 'danger' },
  { key: 'monthly_summary', title: 'Monthly OT summary', sub: 'Per-staff roll-up', badge: 'info' },
]

function stripDerivedFields(row) {
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

function bumpScoresAfterApproval(rec) {
  const ot = Number(rec.overtimeHours) || 0
  if (rec.repeatedLateClockOut && ot >= 3) bumpOvertimeLoopScore('fatigueRisk', 1)
  if (ot >= 5 || rec.excessiveOtWarning) bumpOvertimeLoopScore('managementReview', 1)
  else if (ot >= 3.5) bumpOvertimeLoopScore('highOt', 1)
  else if (ot >= 1) bumpOvertimeLoopScore('monitor', 1)
  else bumpOvertimeLoopScore('normal', 1)
}

function OtRecordCard({ row, selected, onSelect }) {
  const risk = deriveOtRiskBadge(row)
  const bucket = overtimeRecordBucket(row)
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
      className={`cursor-pointer border shadow-sm transition-shadow ${selected ? 'ring-2 ring-teal-500 ring-offset-2' : 'border-slate-100'}`}
      padding="p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.staffName}</p>
          <p className="text-xs text-slate-600">
            <span className="font-semibold">{roleDisplayLabel(row.role)}</span>
            <span className="mx-1 text-slate-400">·</span>
            {formatShiftDate(row.shiftDate)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Badge variant={risk.variant}>{risk.label}</Badge>
          <Badge variant={bucket === 'pending_approval' ? 'warning' : bucket === 'rejected_ot' ? 'danger' : 'info'}>
            {String(row.approvalStatus || '').replace(/^./, (c) => c.toUpperCase())}
          </Badge>
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Scheduled</dt>
          <dd className="font-medium">{row.scheduledShift}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Clock in / out</dt>
          <dd className="font-semibold">
            {row.clockIn} → {row.clockOut}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Normal / OT</dt>
          <dd>
            <span className="tabular-nums">{row.normalHours}h</span>
            <span className="text-slate-400"> / </span>
            <span className="font-bold text-slate-900 tabular-nums">{row.overtimeHours}h OT</span>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Reason</dt>
          <dd className="max-w-[62%] text-right leading-snug">{row.overtimeReason || '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Approved by</dt>
          <dd>{row.approvedBy || '—'}</dd>
        </div>
        {(row.repeatedLateClockOut || row.understaffingFlag || row.excessiveOtWarning) && (
          <div className="flex flex-wrap gap-1 pt-1">
            {row.repeatedLateClockOut ? (
              <Badge variant="warning">Late clock-out pattern</Badge>
            ) : null}
            {row.understaffingFlag ? <Badge variant="warning">Understaffing flag</Badge> : null}
            {row.excessiveOtWarning ? <Badge variant="danger">Excessive OT flag</Badge> : null}
          </div>
        )}
        {Array.isArray(row.notes) && row.notes.length ? (
          <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">
            <p className="font-semibold text-slate-600">Latest supervisor note</p>
            <p className="mt-0.5 whitespace-pre-wrap">{row.notes[row.notes.length - 1]?.text}</p>
          </div>
        ) : null}
      </dl>
    </Card>
  )
}

function MonthlyStaffCard({ row }) {
  return (
    <Card className="border-slate-100 shadow-sm" padding="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.staffName}</p>
          <p className="text-xs text-slate-600">{roleDisplayLabel(row.role)}</p>
        </div>
        <Badge variant="info">{row.totalOtHours.toFixed(1)}h OT</Badge>
      </div>
      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Shifts (month)</dt>
          <dd className="font-semibold tabular-nums">{row.shiftCount}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Pending OT hours</dt>
          <dd className="font-semibold tabular-nums">{row.pendingHours.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Est. OT cost</dt>
          <dd className="font-bold text-slate-900 tabular-nums">${row.estimatedCost.toLocaleString()}</dd>
        </div>
      </dl>
    </Card>
  )
}

export default function StaffOvertimeLoopPage() {
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [mobileCol, setMobileCol] = useState('pending_approval')

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 120 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-staff-overtime-loop-updated', bump)
    return () => window.removeEventListener('wmc-staff-overtime-loop-updated', bump)
  }, [])

  const rows = useMemo(() => listStaffOvertimeRecordsWithBuckets(), [tick])

  const monthPrefix = useMemo(() => currentMonthPrefix(), [tick])
  const monthlyRows = useMemo(() => buildMonthlyOtSummaries(rows, monthPrefix), [rows, monthPrefix])

  const alerts = useMemo(() => buildOvertimeLoopAiAlerts(rows), [rows])
  const summary = useMemo(() => overtimeLoopAiSummary(rows), [rows])
  const scores = useMemo(() => overtimeLoopScoreTotalsDisplay(), [tick])

  const buckets = useMemo(() => {
    return {
      pending_approval: rows.filter((r) => r.bucket === 'pending_approval'),
      approved_ot: rows.filter((r) => r.bucket === 'approved_ot'),
      rejected_ot: rows.filter((r) => r.bucket === 'rejected_ot'),
      excessive_ot_warning: rows.filter((r) => r.bucket === 'excessive_ot_warning'),
    }
  }, [rows])

  const selected = rows.find((r) => r.id === selectedId) || null

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }

  function handleAddOtRecord() {
    const staff = readStaff()
    const names = staff.map((s) => `${s.id}|${s.fullName}`).join(', ')
    const pickRaw = window.prompt(`Staff (id|name) — available: ${names}`, `${staff[0]?.id}|${staff[0]?.fullName}`)
    if (pickRaw === null) return
    const [sid, ...rest] = pickRaw.split('|')
    const name = rest.join('|').trim() || staff.find((s) => s.id === sid.trim())?.fullName || 'Staff'
    const otRaw = window.prompt('Overtime hours (decimal)', '1.5')
    if (otRaw === null) return
    const ot = parseFloat(otRaw)
    if (!Number.isFinite(ot) || ot < 0) {
      showToast('Enter a valid OT hours number.', 'warn')
      return
    }
    const roleRaw = window.prompt('Role: nurse, caregiver, therapist, or supervisor', 'nurse')
    if (roleRaw === null) return
    const roleNorm = String(roleRaw).toLowerCase().trim()
    const role =
      ['nurse', 'caregiver', 'therapist', 'supervisor'].includes(roleNorm) ? roleNorm : 'nurse'
    const reason = window.prompt('Overtime reason', 'Patient care coverage') || 'Patient care coverage'
    addOvertimeRecordDraft({
      staffId: sid.trim(),
      staffName: name,
      role,
      overtimeHours: ot,
      overtimeReason: reason,
      excessiveOtWarning: ot >= 4,
      repeatedLateClockOut: ot >= 3 && Math.random() > 0.65,
      understaffingFlag: Math.random() > 0.8,
    })
    showToast('OT row added.', 'success')
  }

  function handleApprove() {
    if (!selected) {
      showToast('Select a shift card first.', 'warn')
      return
    }
    if (String(selected.approvalStatus).toLowerCase() !== 'pending') {
      showToast('Only pending rows can be approved.', 'warn')
      return
    }
    bumpScoresAfterApproval(selected)
    upsertOvertimeRecord({
      ...stripDerivedFields(selected),
      approvalStatus: 'approved',
      approvedBy: 'Supervisor',
      excessiveOtWarning: Boolean(selected.excessiveOtWarning || Number(selected.overtimeHours) >= 4),
    })
    showToast(`Approved OT for ${selected.staffName}.`, 'success')
  }

  function handleReject() {
    if (!selected) {
      showToast('Select a shift card first.', 'warn')
      return
    }
    if (String(selected.approvalStatus).toLowerCase() !== 'pending') {
      showToast('Only pending rows can be rejected.', 'warn')
      return
    }
    bumpOvertimeLoopScore('monitor', 1)
    upsertOvertimeRecord({
      ...stripDerivedFields(selected),
      approvalStatus: 'rejected',
      approvedBy: null,
    })
    showToast(`Rejected OT for ${selected.staffName}.`, 'warn')
  }

  function handleSupervisorNote() {
    if (!selected) {
      showToast('Select a shift card first.', 'warn')
      return
    }
    const text = window.prompt(`Supervisor note — ${selected.staffName}`, '')
    if (text === null) return
    appendOvertimeSupervisorNote(selected.id, text)
    if (text.trim()) showToast('Supervisor note saved.')
  }

  function handleGenerateReport() {
    const csv = buildOtReportCsv(rows.map(stripDerivedFields))
    downloadText(`staff-ot-report-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    showToast('OT report CSV downloaded.')
  }

  function handleExportPayroll() {
    const csv = buildPayrollSummaryCsv(monthlyRows, monthPrefix)
    downloadText(`payroll-ot-summary-${monthPrefix}.csv`, csv)
    showToast('Payroll summary CSV downloaded.')
  }

  return (
    <div className="mx-auto max-w-[1600px] pb-8">
      <PageHeader
        title="Staff Overtime Loop"
        description="Supervisor workflow for local overtime approvals, fatigue cues, and payroll-friendly exports. For operational support only — not legal payroll advice."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Local mode</Badge>
            <Link
              to="/overtime"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Overtime dashboard
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
          <button type="button" className={btnPrimary} onClick={handleAddOtRecord}>
            <span className="inline-flex items-center justify-center gap-1">
              <PlusCircle className="h-4 w-4 shrink-0" aria-hidden />
              Add OT record
            </span>
          </button>
          <button type="button" className={btnSuccess} onClick={handleApprove} disabled={!selected}>
            <span className="inline-flex items-center justify-center gap-1">
              <UserCheck className="h-4 w-4 shrink-0" aria-hidden />
              Approve OT
            </span>
          </button>
          <button type="button" className={btnDanger} onClick={handleReject} disabled={!selected}>
            <span className="inline-flex items-center justify-center gap-1">
              <UserX className="h-4 w-4 shrink-0" aria-hidden />
              Reject OT
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleSupervisorNote} disabled={!selected}>
            <span className="inline-flex items-center justify-center gap-1">
              <ClipboardPlus className="h-4 w-4 shrink-0" aria-hidden />
              Add supervisor note
            </span>
          </button>
          <button type="button" className={btnWarn} onClick={handleGenerateReport}>
            <span className="inline-flex items-center justify-center gap-1">
              <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
              Generate OT report
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleExportPayroll}>
            <span className="inline-flex items-center justify-center gap-1">
              <Download className="h-4 w-4 shrink-0" aria-hidden />
              Export payroll summary
            </span>
          </button>
        </div>
        {selected ? (
          <p className="mt-3 text-xs text-slate-600">
            Selected: <span className="font-semibold text-slate-900">{selected.staffName}</span> ·{' '}
            {formatShiftDate(selected.shiftDate)} ·{' '}
            <span className="tabular-nums">{selected.overtimeHours}h OT</span>
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">Tap a shift card to enable approve / reject / note actions.</p>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-orange-400 to-rose-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Timer className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Staff with highest OT</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">{summary.highestOtStaff}</p>
              <p className="text-xs text-slate-600">Peak single shift: {summary.highestSingleShift}</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-teal-400 to-cyan-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monthly OT cost estimate</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">{summary.monthlyOtCostEstimate}</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden sm:col-span-2" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-violet-400 to-indigo-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supervisor action checklist</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.supervisorChecklist}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-3" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">AI summary</h3>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fatigue risk recommendation</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{summary.fatigueRecommendation}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Staffing adjustment suggestion</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{summary.staffingSuggestion}</p>
          </div>
        </div>
      </Card>

      <Card className="mt-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">OT scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Local tally · updates when you approve/reject</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Normal', val: scores.normal },
            { label: 'Monitor', val: scores.monitor },
            { label: 'High OT', val: scores.highOt },
            { label: 'Fatigue risk', val: scores.fatigueRisk },
            { label: 'Management review', val: scores.managementReview },
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
            <p className="text-sm text-slate-500">Excessive OT · late clock-outs · fatigue · understaffing · payroll review</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No overtime alerts on this snapshot.
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
      <div className="mt-6 xl:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Overtime board</p>
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
              <span className="ml-1 tabular-nums opacity-80">
                (
                {c.key === 'monthly_summary' ? monthlyRows.length : buckets[c.key]?.length ?? 0})
              </span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {mobileCol === 'monthly_summary'
            ? monthlyRows.map((row) => <MonthlyStaffCard key={row.staffId || row.staffName} row={row} />)
            : buckets[mobileCol].map((row) => (
                <OtRecordCard key={row.id} row={row} selected={selectedId === row.id} onSelect={setSelectedId} />
              ))}
          {mobileCol !== 'monthly_summary' && buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No shifts in this column.
            </p>
          ) : null}
          {mobileCol === 'monthly_summary' && monthlyRows.length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No month-to-date OT yet.
            </p>
          ) : null}
        </div>
      </div>

      {/* Desktop board */}
      <div className="mt-6 hidden gap-3 xl:grid xl:grid-cols-5">
        {COLS.map((col) => (
          <div key={col.key} className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold leading-tight text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>
                  {col.key === 'monthly_summary' ? monthlyRows.length : buckets[col.key]?.length ?? 0}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-13rem)] min-h-[220px] space-y-3 overflow-y-auto overscroll-contain p-3">
              {col.key === 'monthly_summary'
                ? monthlyRows.map((row) => <MonthlyStaffCard key={row.staffId || row.staffName} row={row} />)
                : buckets[col.key].map((row) => (
                    <OtRecordCard key={row.id} row={row} selected={selectedId === row.id} onSelect={setSelectedId} />
                  ))}
              {col.key === 'monthly_summary' && monthlyRows.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">Empty</p>
              ) : null}
              {col.key !== 'monthly_summary' && buckets[col.key].length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">Empty</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
