import { useCallback, useMemo, useState } from 'react'
import { Check, ShieldCheck, Smartphone, X as XIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { readAttendance, setOtApproval, attendanceInMonth } from '../db/otStorage.js'

const cls = {
  input:
    'mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-400/20 focus:border-teal-500 focus:ring-2',
  label: 'text-xs font-semibold uppercase tracking-wide text-slate-500',
}

function ymNow() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

function formatShort(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export default function OTManagementPage() {
  const [version, setVersion] = useState(0)
  const [supervisorName, setSupervisorName] = useState('')
  const [noteById, setNoteById] = useState({})
  const [toast, setToast] = useState(null)

  const bump = useCallback(() => {
    setVersion((v) => v + 1)
    window.dispatchEvent(new Event('wmc-clinical-data-updated'))
  }, [])

  const attendance = useMemo(() => readAttendance(), [version])
  const pending = useMemo(() => attendance.filter((r) => r.otApprovalStatus === 'pending'), [attendance])
  const monthRows = useMemo(() => attendanceInMonth(ymNow()).filter((r) => r.status === 'completed'), [attendance])

  const monthApprovedOt = useMemo(
    () => monthRows.filter((r) => r.otApprovalStatus === 'approved').reduce((s, r) => s + (Number(r.otHours) || 0), 0),
    [monthRows],
  )
  const monthLate = useMemo(() => monthRows.filter((r) => r.lateArrival).length, [monthRows])
  const monthEarly = useMemo(() => monthRows.filter((r) => r.earlyLeave).length, [monthRows])

  function showToast(message, type = 'success') {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 2600)
  }

  function approve(id, decision) {
    if (!supervisorName.trim()) {
      showToast('Enter supervisor name for approval.', 'warning')
      return
    }
    const res = setOtApproval(id, decision, supervisorName.trim(), noteById[id] || '')
    if (!res.ok) {
      showToast(res.error || 'Update failed', 'warning')
      return
    }
    bump()
    showToast(decision === 'approve' ? 'OT approved.' : 'OT rejected.')
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="OT Management"
        description="Supervisor approval for overtime generated after check-out. Late arrival and early leave flags stay visible for payroll review."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            Mobile-friendly
          </span>
        }
      />

      {toast ? (
        <div
          role="status"
          className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            toast.type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card padding="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending OT</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{pending.length}</p>
        </Card>
        <Card padding="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approved OT (month)</p>
          <p className="mt-1 text-2xl font-bold text-teal-700">{Math.round(monthApprovedOt * 100) / 100}h</p>
        </Card>
        <Card padding="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Late / early (month)</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Late {monthLate} · Early leave {monthEarly}
          </p>
          <Link className="mt-2 inline-block text-xs font-semibold text-teal-700 hover:underline" to="/ot-reports">
            OT Reports →
          </Link>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-base font-semibold text-slate-900">Supervisor approval</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">Only shifts with OT hours await approval. Other shifts show OT status “none”.</p>
        <label htmlFor="ot-sup-name" className={`${cls.label} mt-4 block`}>
          Supervisor name
        </label>
        <input
          id="ot-sup-name"
          className={cls.input}
          value={supervisorName}
          onChange={(e) => setSupervisorName(e.target.value)}
          placeholder="Charge RN / Nurse Manager"
        />
      </Card>

      <Card>
        {pending.length === 0 ? (
          <p className="text-center text-sm text-slate-600">No pending OT approvals.</p>
        ) : (
          <ul className="space-y-4">
            {pending.map((r) => (
              <li key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{r.staffName}</p>
                    <p className="text-xs text-slate-600">
                      {r.workDate} · {r.shiftType} shift · {formatShort(r.checkInAt)} → {formatShort(r.checkOutAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="warning">{r.otHours}h OT</Badge>
                      {r.lateArrival ? <Badge variant="danger">Late {r.lateMinutes}m</Badge> : null}
                      {r.earlyLeave ? <Badge variant="warning">Early leave {r.earlyLeaveMinutes}m</Badge> : null}
                    </div>
                  </div>
                </div>
                <label htmlFor={`note-${r.id}`} className={`${cls.label} mt-3 block`}>
                  Supervisor note (optional)
                </label>
                <textarea
                  id={`note-${r.id}`}
                  rows={2}
                  className={cls.input}
                  value={noteById[r.id] ?? ''}
                  onChange={(e) => setNoteById((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Payroll code, reason for extended stay…"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => approve(r.id, 'approve')}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    Approve OT
                  </button>
                  <button
                    type="button"
                    onClick={() => approve(r.id, 'reject')}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-red-300 bg-white px-4 py-3 text-sm font-bold text-red-800 hover:bg-red-50"
                  >
                    <XIcon className="h-4 w-4" aria-hidden />
                    Reject OT
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-center text-xs text-slate-500">
        Manage roster on <Link className="font-semibold text-teal-700 hover:underline" to="/staff-attendance">Staff Attendance</Link>.
      </p>
    </div>
  )
}
