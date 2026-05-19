import { useCallback, useMemo, useState } from 'react'
import { Clock, LogIn, LogOut, Smartphone, UserPlus } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import {
  readStaff,
  readAttendance,
  saveStaffMember,
  checkInStaff,
  checkOutStaff,
  generateStaffId,
} from '../db/otStorage.js'
import { SHIFT_PRESETS } from '../lib/otCalculation.js'

const cls = {
  input:
    'mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-400/20 focus:border-teal-500 focus:ring-2',
  label: 'text-xs font-semibold uppercase tracking-wide text-slate-500',
}

function formatDt(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function todayStr() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export default function StaffAttendancePage() {
  const [version, setVersion] = useState(0)
  const [staffId, setStaffId] = useState('')
  const [workDate, setWorkDate] = useState(todayStr)
  const [shiftType, setShiftType] = useState('day')
  const [toast, setToast] = useState(null)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')

  const bump = useCallback(() => {
    setVersion((v) => v + 1)
    window.dispatchEvent(new Event('wmc-clinical-data-updated'))
  }, [])

  const staffList = useMemo(() => readStaff().filter((s) => s.active !== false), [version])
  const attendance = useMemo(() => readAttendance(), [version])

  const openShifts = useMemo(() => attendance.filter((r) => r.status === 'open'), [attendance])

  function showToast(message, type = 'success') {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 2600)
  }

  function handleAddStaff(e) {
    e.preventDefault()
    if (!newName.trim()) {
      showToast('Enter staff name.', 'warning')
      return
    }
    saveStaffMember({
      id: generateStaffId(),
      fullName: newName.trim(),
      employeeCode: newCode.trim() || '—',
      active: true,
    })
    setNewName('')
    setNewCode('')
    bump()
    showToast('Staff member saved locally.')
  }

  function handleCheckIn(e) {
    e.preventDefault()
    if (!staffId) {
      showToast('Select staff.', 'warning')
      return
    }
    const s = staffList.find((x) => x.id === staffId)
    const res = checkInStaff({
      staffId,
      staffName: s?.fullName || 'Staff',
      workDate,
      shiftType,
    })
    if (!res.ok) {
      showToast(res.error || 'Check-in failed', 'warning')
      return
    }
    bump()
    showToast(`Checked in — ${SHIFT_PRESETS[shiftType]?.label || shiftType} shift`)
  }

  function handleCheckOut(id) {
    const res = checkOutStaff(id)
    if (!res.ok) {
      showToast(res.error || 'Check-out failed', 'warning')
      return
    }
    bump()
    const ot = res.record?.otHours > 0 ? ` OT ${res.record.otHours}h pending approval.` : ''
    showToast(`Checked out.${ot}`)
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Staff Attendance"
        description="Check in / check out with automatic overtime calculation. Day and night shift windows are applied locally."
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

      <Card className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Quick add staff</h3>
        <p className="mt-1 text-sm text-slate-500">Saved locally on this device first.</p>
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={handleAddStaff}>
          <div className="sm:col-span-2">
            <label htmlFor="sa-name" className={cls.label}>
              Full name
            </label>
            <input id="sa-name" className={cls.input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Riley Patel" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sa-code" className={cls.label}>
              Employee code (optional)
            </label>
            <input id="sa-code" className={cls.input} value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="RN-####" />
          </div>
          <button
            type="submit"
            className="sm:col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white hover:bg-slate-900"
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            Save staff
          </button>
        </form>
      </Card>

      <Card className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Check in</h3>
        <p className="mt-1 text-sm text-slate-500">
          Day <strong>07:00–15:00</strong> (8h standard). Night <strong>19:00–07:00</strong> next day (12h standard). Late arrival uses a 10-minute grace.
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleCheckIn}>
          <div>
            <label htmlFor="sa-staff" className={cls.label}>
              Staff
            </label>
            <select id="sa-staff" className={cls.input} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Select…</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                  {s.employeeCode ? ` (${s.employeeCode})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sa-date" className={cls.label}>
              Work date (shift start date)
            </label>
            <input id="sa-date" type="date" className={cls.input} value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </div>
          <div>
            <span className={cls.label}>Shift</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['day', 'night']).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setShiftType(key)}
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm ${
                    shiftType === key ? 'border-teal-500 bg-teal-500 text-white' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {SHIFT_PRESETS[key].label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-4 py-3 text-base font-bold text-white shadow-md hover:bg-teal-700"
          >
            <LogIn className="h-5 w-5" aria-hidden />
            Check in
          </button>
        </form>
      </Card>

      <Card className="mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600" aria-hidden />
          <h3 className="text-base font-semibold text-slate-900">Open shifts — check out</h3>
          <Badge variant="warning">{openShifts.length} open</Badge>
        </div>
        {openShifts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No open check-ins.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {openShifts.map((r) => (
              <li key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{r.staffName}</p>
                    <p className="text-xs text-slate-600">
                      {r.workDate} · {r.shiftType} · In {formatDt(r.checkInAt)}
                    </p>
                    {r.lateArrival ? (
                      <p className="mt-1 text-xs font-semibold text-red-700">Late arrival · {r.lateMinutes} min after grace</p>
                    ) : (
                      <p className="mt-1 text-xs text-emerald-700">On-time arrival (within grace)</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCheckOut(r.id)}
                    className="flex shrink-0 items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Check out
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-900">Recent completed (latest 8)</h3>
        <ul className="mt-3 divide-y divide-slate-100">
          {attendance
            .filter((r) => r.status === 'completed')
            .slice(0, 8)
            .map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-3 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{r.staffName}</span>
                  <Badge variant={r.otApprovalStatus === 'pending' ? 'warning' : r.otApprovalStatus === 'approved' ? 'success' : 'default'}>
                    OT: {r.otApprovalStatus}
                  </Badge>
                </div>
                <span className="text-xs text-slate-500">
                  {r.workDate} · {r.shiftType} · {r.workedHours != null ? `${r.workedHours}h worked` : ''}
                  {r.otHours != null && Number(r.otHours) > 0 ? ` · ${r.otHours}h OT` : ''}
                </span>
                <span className="text-xs text-slate-500">
                  {formatDt(r.checkInAt)} → {formatDt(r.checkOutAt)}
                </span>
                {(r.earlyLeave || r.lateArrival) && (
                  <span className="text-xs font-semibold text-amber-800">
                    {r.lateArrival ? `Late ${r.lateMinutes}m · ` : ''}
                    {r.earlyLeave ? `Early leave ${r.earlyLeaveMinutes}m before shift end` : ''}
                  </span>
                )}
              </li>
            ))}
        </ul>
      </Card>
    </div>
  )
}
