import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BedDouble,
  BellRing,
  Camera,
  CheckCircle2,
  Clock,
  ImageIcon,
  Smartphone,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { resizeImageFileToJpegDataUrl } from '../lib/resizeImageToJpeg.js'
import {
  appendTurnEvent,
  generateScheduleId,
  generateTurnEventId,
  readSchedules,
  readTurnEvents,
  removeSchedule,
  saveSchedule,
  getLastAnchoringEventForPatient,
  eventHasPhotoProof,
} from '../db/sideTurningStorage.js'

const DEFAULT_INTERVAL_MINUTES = 120
const DUE_SOON_MINUTES = 30
const FORM_GLOBAL = '__global__'

const POSITIONS = [
  { id: 'left', label: 'Left side', short: 'Left', emoji: '◀︎', hint: '30° lateral with pillows' },
  { id: 'right', label: 'Right side', short: 'Right', emoji: '▶︎', hint: '30° lateral with pillows' },
  { id: 'supine', label: 'Supine', short: 'Supine', emoji: '⊙', hint: 'Head of bed ≤30° unless ordered' },
]

const cls = {
  input:
    'mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-teal-400/20 focus:border-teal-500 focus:ring-2',
  label: 'text-xs font-semibold uppercase tracking-wide text-slate-500',
}

const emptyTurnForm = () => ({
  position: 'left',
  nurse: '',
  notes: '',
  photoDataUrl: '',
})

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0 min'
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h > 0) return `${h}h ${min}m`
  return `${min} min`
}

function formatClock(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function intervalMs(schedule) {
  return (schedule.intervalMinutes || DEFAULT_INTERVAL_MINUTES) * 60 * 1000
}

function computeNextDueAt(schedule, lastAnchoringEvent) {
  const enrolled = new Date(schedule.enrolledAt || schedule.createdAt || Date.now()).getTime()
  const anchor = lastAnchoringEvent ? new Date(lastAnchoringEvent.confirmedAt).getTime() : enrolled
  return anchor + intervalMs(schedule)
}

function computeStatus(schedule, lastAnchoringEvent, nowMs) {
  const nextDueAt = computeNextDueAt(schedule, lastAnchoringEvent)
  const delta = nextDueAt - nowMs
  const overdueMs = nowMs - nextDueAt
  const dueSoon = delta > 0 && delta <= DUE_SOON_MINUTES * 60 * 1000
  const overdue = overdueMs > 0
  return {
    nextDueAt,
    dueSoon,
    overdue,
    missed: overdue,
    overdueMs,
    untilDueMs: delta,
  }
}

function TelegramMissedTurnButton({ patientName, minutesLate, scheduleId }) {
  const [sent, setSent] = useState(false)
  const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
  const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID

  function handleSend() {
    const summary =
      `Missed turning — no photo proof uploaded after scheduled due time (${minutesLate} min overdue). Schedule ${scheduleId?.slice(0, 12)}…`
    if (!botToken || !chatId) {
      window.alert(
        'Telegram integration not configured.\n\n' +
          'Add to your .env:\n' +
          '  VITE_TELEGRAM_BOT_TOKEN=your_bot_token\n' +
          '  VITE_TELEGRAM_CHAT_ID=your_chat_id\n\n' +
          `[Placeholder] Would send:\n🚨 WMC Posture Care — ${patientName}\n${summary}`,
      )
      return
    }
    const text = encodeURIComponent(`🚨 WMC Side Turning / Posture\nPatient: ${patientName}\n${summary}`)
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${text}`)
      .then(() => setSent(true))
      .catch(() => window.alert('Failed to send Telegram message. Check token and chat ID.'))
  }

  return (
    <button
      type="button"
      onClick={handleSend}
      className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${
        sent
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
      }`}
    >
      <BellRing className="h-4 w-4 shrink-0" aria-hidden />
      {sent ? 'Telegram alert sent' : 'Telegram alert — missed turn (no photo)'}
    </button>
  )
}

function TurnPhotoForm({
  formKey,
  turnForms,
  patchTurnForm,
  onSubmit,
  patientHint,
  disabled,
}) {
  const f = turnForms[formKey] || emptyTurnForm()

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Complete turning <span className="normal-case text-slate-600">(photo proof required)</span>
      </p>
      {patientHint ? <p className="mt-1 text-sm font-medium text-slate-800">{patientHint}</p> : null}

      <p className={cls.label}>Position after turn</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {POSITIONS.map((pos) => (
          <button
            key={pos.id}
            type="button"
            disabled={disabled}
            onClick={() => patchTurnForm(formKey, { position: pos.id })}
            className={`flex min-h-18 flex-col items-center justify-center rounded-2xl border px-3 py-3 text-center text-sm font-bold shadow-sm active:scale-[0.98] disabled:opacity-50 ${
              f.position === pos.id
                ? 'border-teal-500 bg-teal-500 text-white'
                : 'border-slate-200 bg-white text-slate-800 hover:border-teal-400 hover:bg-teal-50'
            }`}
          >
            <span className="text-lg leading-none" aria-hidden>
              {pos.emoji}
            </span>
            {pos.label}
          </button>
        ))}
      </div>

      <label className={`${cls.label} mt-3 block`} htmlFor={`nurse-${formKey}`}>
        Nurse name <span className="text-red-500">*</span>
      </label>
      <input
        id={`nurse-${formKey}`}
        type="text"
        disabled={disabled}
        value={f.nurse}
        onChange={(e) => patchTurnForm(formKey, { nurse: e.target.value })}
        placeholder="R.N. / L.P.N."
        className={cls.input}
        autoComplete="name"
      />

      <label className={`${cls.label} mt-3 block`} htmlFor={`notes-${formKey}`}>
        Notes (optional)
      </label>
      <textarea
        id={`notes-${formKey}`}
        rows={2}
        disabled={disabled}
        value={f.notes}
        onChange={(e) => patchTurnForm(formKey, { notes: e.target.value })}
        placeholder="Skin, pillows, tolerance…"
        className={cls.input}
      />

      <label className={`${cls.label} mt-3 block`} htmlFor={`photo-${formKey}`}>
        Photo proof <span className="text-red-500">*</span>
      </label>
      <p className="text-xs text-slate-500">Use camera on phone — turning is recorded only after a photo is saved.</p>
      <input
        id={`photo-${formKey}`}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        className="mt-2 block w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-teal-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-teal-700"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          try {
            const dataUrl = await resizeImageFileToJpegDataUrl(file)
            patchTurnForm(formKey, { photoDataUrl: dataUrl })
          } catch (err) {
            window.alert(err instanceof Error ? err.message : 'Could not process image.')
          }
          e.target.value = ''
        }}
      />
      {f.photoDataUrl ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-emerald-700">Preview (JPEG, resized for storage)</p>
          <img
            src={f.photoDataUrl}
            alt="Turning proof preview"
            className="mt-2 max-h-48 w-full rounded-xl border border-slate-200 object-contain"
          />
          <button
            type="button"
            disabled={disabled}
            className="mt-2 text-xs font-semibold text-red-700 hover:underline"
            onClick={() => patchTurnForm(formKey, { photoDataUrl: '' })}
          >
            Remove photo
          </button>
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onSubmit()}
        className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-4 py-3 text-base font-bold text-white shadow-md hover:bg-teal-700 disabled:opacity-50"
      >
        <Camera className="h-5 w-5" aria-hidden />
        Save turning record
      </button>
    </div>
  )
}

export default function SideTurningPosturePage() {
  const { patients, getById } = usePatients()
  const [schedules, setSchedules] = useState(() => readSchedules())
  const [eventsVersion, setEventsVersion] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [toast, setToast] = useState(null)

  const [addPatientId, setAddPatientId] = useState('')
  const [addPressureNotes, setAddPressureNotes] = useState('')
  const [globalPickPatientId, setGlobalPickPatientId] = useState('')
  const [turnForms, setTurnForms] = useState({})
  const [savingKey, setSavingKey] = useState(null)

  const patchTurnForm = useCallback((key, patch) => {
    setTurnForms((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || emptyTurnForm()), ...patch },
    }))
  }, [])

  const refreshSchedules = useCallback(() => {
    setSchedules(readSchedules())
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(t)
  }, [])

  function showToast(message, type = 'success') {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 2800)
  }

  const activeSchedules = useMemo(
    () =>
      schedules
        .filter((s) => s.active !== false)
        .sort((a, b) => (a.patientNameSnapshot || '').localeCompare(b.patientNameSnapshot || '')),
    [schedules],
  )

  function resolveScheduleForPatient(patientId) {
    return activeSchedules.find((s) => s.patientId === patientId) || null
  }

  function handleAddSchedule(event) {
    event.preventDefault()
    if (!addPatientId) {
      showToast('Select a patient for the turning schedule.', 'warning')
      return
    }
    const patient = getById(addPatientId)
    const schedule = {
      id: generateScheduleId(),
      patientId: addPatientId,
      patientNameSnapshot: patient?.fullName || 'Unknown',
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      pressureNotes: addPressureNotes.trim(),
      enrolledAt: new Date().toISOString(),
      active: true,
    }
    saveSchedule(schedule)
    refreshSchedules()
    setAddPatientId('')
    setAddPressureNotes('')
    window.dispatchEvent(new Event('wmc-clinical-data-updated'))
    showToast(`${schedule.patientNameSnapshot} added — 2-hour turning schedule active.`)
  }

  function handleSavePressureNotes(scheduleId, text) {
    const list = readSchedules()
    const s = list.find((row) => row.id === scheduleId)
    if (!s) return
    saveSchedule({ ...s, pressureNotes: text.trim() })
    refreshSchedules()
    showToast('Pressure sore prevention notes saved.')
  }

  function submitTurnForm(formKey, schedule) {
    const snap = turnForms[formKey] || emptyTurnForm()
    if (!schedule) {
      showToast('Select a patient on a turning schedule.', 'warning')
      return
    }
    if (!snap.nurse.trim()) {
      showToast('Enter nurse name.', 'warning')
      return
    }
    if (!snap.photoDataUrl || snap.photoDataUrl.length < 200) {
      showToast('Upload a photo before completing the turn.', 'warning')
      return
    }

    const patient = getById(schedule.patientId)
    const label = POSITIONS.find((p) => p.id === snap.position)?.label || snap.position
    const confirmedAt = new Date().toISOString()

    setSavingKey(formKey)
    const ok = appendTurnEvent({
      id: generateTurnEventId(),
      scheduleId: schedule.id,
      patientId: schedule.patientId,
      position: snap.position,
      nurse: snap.nurse.trim(),
      confirmedAt,
      note: snap.notes.trim(),
      patientNameSnapshot: patient?.fullName || schedule.patientNameSnapshot,
      photoDataUrl: snap.photoDataUrl,
      photoMime: 'image/jpeg',
      legacyPhotoExempt: false,
    })
    if (!ok) {
      showToast('Could not save — storage may be full. Try a smaller photo.', 'warning')
      setSavingKey(null)
      return
    }

    setTurnForms((prev) => ({ ...prev, [formKey]: emptyTurnForm() }))
    setEventsVersion((v) => v + 1)
    window.dispatchEvent(new Event('wmc-clinical-data-updated'))
    showToast(`Turn saved with photo — ${label} — ${patient?.fullName || 'Patient'} · ${formatClock(confirmedAt)}`)
    setSavingKey(null)
  }

  function handleRemoveSchedule(schedule) {
    if (!window.confirm(`Remove turning schedule for ${schedule.patientNameSnapshot}?`)) return
    removeSchedule(schedule.id)
    refreshSchedules()
    window.dispatchEvent(new Event('wmc-clinical-data-updated'))
    showToast('Schedule removed.', 'warning')
  }

  const eventsByPatient = useMemo(() => {
    const map = {}
    for (const e of readTurnEvents()) {
      if (!map[e.patientId]) map[e.patientId] = []
      map[e.patientId].push(e)
    }
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => new Date(b.confirmedAt) - new Date(a.confirmedAt))
    }
    return map
  }, [eventsVersion])

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Side Turning / Posture Care"
        description="2-hourly repositioning with photo proof. A turn counts as completed only after an image is saved locally with timestamp and nurse name."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/side-turning"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Schedule board →
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              <Smartphone className="h-3.5 w-3.5" aria-hidden />
              Camera-ready
            </span>
            <Badge variant="info" className="hidden sm:inline-flex">
              Simulation
            </Badge>
          </div>
        }
      />

      {toast ? (
        <div
          role="status"
          className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            toast.type === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <BedDouble className="mt-0.5 h-8 w-8 shrink-0 text-teal-600" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-slate-900">Pressure injury prevention</h3>
            <p className="mt-1 text-sm text-slate-600">
              Reposition at least every <strong>2 hours</strong>. Photo documents position and supports audits. Missed turns show if due time passes with no new photo record.
            </p>
          </div>
        </div>
      </Card>

      {activeSchedules.length > 0 ? (
        <Card className="mb-4">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-base font-semibold text-slate-900">Record turning (select patient)</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">Same workflow as cards below — convenient from the top on mobile.</p>
          <label htmlFor="stp-global-patient" className={`${cls.label} mt-3 block`}>
            Patient on turning schedule
          </label>
          <select
            id="stp-global-patient"
            className={cls.input}
            value={globalPickPatientId}
            onChange={(e) => setGlobalPickPatientId(e.target.value)}
          >
            <option value="">Select patient…</option>
            {activeSchedules.map((s) => (
              <option key={s.id} value={s.patientId}>
                {getById(s.patientId)?.fullName || s.patientNameSnapshot}
              </option>
            ))}
          </select>
          <div className="mt-4">
            <TurnPhotoForm
              formKey={FORM_GLOBAL}
              turnForms={turnForms}
              patchTurnForm={patchTurnForm}
              disabled={!globalPickPatientId || savingKey === FORM_GLOBAL}
              patientHint={
                globalPickPatientId
                  ? `Recording for ${getById(globalPickPatientId)?.fullName || resolveScheduleForPatient(globalPickPatientId)?.patientNameSnapshot || 'Patient'}`
                  : ''
              }
              onSubmit={() => submitTurnForm(FORM_GLOBAL, resolveScheduleForPatient(globalPickPatientId))}
            />
          </div>
        </Card>
      ) : null}

      <Card className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Start schedule (bedridden)</h3>
        <p className="mt-1 text-sm text-slate-500">Stores schedules locally first; reminders use this device&apos;s clock.</p>
        <form className="mt-4 space-y-3" onSubmit={handleAddSchedule}>
          <div>
            <label htmlFor="stp-patient" className={cls.label}>
              Patient
            </label>
            <select
              id="stp-patient"
              value={addPatientId}
              onChange={(e) => setAddPatientId(e.target.value)}
              className={cls.input}
            >
              <option value="">Select patient…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="stp-pressure" className={cls.label}>
              Pressure sore prevention notes (optional)
            </label>
            <textarea
              id="stp-pressure"
              rows={2}
              value={addPressureNotes}
              onChange={(e) => setAddPressureNotes(e.target.value)}
              placeholder="e.g. Sacrum redness — float heels; alternating sides only; specialty mattress."
              className={cls.input}
            />
          </div>
          <button
            type="submit"
            className="min-h-14 w-full rounded-2xl bg-teal-600 px-4 py-3 text-base font-bold text-white shadow-md hover:bg-teal-700"
          >
            Add to turning schedule
          </button>
        </form>
      </Card>

      {activeSchedules.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-slate-600">No active schedules. Add a bedridden patient above.</p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {activeSchedules.map((schedule) => {
            const patient = getById(schedule.patientId)
            const name = patient?.fullName || schedule.patientNameSnapshot || 'Patient'
            const lastEvent = getLastAnchoringEventForPatient(schedule.patientId)
            const lastPos = lastEvent ? POSITIONS.find((p) => p.id === lastEvent.position) : null
            const status = computeStatus(schedule, lastEvent, nowMs)
            const recent = (eventsByPatient[schedule.patientId] || []).slice(0, 12)
            const formKey = schedule.id

            return (
              <li key={schedule.id}>
                <Card
                  className={`${
                    status.missed ? 'border-red-300 ring-2 ring-red-200/60' : ''
                  } ${status.dueSoon && !status.missed ? 'border-amber-200 ring-1 ring-amber-200/80' : ''}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold text-slate-900">{name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            Every 2 hours ({schedule.intervalMinutes || DEFAULT_INTERVAL_MINUTES} min)
                          </span>
                          {lastPos ? (
                            <Badge variant="teal">
                              Last photo turn: {lastPos.short} · {formatClock(lastEvent.confirmedAt)}
                            </Badge>
                          ) : (
                            <Badge variant="warning">Awaiting first photo turn</Badge>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSchedule(schedule)}
                      className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                      aria-label={`Remove schedule for ${name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {status.missed ? (
                    <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3">
                      <div className="flex items-center gap-2 text-red-900">
                        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                        <strong className="text-sm font-bold">Missed turning alert</strong>
                      </div>
                      <p className="mt-1 text-sm text-red-800">
                        Scheduled turn was due <strong>{formatClock(new Date(status.nextDueAt).toISOString())}</strong> (
                        {formatDuration(status.overdueMs)} overdue). No photo proof has been saved for this interval yet — reposition and submit a photo record below.
                      </p>
                      <div className="mt-3">
                        <TelegramMissedTurnButton
                          patientName={name}
                          minutesLate={Math.max(1, Math.floor(status.overdueMs / 60000))}
                          scheduleId={schedule.id}
                        />
                      </div>
                    </div>
                  ) : status.dueSoon ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                      <Clock className="mr-2 inline h-4 w-4" aria-hidden />
                      Due soon — window closes in <strong>{formatDuration(status.untilDueMs)}</strong> (
                      {formatClock(new Date(status.nextDueAt).toISOString())}). Upload photo to complete on time.
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <CheckCircle2 className="mr-2 inline h-4 w-4" aria-hidden />
                      Next photo due <strong>{formatClock(new Date(status.nextDueAt).toISOString())}</strong> (
                      {formatDuration(status.untilDueMs)} from now)
                    </div>
                  )}

                  <div className="mt-4">
                    <label className={cls.label} htmlFor={`pressure-${schedule.id}`}>
                      Pressure sore prevention notes
                    </label>
                    <textarea
                      id={`pressure-${schedule.id}`}
                      key={`${schedule.id}-${schedule.pressureNotes}`}
                      rows={2}
                      defaultValue={schedule.pressureNotes || ''}
                      onBlur={(e) => handleSavePressureNotes(schedule.id, e.target.value)}
                      placeholder="Skin checks, devices, offloading, specialty surface…"
                      className={cls.input}
                    />
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <TurnPhotoForm
                      formKey={formKey}
                      turnForms={turnForms}
                      patchTurnForm={patchTurnForm}
                      disabled={savingKey === formKey}
                      patientHint={`Patient: ${name}`}
                      onSubmit={() => submitTurnForm(formKey, schedule)}
                    />
                  </div>

                  {recent.length > 0 ? (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photo history</p>
                      <ul className="mt-3 space-y-4">
                        {recent.map((ev) => {
                          const pl = POSITIONS.find((p) => p.id === ev.position)
                          const hasPhoto = eventHasPhotoProof(ev)
                          return (
                            <li key={ev.id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900">{pl?.short || ev.position}</span>
                                <Badge variant={hasPhoto ? 'teal' : 'default'}>{hasPhoto ? 'Photo' : 'Legacy'}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-slate-600">
                                <strong>{formatClock(ev.confirmedAt)}</strong> · {ev.nurse}
                              </p>
                              {ev.note ? <p className="mt-1 text-xs text-slate-500">{ev.note}</p> : null}
                              {hasPhoto ? (
                                <img
                                  src={ev.photoDataUrl}
                                  alt={`Turning proof ${pl?.short || ''}`}
                                  className="mt-2 max-h-40 w-full rounded-xl border border-slate-200 object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                                  <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                                  No image on file (record before photo requirement).
                                </p>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
