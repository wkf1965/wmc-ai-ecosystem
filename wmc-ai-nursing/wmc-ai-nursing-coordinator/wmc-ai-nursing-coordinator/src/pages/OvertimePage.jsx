import { useMemo, useState } from 'react'
import { AlertTriangle, Download, Printer, Sparkles, Calculator, CheckCircle2, XCircle } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import {
  readOvertimeClaims,
  saveOvertimeClaim,
  computeOtHours,
  generateClaimId,
  monthlyOtByNurse,
  buildOvertimeCsv,
} from '../db/overtimeClaimsStorage.js'
import { analyzeOvertimeWorkload } from '../lib/overtimeAiWarnings.js'
import {
  readOtRecords,
  saveOtRecord,
  setOtApprovalStatus,
  getOtRecordsForMonth,
  getPayrollSummary,
  refreshPayrollSummary,
  generateOtRecordId,
} from '../db/otPayrollStorage.js'
import {
  computeOtHours as calcOtHours,
  computeOtAmount,
  getRecordStatus,
  recordStatusVariant,
  DEFAULT_OT_RATE,
  RECORD_STATUS,
  currentYearMonth,
  formatMonthLabel,
} from '../lib/otPayrollCalculation.js'

const STATUS_OPTS = ['pending', 'approved', 'rejected']

const cls = {
  input:
    'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-400/30',
  label: 'text-xs font-semibold uppercase tracking-wide text-slate-500',
}

function ymNow() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

export default function OvertimePage() {
  // ── Existing OT claim state ─────────────────────────────────────────────
  const [version, setVersion] = useState(0)
  const [filterStatus, setFilterStatus] = useState('all')
  const [summaryMonth, setSummaryMonth] = useState(ymNow())

  const [nurseName, setNurseName] = useState('')
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [normalShiftHours, setNormalShiftHours] = useState('8')
  const [otStartTime, setOtStartTime] = useState('15:00')
  const [otEndTime, setOtEndTime] = useState('17:30')
  const [otReason, setOtReason] = useState('')
  const [toast, setToast] = useState(null)

  // ── OT Payroll Calculation state ────────────────────────────────────────
  const [payrollVersion, setPayrollVersion] = useState(0)
  const [payrollMonth, setPayrollMonth]     = useState(currentYearMonth())
  const [supName, setSupName]               = useState('')

  // New OT record form fields (punch-based)
  const [pr_staffName,      setPrStaffName]      = useState('')
  const [pr_date,           setPrDate]           = useState(() => new Date().toISOString().slice(0, 10))
  const [pr_shift,          setPrShift]          = useState('Morning')
  const [pr_scheduledStart, setPrScheduledStart] = useState('07:00')
  const [pr_scheduledEnd,   setPrScheduledEnd]   = useState('15:00')
  const [pr_punchIn,        setPrPunchIn]        = useState('')
  const [pr_punchOut,       setPrPunchOut]       = useState('')
  const [pr_otRate,         setPrOtRate]         = useState(String(DEFAULT_OT_RATE))
  const [pr_remarks,        setPrRemarks]        = useState('')

  const payrollRecords = useMemo(() => getOtRecordsForMonth(payrollMonth), [payrollVersion, payrollMonth])
  const payrollSummary = useMemo(() => getPayrollSummary(payrollMonth),    [payrollVersion, payrollMonth])

  // Live preview while filling the form
  const previewRecordStatus = useMemo(() => getRecordStatus(pr_punchIn, pr_punchOut), [pr_punchIn, pr_punchOut])
  const previewOtHours  = useMemo(
    () => previewRecordStatus === RECORD_STATUS.COMPLETE ? calcOtHours(pr_scheduledEnd, pr_punchOut) : 0,
    [previewRecordStatus, pr_scheduledEnd, pr_punchOut],
  )
  const previewOtAmount = useMemo(
    () => computeOtAmount(previewOtHours, Number(pr_otRate) || DEFAULT_OT_RATE),
    [previewOtHours, pr_otRate],
  )

  function bumpPayroll() {
    setPayrollVersion((v) => v + 1)
    window.dispatchEvent(new Event('wmc-clinical-data-updated'))
  }

  function handlePayrollAdd(e) {
    e.preventDefault()
    if (!pr_staffName.trim()) { showToast('Enter staff name.', 'warning'); return }
    if (!pr_punchIn.trim())   { showToast('Punch in time is required.', 'warning'); return }
    const record = saveOtRecord({
      id:              generateOtRecordId(),
      date:            pr_date,
      staff_name:      pr_staffName.trim(),
      shift:           pr_shift,
      scheduled_start: pr_scheduledStart,
      scheduled_end:   pr_scheduledEnd,
      punch_in:        pr_punchIn,
      punch_out:       pr_punchOut,
      ot_rate:         Number(pr_otRate) || DEFAULT_OT_RATE,
      remarks:         pr_remarks.trim(),
      approval_status: 'Pending',
    })
    if (!record) { showToast('Could not save OT record.', 'warning'); return }
    refreshPayrollSummary(payrollMonth)
    bumpPayroll()
    const statusMsg = record.record_status === RECORD_STATUS.MISSING_PUNCH_OUT
      ? 'Saved — status: Missing Punch Out (supervisor review needed)'
      : 'OT record saved (pending approval).'
    showToast(statusMsg)
    setPrRemarks('')
    setPrStaffName('')
    setPrPunchIn('')
    setPrPunchOut('')
  }

  function approvePayrollRecord(id) {
    if (!supName.trim()) { showToast('Enter supervisor name first.', 'warning'); return }
    setOtApprovalStatus(id, 'Approved', supName.trim())
    refreshPayrollSummary(payrollMonth)
    bumpPayroll()
    showToast('OT record approved.')
  }

  function rejectPayrollRecord(id) {
    if (!supName.trim()) { showToast('Enter supervisor name first.', 'warning'); return }
    setOtApprovalStatus(id, 'Rejected', supName.trim())
    refreshPayrollSummary(payrollMonth)
    bumpPayroll()
    showToast('OT record rejected.')
  }

  const claims = useMemo(() => readOvertimeClaims(), [version])

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return claims
    return claims.filter((c) => c.status === filterStatus)
  }, [claims, filterStatus])

  const summaryRows = useMemo(() => monthlyOtByNurse(summaryMonth), [claims, summaryMonth])

  const aiWarnings = useMemo(() => analyzeOvertimeWorkload(claims, summaryMonth), [claims, summaryMonth])

  function bump() {
    setVersion((v) => v + 1)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 2600)
  }

  function handleAdd(e) {
    e.preventDefault()
    if (!nurseName.trim()) {
      showToast('Enter nurse name.', 'warning')
      return
    }
    const nh = Number(normalShiftHours)
    const totalOtHours = computeOtHours(shiftDate, otStartTime, otEndTime)
    if (totalOtHours <= 0) {
      showToast('Check overtime start/end times.', 'warning')
      return
    }
    const row = {
      id: generateClaimId(),
      nurseName: nurseName.trim(),
      shiftDate,
      normalShiftHours: Number.isFinite(nh) ? nh : 8,
      otStartTime,
      otEndTime,
      totalOtHours,
      otReason: otReason.trim() || '—',
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    const saved = saveOvertimeClaim(row)
    if (!saved) {
      showToast('Could not save.', 'warning')
      return
    }
    bump()
    showToast('Overtime claim saved (pending approval).')
    setOtReason('')
  }

  function setStatus(id, status) {
    const c = claims.find((x) => x.id === id)
    if (!c) return
    saveOvertimeClaim({ ...c, status })
    bump()
  }

  function exportCsv() {
    const csv = buildOvertimeCsv()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wmc-overtime-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    window.print()
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Nurse overtime"
        description="Log overtime extensions with start/end times, reasons, and approval status. Simulation only — not payroll legal advice."
        action={
          <Badge variant="info" className="self-start">
            Simulation mode
          </Badge>
        }
      />

      {/* ── OT PAYROLL CALCULATION MODULE ───────────────────────────────── */}
      <div className="mb-8 rounded-2xl border border-teal-200 bg-teal-50/40 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Calculator className="h-5 w-5 text-teal-700" aria-hidden />
          <h2 className="text-lg font-bold text-teal-900">OT Payroll Calculation</h2>
          <span className="ml-auto rounded-full border border-teal-200 bg-white px-3 py-0.5 text-xs font-semibold text-teal-700">
            Approved OT only · RM{DEFAULT_OT_RATE}/hr default
          </span>
        </div>

        {/* Month picker + supervisor */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className={cls.label} htmlFor="pr-month">Payroll month</label>
            <input
              id="pr-month"
              type="month"
              className={cls.input}
              value={payrollMonth}
              onChange={(e) => setPayrollMonth(e.target.value)}
            />
          </div>
          <div className="min-w-[14rem]">
            <label className={cls.label} htmlFor="pr-sup">Supervisor name (for approval)</label>
            <input
              id="pr-sup"
              className={cls.input}
              placeholder="Charge RN / Nurse Manager"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── New OT record form ─────────────────────────────── */}
          <Card padding="p-4 sm:p-5">
            <h3 className="text-base font-semibold text-slate-900">Log OT Record</h3>
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={handlePayrollAdd}>
              <div className="sm:col-span-2">
                <label className={cls.label} htmlFor="pr-staff">Staff name</label>
                <input id="pr-staff" className={cls.input} value={pr_staffName} onChange={(e) => setPrStaffName(e.target.value)} />
              </div>

              <div>
                <label className={cls.label} htmlFor="pr-date">Date</label>
                <input id="pr-date" type="date" className={cls.input} value={pr_date} onChange={(e) => setPrDate(e.target.value)} />
              </div>
              <div>
                <label className={cls.label} htmlFor="pr-shift">Shift</label>
                <select id="pr-shift" className={cls.input} value={pr_shift} onChange={(e) => setPrShift(e.target.value)}>
                  <option>Morning</option>
                  <option>Afternoon</option>
                  <option>Night</option>
                </select>
              </div>

              <div>
                <label className={cls.label} htmlFor="pr-ss">Scheduled start</label>
                <input id="pr-ss" type="time" className={cls.input} value={pr_scheduledStart} onChange={(e) => setPrScheduledStart(e.target.value)} />
              </div>
              <div>
                <label className={cls.label} htmlFor="pr-se">Scheduled end</label>
                <input id="pr-se" type="time" className={cls.input} value={pr_scheduledEnd} onChange={(e) => setPrScheduledEnd(e.target.value)} />
              </div>

              <div>
                <label className={cls.label} htmlFor="pr-pi">
                  Punch in <span className="text-red-500">*</span>
                </label>
                <input id="pr-pi" type="time" className={cls.input} value={pr_punchIn} onChange={(e) => setPrPunchIn(e.target.value)} />
              </div>
              <div>
                <label className={cls.label} htmlFor="pr-po">Punch out</label>
                <input id="pr-po" type="time" className={cls.input} value={pr_punchOut} onChange={(e) => setPrPunchOut(e.target.value)} />
              </div>

              <div>
                <label className={cls.label} htmlFor="pr-rate">OT rate (RM/hr)</label>
                <input
                  id="pr-rate"
                  type="number"
                  min="0"
                  step="0.5"
                  className={cls.input}
                  value={pr_otRate}
                  onChange={(e) => setPrOtRate(e.target.value)}
                />
              </div>
              <div className="flex flex-col justify-end gap-1">
                <p className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                  previewRecordStatus === RECORD_STATUS.COMPLETE
                    ? 'border-teal-200 bg-teal-50 text-teal-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                  {previewRecordStatus === RECORD_STATUS.COMPLETE
                    ? `OT: ${previewOtHours}h = RM${previewOtAmount}`
                    : previewRecordStatus}
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className={cls.label} htmlFor="pr-remarks">Remarks</label>
                <textarea id="pr-remarks" rows={2} className={cls.input} value={pr_remarks} onChange={(e) => setPrRemarks(e.target.value)} />
              </div>

              <div className="sm:col-span-2">
                <button type="submit" className="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700">
                  Save OT Record (pending approval)
                </button>
              </div>
            </form>
          </Card>

          {/* ── Monthly payroll summary ────────────────────────── */}
          <Card padding="p-4 sm:p-5">
            <h3 className="text-base font-semibold text-slate-900">
              Payroll Summary — {formatMonthLabel(payrollMonth)}
            </h3>
            {payrollSummary.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No approved OT records for this month.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-2 pr-2">Staff</th>
                      <th className="py-2 pr-2 text-right">OT hrs</th>
                      <th className="py-2 pr-2 text-right">Rate</th>
                      <th className="py-2 text-right">Total pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollSummary.map((s) => (
                      <tr key={s.staff_name} className="border-b border-slate-100">
                        <td className="py-2 pr-2 font-medium text-slate-900">{s.staff_name}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{s.total_ot_hours}</td>
                        <td className="py-2 pr-2 text-right tabular-nums text-slate-500">RM{s.ot_rate}</td>
                        <td className="py-2 text-right font-bold tabular-nums text-teal-700">RM{s.total_ot_amount}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-300">
                      <td colSpan={3} className="py-2 text-xs font-semibold uppercase text-slate-500">Total</td>
                      <td className="py-2 text-right font-bold tabular-nums text-slate-900">
                        RM{payrollSummary.reduce((s, r) => s + r.total_ot_amount, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ── OT Records table (pending + approved for month) ─────────────── */}
        {payrollRecords.length > 0 && (
          <Card padding="p-4 sm:p-6" className="mt-4">
            <h3 className="mb-3 text-base font-semibold text-slate-900">
              OT Records — {formatMonthLabel(payrollMonth)}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-2">Staff</th>
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Shift</th>
                    <th className="py-2 pr-2">Punch In</th>
                    <th className="py-2 pr-2">Punch Out</th>
                    <th className="py-2 pr-2">OT hrs</th>
                    <th className="py-2 pr-2">Amount</th>
                    <th className="py-2 pr-2">Record</th>
                    <th className="py-2 pr-2">Approval</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollRecords.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="py-2 pr-2 font-medium text-slate-900">{r.staff_name}</td>
                      <td className="py-2 pr-2 tabular-nums text-slate-700">{r.date}</td>
                      <td className="py-2 pr-2 text-slate-600">{r.shift}</td>
                      <td className="py-2 pr-2 tabular-nums">{r.punch_in  || <span className="text-red-500">—</span>}</td>
                      <td className="py-2 pr-2 tabular-nums">{r.punch_out || <span className="text-amber-600">Missing</span>}</td>
                      <td className="py-2 pr-2 font-semibold tabular-nums text-teal-800">{r.ot_hours}</td>
                      <td className="py-2 pr-2 tabular-nums">RM{r.ot_amount}</td>
                      <td className="py-2 pr-2">
                        <Badge variant={recordStatusVariant(r.record_status)}>
                          {r.record_status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2">
                        <Badge
                          variant={
                            r.approval_status === 'Approved'
                              ? 'success'
                              : r.approval_status === 'Rejected'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {r.approval_status}
                        </Badge>
                      </td>
                      <td className="py-2">
                        {/* Approve/Reject only available for Complete records */}
                        {r.record_status === RECORD_STATUS.COMPLETE && r.approval_status === 'Pending' && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              title="Approve"
                              onClick={() => approvePayrollRecord(r.id)}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              title="Reject"
                              onClick={() => rejectPayrollRecord(r.id)}
                              className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
                            >
                              <XCircle className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        )}
                        {r.record_status !== RECORD_STATUS.COMPLETE && (
                          <span className="text-xs italic text-amber-600">Fix record first</span>
                        )}
                        {r.record_status === RECORD_STATUS.COMPLETE && r.approval_status !== 'Pending' && (
                          <span className="text-xs text-slate-500">{r.approved_by || '—'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      {/* ── END OT PAYROLL CALCULATION MODULE ───────────────────────────── */}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #overtime-print-area, #overtime-print-area * { visibility: visible; }
          #overtime-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
        }
      `}</style>

      {toast ? (
        <div
          role="status"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
            toast.type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      <div id="overtime-print-area">
        <div className="mb-4 flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </button>
          <button
            type="button"
            onClick={printReport}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" aria-hidden />
            Print report
          </button>
        </div>

        {aiWarnings.length > 0 ? (
          <Card className="mb-4 border-amber-200 bg-amber-50/60 print:break-inside-avoid">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-700" aria-hidden />
              <h3 className="text-base font-semibold text-slate-900">AI workload warnings ({summaryMonth})</h3>
            </div>
            <ul className="mt-3 space-y-2">
              {aiWarnings.map((w, i) => (
                <li
                  key={`${w.nurseName}-${i}`}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    w.level === 'high' ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-white text-amber-950'
                  }`}
                >
                  <span className="mr-2 inline-flex items-center gap-1 font-bold">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    {w.level === 'high' ? 'High' : 'Moderate'}
                  </span>
                  {w.message}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="mb-4 grid gap-4 lg:grid-cols-2 print:hidden">
          <Card padding="p-4 sm:p-5">
            <h3 className="text-base font-semibold text-slate-900">New overtime claim</h3>
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={handleAdd}>
              <div className="sm:col-span-2">
                <label className={cls.label} htmlFor="ot-nurse">
                  Nurse name
                </label>
                <input id="ot-nurse" className={cls.input} value={nurseName} onChange={(e) => setNurseName(e.target.value)} />
              </div>
              <div>
                <label className={cls.label} htmlFor="ot-date">
                  Shift date
                </label>
                <input id="ot-date" type="date" className={cls.input} value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
              </div>
              <div>
                <label className={cls.label} htmlFor="ot-normal">
                  Normal shift hours
                </label>
                <input
                  id="ot-normal"
                  type="number"
                  min="0"
                  step="0.5"
                  className={cls.input}
                  value={normalShiftHours}
                  onChange={(e) => setNormalShiftHours(e.target.value)}
                />
              </div>
              <div>
                <label className={cls.label} htmlFor="ot-start">
                  Overtime start
                </label>
                <input id="ot-start" type="time" className={cls.input} value={otStartTime} onChange={(e) => setOtStartTime(e.target.value)} />
              </div>
              <div>
                <label className={cls.label} htmlFor="ot-end">
                  Overtime end
                </label>
                <input id="ot-end" type="time" className={cls.input} value={otEndTime} onChange={(e) => setOtEndTime(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={cls.label} htmlFor="ot-reason">
                  OT reason
                </label>
                <textarea
                  id="ot-reason"
                  rows={2}
                  className={cls.input}
                  value={otReason}
                  onChange={(e) => setOtReason(e.target.value)}
                  placeholder="Short staffing, admission surge, code coverage…"
                />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700">
                  Save claim (pending)
                </button>
              </div>
            </form>
          </Card>

          <Card padding="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Monthly OT summary</h3>
              <input
                type="month"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                value={summaryMonth}
                onChange={(e) => setSummaryMonth(e.target.value)}
              />
            </div>
            {summaryRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No approved/pending OT in this month.</p>
            ) : (
              <table className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2">Nurse</th>
                    <th className="py-2 text-right">OT hours</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((r) => (
                    <tr key={r.nurseName} className="border-b border-slate-100">
                      <td className="py-2 font-medium text-slate-900">{r.nurseName}</td>
                      <td className="py-2 text-right tabular-nums">{r.totalHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card padding="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900">Overtime report</h3>
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium print:hidden"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              {STATUS_OPTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-2">Nurse</th>
                  <th className="py-2 pr-2">Shift date</th>
                  <th className="py-2 pr-2">Normal h</th>
                  <th className="py-2 pr-2">OT start</th>
                  <th className="py-2 pr-2">OT end</th>
                  <th className="py-2 pr-2">Total OT</th>
                  <th className="py-2 pr-2">Reason</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-600">
                      No rows.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100">
                      <td className="py-2 pr-2 font-medium text-slate-900">{c.nurseName}</td>
                      <td className="py-2 pr-2 tabular-nums text-slate-700">{c.shiftDate}</td>
                      <td className="py-2 pr-2 tabular-nums">{c.normalShiftHours}</td>
                      <td className="py-2 pr-2 tabular-nums">{c.otStartTime}</td>
                      <td className="py-2 pr-2 tabular-nums">{c.otEndTime}</td>
                      <td className="py-2 pr-2 font-semibold tabular-nums text-teal-800">{c.totalOtHours}</td>
                      <td className="max-w-[12rem] truncate py-2 pr-2 text-slate-600" title={c.otReason}>
                        {c.otReason}
                      </td>
                      <td className="py-2 pr-2">
                        <Badge
                          variant={
                            c.status === 'approved' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'
                          }
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-2 print:hidden">
                        <div className="flex flex-wrap gap-1">
                          {STATUS_OPTS.filter((s) => s !== c.status).map((s) => (
                            <button
                              key={s}
                              type="button"
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                              onClick={() => setStatus(c.id, s)}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
