import { useMemo, useState } from 'react'
import {
  Users,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Trophy,
  CalendarDays,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ClockAlert,
} from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import {
  readRecords,
  saveRecord,
  setApproval,
  getRecordsForDate,
  getTodayStats,
  getMonthlyOtRanking,
  generateId,
} from '../db/attendancePunchStorage.js'
import {
  formatTime12h,
  todayString,
  currentYearMonth,
  formatMonthLabel,
  RECORD_STATUS,
  APPROVAL_STATUS,
  DEFAULT_OT_RATE,
} from '../lib/attendanceCalculation.js'

const cls = {
  input:  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-400/30',
  label:  'text-xs font-semibold uppercase tracking-wide text-slate-500',
}

function statusVariant(status) {
  switch (status) {
    case RECORD_STATUS.OT_COMPLETE:        return 'success'
    case RECORD_STATUS.NORMAL_DUTY:        return 'success'
    case RECORD_STATUS.ON_DUTY:            return 'info'
    case RECORD_STATUS.ON_OT:             return 'warning'
    case RECORD_STATUS.MISSING_PUNCH_OUT:  return 'danger'
    case RECORD_STATUS.MISSING_OT_OUT:    return 'danger'
    default:                              return 'warning'
  }
}

export default function AttendanceDashboardPage() {
  const [version,   setVersion]   = useState(0)
  const [viewDate,  setViewDate]  = useState(todayString())
  const [rankMonth, setRankMonth] = useState(currentYearMonth())
  const [supName,   setSupName]   = useState('')
  const [toast,     setToast]     = useState(null)

  // Manual record form
  const [mStaff,    setMStaff]    = useState('')
  const [mDate,     setMDate]     = useState(todayString())
  const [mPunchIn,  setMPunchIn]  = useState('')
  const [mPunchOut, setMPunchOut] = useState('')
  const [mOtIn,     setMOtIn]     = useState('')
  const [mOtOut,    setMOtOut]    = useState('')
  const [mRemarks,  setMRemarks]  = useState('')

  const bump = () => setVersion((v) => v + 1)

  const todayStats  = useMemo(() => getTodayStats(),                 [version])
  const dateRecords = useMemo(() => getRecordsForDate(viewDate),     [version, viewDate])
  const otRanking   = useMemo(() => getMonthlyOtRanking(rankMonth),  [version, rankMonth])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 3000)
  }

  function handleManualAdd(e) {
    e.preventDefault()
    if (!mStaff.trim()) { showToast('Enter staff name.', 'warning'); return }
    if (!mPunchIn.trim()) { showToast('Normal punch-in time required.', 'warning'); return }
    const rec = saveRecord({
      id:                generateId(),
      date:              mDate,
      staff_name:        mStaff.trim(),
      telegram_username: '',
      normal_punch_in:   mPunchIn,
      normal_punch_out:  mPunchOut,
      ot_in:             mOtIn,
      ot_out:            mOtOut,
      ot_rate:           DEFAULT_OT_RATE,
      remarks:           mRemarks.trim(),
    })
    if (!rec) { showToast('Could not save.', 'warning'); return }
    bump()
    showToast(`Saved — ${rec.record_status}`)
    setMStaff(''); setMPunchIn(''); setMPunchOut(''); setMOtIn(''); setMOtOut(''); setMRemarks('')
  }

  function handleApprove(id) {
    if (!supName.trim()) { showToast('Enter supervisor name first.', 'warning'); return }
    setApproval(id, APPROVAL_STATUS.APPROVED, supName.trim())
    bump(); showToast('Approved.')
  }

  function handleReject(id) {
    if (!supName.trim()) { showToast('Enter supervisor name first.', 'warning'); return }
    setApproval(id, APPROVAL_STATUS.REJECTED, supName.trim())
    bump(); showToast('Rejected.')
  }

  const kpis = [
    { label: 'On Normal Duty',   value: todayStats.onDutyCount,          icon: Users,         color: 'text-teal-700',  bg: 'bg-teal-50',  border: 'border-teal-200' },
    { label: 'On OT Now',        value: todayStats.onOtCount,            icon: ClockAlert,    color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
    { label: 'Missing Punch Out',value: todayStats.missingPunchOutCount, icon: AlertTriangle, color: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200' },
    { label: 'OT Hours Today',   value: `${todayStats.totalOtHoursToday}h`, icon: Clock,      color: 'text-blue-700',  bg: 'bg-blue-50',  border: 'border-blue-200' },
    { label: 'Pending Approval', value: todayStats.pendingApprovalCount, icon: ShieldAlert,  color: 'text-purple-700',bg: 'bg-purple-50',border: 'border-purple-200' },
  ]

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Attendance & OT Dashboard"
        description="Normal duty and overtime tracking — integrates with WMC AI Telegram bot."
        action={<Badge variant="info" className="self-start">Telegram-synced</Badge>}
      />

      {toast && (
        <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
          toast.type === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900'
        }`}>{toast.msg}</div>
      )}

      {/* ── KPI cards ─────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map(({ label, value, icon: Icon, color, bg, border }) => (
          <Card key={label} padding="p-4" className={`border ${border} ${bg}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</p>
                <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
              </div>
              <Icon className={`h-6 w-6 ${color} opacity-60`} aria-hidden />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Manual entry form ──────────────────────────────────────── */}
        <Card padding="p-4 sm:p-5">
          <h3 className="text-base font-semibold text-slate-900">Manual Attendance Entry</h3>
          <p className="mt-1 text-xs text-slate-500">For corrections or records not captured via Telegram.</p>
          <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={handleManualAdd}>
            <div className="sm:col-span-2">
              <label className={cls.label} htmlFor="m-staff">Staff name / @username</label>
              <input id="m-staff" className={cls.input} value={mStaff} onChange={(e) => setMStaff(e.target.value)} />
            </div>
            <div>
              <label className={cls.label} htmlFor="m-date">Date</label>
              <input id="m-date" type="date" className={cls.input} value={mDate} onChange={(e) => setMDate(e.target.value)} />
            </div>
            <div />

            <div>
              <label className={cls.label} htmlFor="m-pi">Normal punch in <span className="text-red-500">*</span></label>
              <input id="m-pi" type="time" className={cls.input} value={mPunchIn} onChange={(e) => setMPunchIn(e.target.value)} />
            </div>
            <div>
              <label className={cls.label} htmlFor="m-po">Normal punch out</label>
              <input id="m-po" type="time" className={cls.input} value={mPunchOut} onChange={(e) => setMPunchOut(e.target.value)} />
            </div>
            <div>
              <label className={cls.label} htmlFor="m-oi">OT in</label>
              <input id="m-oi" type="time" className={cls.input} value={mOtIn} onChange={(e) => setMOtIn(e.target.value)} />
            </div>
            <div>
              <label className={cls.label} htmlFor="m-oo">OT out</label>
              <input id="m-oo" type="time" className={cls.input} value={mOtOut} onChange={(e) => setMOtOut(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={cls.label} htmlFor="m-rmk">Remarks</label>
              <textarea id="m-rmk" rows={2} className={cls.input} value={mRemarks} onChange={(e) => setMRemarks(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700">
                Save Record
              </button>
            </div>
          </form>
        </Card>

        {/* ── Monthly OT Ranking ────────────────────────────────────── */}
        <Card padding="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" aria-hidden />
              <h3 className="text-base font-semibold text-slate-900">Monthly OT Ranking</h3>
            </div>
            <input
              type="month"
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold"
              value={rankMonth}
              onChange={(e) => setRankMonth(e.target.value)}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">OT Complete + Approved records only</p>

          {otRanking.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No approved OT records for {formatMonthLabel(rankMonth)}.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {otRanking.map((r, i) => (
                <li key={r.staff_name} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0 ? 'bg-amber-400 text-white'
                      : i === 1 ? 'bg-slate-300 text-slate-800'
                      : i === 2 ? 'bg-orange-300 text-white'
                      : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>
                    <span className="text-sm font-medium text-slate-900">{r.staff_name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-teal-700">{r.total_ot_hours}h</p>
                    <p className="text-xs text-slate-500">RM{r.total_ot_amount}</p>
                  </div>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
                <span className="font-semibold text-slate-700">Total</span>
                <span className="font-bold text-slate-900">
                  {otRanking.reduce((s, r) => s + r.total_ot_hours,  0).toFixed(2)}h &nbsp;
                  RM{otRanking.reduce((s, r) => s + r.total_ot_amount, 0).toFixed(2)}
                </span>
              </li>
            </ol>
          )}
        </Card>
      </div>

      {/* ── Daily records table ──────────────────────────────────────────── */}
      <Card padding="p-4 sm:p-6" className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-base font-semibold text-slate-900">Attendance Records</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold"
              value={viewDate}
              onChange={(e) => setViewDate(e.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm"
              placeholder="Supervisor name"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
            />
            <button type="button" onClick={bump}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Refresh">
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {dateRecords.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No records for {viewDate}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Staff</th>
                  <th className="py-2 pr-3">Punch In</th>
                  <th className="py-2 pr-3">Punch Out</th>
                  <th className="py-2 pr-3">OT In</th>
                  <th className="py-2 pr-3">OT Out</th>
                  <th className="py-2 pr-3">OT Hrs</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Approval</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dateRecords.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-900">{r.staff_name}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatTime12h(r.normal_punch_in)}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {r.normal_punch_out
                        ? formatTime12h(r.normal_punch_out)
                        : <span className="font-semibold text-amber-600">—</span>}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-teal-700">{r.ot_in ? formatTime12h(r.ot_in) : '—'}</td>
                    <td className="py-2 pr-3 tabular-nums text-teal-700">{r.ot_out ? formatTime12h(r.ot_out) : '—'}</td>
                    <td className="py-2 pr-3 font-bold tabular-nums text-teal-800">{r.ot_hours > 0 ? `${r.ot_hours}h` : '—'}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={statusVariant(r.record_status)}>{r.record_status}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={
                        r.approval_status === APPROVAL_STATUS.APPROVED ? 'success'
                        : r.approval_status === APPROVAL_STATUS.REJECTED ? 'danger'
                        : 'warning'
                      }>{r.approval_status}</Badge>
                    </td>
                    <td className="py-2">
                      {r.record_status === RECORD_STATUS.OT_COMPLETE &&
                       r.approval_status === APPROVAL_STATUS.PENDING && (
                        <div className="flex gap-1">
                          <button type="button" title="Approve" onClick={() => handleApprove(r.id)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <button type="button" title="Reject" onClick={() => handleReject(r.id)}
                            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100">
                            <XCircle className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      )}
                      {r.record_status !== RECORD_STATUS.OT_COMPLETE && (
                        <span className="text-xs italic text-slate-400">—</span>
                      )}
                      {r.record_status === RECORD_STATUS.OT_COMPLETE &&
                       r.approval_status !== APPROVAL_STATUS.PENDING && (
                        <span className="text-xs text-slate-500">{r.approved_by || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
