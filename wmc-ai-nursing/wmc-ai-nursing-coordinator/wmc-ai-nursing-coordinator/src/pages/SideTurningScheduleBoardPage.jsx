import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BedDouble,
  Camera,
  CheckCircle2,
  Plus,
  RefreshCw,
  ScanHeart,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { resizeImageFileToJpegDataUrl } from '../lib/resizeImageToJpeg.js'
import {
  appendBoardTurnEvent,
  generateScheduleId,
  readSchedules,
  saveSchedule,
  removeSchedule,
  getLastAnchoringEventForPatient,
  getEventsForPatient,
} from '../db/sideTurningStorage.js'

const DEFAULT_INTERVAL_MINUTES = 120
const DUE_SOON_MINS = 30

const POSITIONS = [
  { id: 'left', label: 'Left', emoji: '◀' },
  { id: 'right', label: 'Right', emoji: '▶' },
  { id: 'supine', label: 'Supine', emoji: '⊙' },
]

const cls = {
  input:
    'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-400/30',
  label: 'text-xs font-semibold uppercase tracking-wide text-slate-500',
}

function intervalMs(s) {
  return (s.intervalMinutes || DEFAULT_INTERVAL_MINUTES) * 60 * 1000
}

function nextDueAt(schedule, last) {
  const enrolled = new Date(schedule.enrolledAt || schedule.createdAt || Date.now()).getTime()
  const anchor = last ? new Date(last.confirmedAt).getTime() : enrolled
  return anchor + intervalMs(schedule)
}

function rowStatus(schedule, last, nowMs) {
  const next = nextDueAt(schedule, last)
  const overdueMs = nowMs - next
  const overdue = overdueMs > 0
  const dueSoon = !overdue && next - nowMs <= DUE_SOON_MINS * 60 * 1000
  return { nextDueAt: next, overdue, overdueMs, dueSoon, untilDueMs: next - nowMs }
}

function formatClock(ms) {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export default function SideTurningScheduleBoardPage() {
  const { patients, getById } = usePatients()
  const [schedules, setSchedules] = useState(() => readSchedules())
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [toast, setToast] = useState(null)

  const [addPatientId, setAddPatientId] = useState('')
  const [addRoom, setAddRoom] = useState('')
  const [addNurse, setAddNurse] = useState('')
  const [addPhotoReq, setAddPhotoReq] = useState(false)

  const [markSchedule, setMarkSchedule] = useState(null)
  const [markPosition, setMarkPosition] = useState('left')
  const [markNurse, setMarkNurse] = useState('')
  const [markNotes, setMarkNotes] = useState('')
  const [markPhotoDataUrl, setMarkPhotoDataUrl] = useState('')
  const [markSaving, setMarkSaving] = useState(false)

  const refresh = useCallback(() => {
    setSchedules(readSchedules())
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  function showToast(message, type = 'success') {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 2600)
  }

  function handleAddBoardRow(e) {
    e.preventDefault()
    if (!addPatientId) {
      showToast('Select patient.', 'warning')
      return
    }
    const p = getById(addPatientId)
    saveSchedule({
      id: generateScheduleId(),
      patientId: addPatientId,
      patientNameSnapshot: p?.fullName || 'Unknown',
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      pressureNotes: '',
      enrolledAt: new Date().toISOString(),
      active: true,
      room: addRoom.trim() || '—',
      nurseInCharge: addNurse.trim() || p?.assignedNurse || '—',
      photoRequired: addPhotoReq,
    })
    refresh()
    setAddPatientId('')
    setAddRoom('')
    setAddNurse('')
    setAddPhotoReq(false)
    window.dispatchEvent(new Event('wmc-clinical-data-updated'))
    showToast('Patient added to turning board.')
  }

  function updateScheduleField(schedule, patch) {
    saveSchedule({ ...schedule, ...patch })
    refresh()
  }

  function handleRemove(schedule) {
    if (!window.confirm(`Remove ${schedule.patientNameSnapshot} from board?`)) return
    removeSchedule(schedule.id)
    refresh()
    window.dispatchEvent(new Event('wmc-clinical-data-updated'))
  }

  function openMark(s) {
    setMarkSchedule(s)
    setMarkPosition('left')
    setMarkNurse(s.nurseInCharge && s.nurseInCharge !== '—' ? s.nurseInCharge : '')
    setMarkNotes('')
    setMarkPhotoDataUrl('')
  }

  function submitMark() {
    if (!markSchedule) return
    if (!markNurse.trim()) {
      showToast('Enter nurse in charge.', 'warning')
      return
    }
    const patient = getById(markSchedule.patientId)
    const last = getLastAnchoringEventForPatient(markSchedule.patientId)
    const nextDue = nextDueAt(markSchedule, last)

    setMarkSaving(true)
    const res = appendBoardTurnEvent({
      scheduleId: markSchedule.id,
      patientId: markSchedule.patientId,
      patientNameSnapshot: patient?.fullName || markSchedule.patientNameSnapshot,
      position: markPosition,
      nurse: markNurse.trim(),
      note: markNotes.trim(),
      photoDataUrl: markPhotoDataUrl,
      photoRequired: Boolean(markSchedule.photoRequired),
      nextDueAtMs: nextDue,
    })
    setMarkSaving(false)
    if (!res.ok) {
      showToast(res.error || 'Save failed', 'warning')
      return
    }
    setMarkSchedule(null)
    refresh()
    window.dispatchEvent(new Event('wmc-clinical-data-updated'))
    showToast('Marked as turned.')
  }

  const rows = useMemo(() => {
    return [...schedules].filter((s) => s.active !== false).sort((a, b) => {
      const pa = getById(a.patientId)?.fullName || a.patientNameSnapshot
      const pb = getById(b.patientId)?.fullName || b.patientNameSnapshot
      return pa.localeCompare(pb)
    })
  }, [schedules, getById])

  const pressureAlerts = useMemo(() => {
    const list = []
    for (const s of rows) {
      const p = getById(s.patientId)
      const last = getLastAnchoringEventForPatient(s.patientId)
      const st = rowStatus(s, last, nowMs)
      const pr = p?.pressureSoreRisk || 'Moderate'
      if (st.overdue && (pr === 'High' || pr === 'Moderate')) {
        list.push({
          id: s.id,
          name: p?.fullName || s.patientNameSnapshot,
          room: s.room || '—',
          pressure: pr,
          overdueMin: Math.floor(st.overdueMs / 60000),
        })
      }
    }
    return list
  }, [rows, nowMs, getById])

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Side turning schedule"
        description="Board view: room, next turn window, scoring labels, and quick mark-as-turned. Photo optional unless flagged required."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Simulation mode</Badge>
            <Link
              to="/side-turning-posture"
              className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
            >
              Posture &amp; photo workflow →
            </Link>
          </div>
        }
      />

      {toast ? (
        <div
          role="status"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
            toast.type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      {pressureAlerts.length > 0 ? (
        <Card className="mb-4 border-red-200 bg-red-50/70">
          <div className="flex items-center gap-2 text-red-900">
            <ScanHeart className="h-5 w-5 shrink-0" aria-hidden />
            <h3 className="text-base font-bold">AI pressure injury risk — overdue repositioning</h3>
            <Sparkles className="h-4 w-4 opacity-70" aria-hidden />
          </div>
          <p className="mt-1 text-sm text-red-800">
            Patients below have missed their turning window combined with documented pressure risk.
          </p>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-red-900">
            {pressureAlerts.map((a) => (
              <li key={a.id}>
                • {a.name} (Rm {a.room}) — {a.pressure} risk · {a.overdueMin} min overdue
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mb-4 print:hidden">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-base font-semibold text-slate-900">Add to schedule board</h3>
        </div>
        <form className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={handleAddBoardRow}>
          <div className="lg:col-span-2">
            <label className={cls.label}>Patient</label>
            <select className={cls.input} value={addPatientId} onChange={(e) => setAddPatientId(e.target.value)}>
              <option value="">Select…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={cls.label}>Room</label>
            <input className={cls.input} value={addRoom} onChange={(e) => setAddRoom(e.target.value)} placeholder="12A" />
          </div>
          <div className="lg:col-span-2">
            <label className={cls.label}>Nurse in charge</label>
            <input className={cls.input} value={addNurse} onChange={(e) => setAddNurse(e.target.value)} placeholder="Charge RN" />
          </div>
          <div className="flex flex-col justify-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={addPhotoReq} onChange={(e) => setAddPhotoReq(e.target.checked)} className="rounded border-slate-300" />
              Photo required
            </label>
          </div>
          <div className="sm:col-span-2 lg:col-span-6">
            <button type="submit" className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 sm:w-auto sm:px-6">
              Add row
            </button>
          </div>
        </form>
      </Card>

      <div className="mb-3 flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => {
            setNowMs(Date.now())
            refresh()
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <p className="text-center text-slate-600">No patients on the board. Add a row above.</p>
        </Card>
      ) : (
        <>
          <div className="hidden lg:block">
            <Card padding="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Patient</th>
                      <th className="px-4 py-3">Room</th>
                      <th className="px-4 py-3">Last turn</th>
                      <th className="px-4 py-3">Next due</th>
                      <th className="px-4 py-3">Position</th>
                      <th className="px-4 py-3">Nurse</th>
                      <th className="px-4 py-3">Photo</th>
                      <th className="px-4 py-3">Status / scoring</th>
                      <th className="px-4 py-3 print:hidden">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => {
                      const p = getById(s.patientId)
                      const name = p?.fullName || s.patientNameSnapshot
                      const last = getLastAnchoringEventForPatient(s.patientId)
                      const evs = getEventsForPatient(s.patientId, 3)
                      const lastBoard = evs.find((e) => e.source === 'schedule-board')
                      const posLabel = last ? POSITIONS.find((x) => x.id === last.position)?.label : '—'
                      const st = rowStatus(s, last, nowMs)
                      return (
                        <tr key={s.id} className="border-b border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-900">{name}</td>
                          <td className="px-4 py-3">
                            <input
                              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                              defaultValue={s.room || ''}
                              onBlur={(e) => updateScheduleField(s, { room: e.target.value.trim() || '—' })}
                              aria-label={`Room ${name}`}
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-600">{last ? formatClock(new Date(last.confirmedAt).getTime()) : '—'}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{formatClock(st.nextDueAt)}</td>
                          <td className="px-4 py-3">{posLabel}</td>
                          <td className="px-4 py-3">
                            <input
                              className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                              defaultValue={s.nurseInCharge || ''}
                              onBlur={(e) => updateScheduleField(s, { nurseInCharge: e.target.value.trim() || '—' })}
                              aria-label={`Nurse ${name}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={Boolean(s.photoRequired)}
                                onChange={(e) => updateScheduleField(s, { photoRequired: e.target.checked })}
                              />
                              Required
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {st.overdue ? (
                                <Badge variant="danger">Overdue</Badge>
                              ) : st.dueSoon ? (
                                <Badge variant="warning">Due soon</Badge>
                              ) : (
                                <Badge variant="success">On track</Badge>
                              )}
                              {lastBoard?.turnScore === 'late' ? <Badge variant="warning">Late last</Badge> : null}
                              {lastBoard?.turnScore === 'on_time' ? <Badge variant="teal">On time</Badge> : null}
                              {lastBoard?.photoSubmitted ? <Badge variant="info">Photo</Badge> : null}
                              {st.overdue ? <Badge variant="danger">Missed window</Badge> : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 print:hidden">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openMark(s)}
                                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700"
                              >
                                Mark turned
                              </button>
                              <button type="button" onClick={() => handleRemove(s)} className="text-slate-400 hover:text-red-600" aria-label="Remove">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <ul className="space-y-3 lg:hidden">
            {rows.map((s) => {
              const p = getById(s.patientId)
              const name = p?.fullName || s.patientNameSnapshot
              const last = getLastAnchoringEventForPatient(s.patientId)
              const evs = getEventsForPatient(s.patientId, 3)
              const lastBoard = evs.find((e) => e.source === 'schedule-board')
              const posLabel = last ? POSITIONS.find((x) => x.id === last.position)?.label : '—'
              const st = rowStatus(s, last, nowMs)
              return (
                <li key={s.id}>
                  <Card padding="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">{name}</p>
                        <p className="text-xs text-slate-500">Rm {s.room || '—'} · Nurse: {s.nurseInCharge || '—'}</p>
                      </div>
                      <BedDouble className="h-5 w-5 text-teal-600 opacity-60" aria-hidden />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <span>
                        Last: {last ? formatClock(new Date(last.confirmedAt).getTime()) : '—'}
                      </span>
                      <span>Next: {formatClock(st.nextDueAt)}</span>
                      <span>Position: {posLabel}</span>
                      <span>
                        Photo req: {s.photoRequired ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {st.overdue ? <Badge variant="danger">Overdue</Badge> : <Badge variant="success">On track</Badge>}
                      {lastBoard?.photoSubmitted ? <Badge variant="info">Photo submitted</Badge> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => openMark(s)}
                      className="mt-3 w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white"
                    >
                      Mark as turned
                    </button>
                  </Card>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {markSchedule ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h4 className="text-lg font-bold text-slate-900">Mark as turned</h4>
            <p className="text-sm text-slate-600">{getById(markSchedule.patientId)?.fullName || markSchedule.patientNameSnapshot}</p>

            <p className={`${cls.label} mt-4`}>Position</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {POSITIONS.map((po) => (
                <button
                  key={po.id}
                  type="button"
                  onClick={() => setMarkPosition(po.id)}
                  className={`rounded-xl border py-3 text-sm font-bold ${
                    markPosition === po.id ? 'border-teal-500 bg-teal-500 text-white' : 'border-slate-200 bg-white'
                  }`}
                >
                  {po.emoji} {po.label}
                </button>
              ))}
            </div>

            <label className={`${cls.label} mt-4 block`}>Nurse in charge</label>
            <input className={cls.input} value={markNurse} onChange={(e) => setMarkNurse(e.target.value)} />

            <label className={`${cls.label} mt-3 block`}>Notes</label>
            <textarea className={cls.input} rows={2} value={markNotes} onChange={(e) => setMarkNotes(e.target.value)} />

            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Camera className="h-4 w-4" aria-hidden />
                Photo upload {markSchedule.photoRequired ? '(required)' : '(placeholder / optional)'}
              </p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="mt-2 block w-full text-xs file:rounded-lg file:bg-teal-600 file:px-3 file:py-2 file:text-white"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    setMarkPhotoDataUrl(await resizeImageFileToJpegDataUrl(file))
                  } catch {
                    showToast('Could not load image.', 'warning')
                  }
                  e.target.value = ''
                }}
              />
              {markPhotoDataUrl ? (
                <img src={markPhotoDataUrl} alt="" className="mt-2 max-h-32 w-full rounded-lg object-contain" />
              ) : (
                <p className="mt-2 text-xs text-slate-500">Attach ward photo when required or for audit trail.</p>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setMarkSchedule(null)}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={markSaving}
                onClick={submitMark}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {markSaving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
