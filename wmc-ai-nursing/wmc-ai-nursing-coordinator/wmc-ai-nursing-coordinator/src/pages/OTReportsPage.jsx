import { useMemo, useState } from 'react'
import { Download, Smartphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { attendanceInMonth, buildOtReportCsv } from '../db/otStorage.js'

function ymNow() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

function downloadCsv(ym, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wmc-ot-report-${ym}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function OTReportsPage() {
  const [ym, setYm] = useState(ymNow())

  const rows = useMemo(() => attendanceInMonth(ym).filter((r) => r.status === 'completed'), [ym])

  const byStaff = useMemo(() => {
    const map = {}
    for (const r of rows) {
      const key = r.staffId || r.staffName
      if (!map[key]) map[key] = { name: r.staffName, worked: 0, otPending: 0, otApproved: 0, otRejected: 0, late: 0, early: 0 }
      map[key].worked += Number(r.workedHours) || 0
      if (r.otApprovalStatus === 'pending') map[key].otPending += Number(r.otHours) || 0
      if (r.otApprovalStatus === 'approved') map[key].otApproved += Number(r.otHours) || 0
      if (r.otApprovalStatus === 'rejected') map[key].otRejected += Number(r.otHours) || 0
      if (r.lateArrival) map[key].late += 1
      if (r.earlyLeave) map[key].early += 1
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  function handleExport() {
    const csv = buildOtReportCsv(ym)
    downloadCsv(ym, csv)
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="OT Reports"
        description="Monthly overtime summary from locally saved attendance. Export CSV for payroll or auditing."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            Mobile-friendly
          </span>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <label htmlFor="otr-month" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Month
            </label>
            <input
              id="otr-month"
              type="month"
              className="mt-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Includes worked hours, OT hours, approval status, late arrival, and early leave columns.{' '}
          <Link className="font-semibold text-teal-700 hover:underline" to="/staff-attendance">
            Record attendance
          </Link>{' '}
          ·{' '}
          <Link className="font-semibold text-teal-700 hover:underline" to="/ot-management">
            Approve OT
          </Link>
          .
        </p>
      </Card>

      <Card className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Monthly summary by staff</h3>
        {byStaff.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No completed shifts this month.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-2">Staff</th>
                  <th className="py-2 pr-2">Worked h</th>
                  <th className="py-2 pr-2">OT approved</th>
                  <th className="py-2 pr-2">OT pending</th>
                  <th className="py-2 pr-2">Late</th>
                  <th className="py-2">Early leave</th>
                </tr>
              </thead>
              <tbody>
                {byStaff.map((s) => (
                  <tr key={s.name} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-semibold text-slate-900">{s.name}</td>
                    <td className="py-2 pr-2 tabular-nums">{Math.round(s.worked * 100) / 100}</td>
                    <td className="py-2 pr-2 tabular-nums text-emerald-700">{Math.round(s.otApproved * 100) / 100}</td>
                    <td className="py-2 pr-2 tabular-nums text-amber-700">{Math.round(s.otPending * 100) / 100}</td>
                    <td className="py-2 pr-2 tabular-nums">{s.late}</td>
                    <td className="py-2 tabular-nums">{s.early}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-900">Shift detail ({rows.length})</h3>
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.length === 0 ? (
            <li className="py-4 text-sm text-slate-600">No rows.</li>
          ) : (
            rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-3 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{r.staffName}</span>
                  <Badge
                    variant={
                      r.otApprovalStatus === 'pending'
                        ? 'warning'
                        : r.otApprovalStatus === 'approved'
                          ? 'success'
                          : r.otApprovalStatus === 'rejected'
                            ? 'danger'
                            : 'default'
                    }
                  >
                    OT {r.otApprovalStatus}
                  </Badge>
                </div>
                <span className="text-xs text-slate-600">
                  {r.workDate} · {r.shiftType} · worked {r.workedHours ?? '—'}h · OT {r.otHours ?? 0}h
                </span>
                <span className="text-xs text-slate-500">
                  {r.lateArrival ? `Late ${r.lateMinutes}m · ` : ''}
                  {r.earlyLeave ? `Early leave ${r.earlyLeaveMinutes}m` : ''}
                  {!r.lateArrival && !r.earlyLeave ? 'No late / early flags' : ''}
                </span>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  )
}
