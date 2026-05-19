import { useMemo, useState } from 'react'
import { FALL_RISK_OPTIONS, GENDER_OPTIONS } from '../db/patientSchema.js'
import {
  emptyPatientsroomRegistrationForm,
  getGoogleSheetConfig,
  savePatientsroomRegistration,
} from '../lib/googleSheetSync.js'

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-teal-500/25 focus:border-teal-400 focus:ring-2'
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-slate-500'

const YES_NO = ['', 'Yes', 'No', 'Unknown']

function validate(form) {
  const errors = {}
  if (!String(form.room_number || '').trim()) {
    errors.room_number = 'Room number is required.'
  }
  if (!String(form.patients_name || '').trim()) {
    errors.patients_name = 'Patient name is required.'
  }
  const ageRaw = String(form.age || '').trim()
  if (ageRaw) {
    const age = parseInt(ageRaw, 10)
    if (!Number.isFinite(age) || age < 0 || age > 130) {
      errors.age = 'Enter a valid age (0–130) or leave blank.'
    }
  }
  return errors
}

/**
 * Patient ↔ Google Sheet **Patientsroom** registration (upsert by room_number).
 * @param {{ formIdPrefix?: string, onSaved?: () => void, afterReset?: () => void }} props
 */
export default function PatientsroomRegistrationForm({ formIdPrefix = '', onSaved, afterReset }) {
  const pid = (name) => `${formIdPrefix}${name}`
  const sheetCfg = useMemo(() => getGoogleSheetConfig(), [])
  const [form, setForm] = useState(() => emptyPatientsroomRegistrationForm())
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState({ message: '', kind: 'success' })
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function showToast(message, kind = 'success') {
    setToast({ message, kind })
    if (!message) return
    window.setTimeout(() => setToast({ message: '', kind: 'success' }), 2800)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (sheetCfg.isSimulation || !sheetCfg.webhookUrl) {
      setSubmitError(
        'Google Sheet live sync is off or webhook URL is missing. Set VITE_GOOGLE_SHEET_MODE=live (or production), GOOGLE_SHEET_WEBHOOK_URL, and GOOGLE_SHEET_ID.',
      )
      showToast('Cannot save — Sheet connection not in live mode.', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const { sync } = await savePatientsroomRegistration(form)
      if (!sync.ok || sync.status === 'failed') {
        throw new Error(sync.message || 'Google Sheet request failed.')
      }
      if (sync.status === 'local_only') {
        throw new Error(sync.message || 'Simulation mode — enable live Sheet mode to save.')
      }

      let detail = 'Saved to Patientsroom.'
      if (sync.updated === 1 && sync.inserted !== 1) detail = 'Updated existing row for this room in Patientsroom.'
      else if (sync.inserted === 1) detail = 'Added new patient row to Patientsroom.'

      showToast(detail, 'success')
      setSubmitError('')
      onSaved?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save to Google Sheet.'
      console.error('[PatientsroomRegistrationForm] submit failed:', err)
      setSubmitError(msg)
      showToast(msg, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {toast.message ? (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${toast.kind === 'error' ? 'bg-red-50 text-red-800 ring-1 ring-red-100' : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'}`}
        >
          {toast.message}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={pid('room_number')} className={labelClass}>
            Room number <span className="text-red-600">*</span>
          </label>
          <input
            id={pid('room_number')}
            type="text"
            autoComplete="off"
            value={form.room_number}
            onChange={(e) => setField('room_number', e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(errors.room_number)}
          />
          {errors.room_number ? (
            <p className="mt-1 text-xs text-red-600">{errors.room_number}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor={pid('patients_name')} className={labelClass}>
            Patient name <span className="text-red-600">*</span>
          </label>
          <input
            id={pid('patients_name')}
            type="text"
            autoComplete="name"
            value={form.patients_name}
            onChange={(e) => setField('patients_name', e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(errors.patients_name)}
          />
          {errors.patients_name ? (
            <p className="mt-1 text-xs text-red-600">{errors.patients_name}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor={pid('gender')} className={labelClass}>
            Gender
          </label>
          <select
            id={pid('gender')}
            value={form.gender}
            onChange={(e) => setField('gender', e.target.value)}
            className={inputClass}
          >
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={pid('age')} className={labelClass}>
            Age
          </label>
          <input
            id={pid('age')}
            type="number"
            min={0}
            max={130}
            placeholder="Optional"
            value={form.age}
            onChange={(e) => setField('age', e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(errors.age)}
          />
          {errors.age ? <p className="mt-1 text-xs text-red-600">{errors.age}</p> : null}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={pid('diagnosis')} className={labelClass}>
            Diagnosis
          </label>
          <textarea
            id={pid('diagnosis')}
            rows={2}
            value={form.diagnosis}
            onChange={(e) => setField('diagnosis', e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={pid('mobility_status')} className={labelClass}>
            Mobility status
          </label>
          <input
            id={pid('mobility_status')}
            type="text"
            value={form.mobility_status}
            onChange={(e) => setField('mobility_status', e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={pid('appetite_status')} className={labelClass}>
            Appetite status
          </label>
          <input
            id={pid('appetite_status')}
            type="text"
            value={form.appetite_status}
            onChange={(e) => setField('appetite_status', e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={pid('fall_risk')} className={labelClass}>
            Fall risk
          </label>
          <select
            id={pid('fall_risk')}
            value={form.fall_risk}
            onChange={(e) => setField('fall_risk', e.target.value)}
            className={inputClass}
          >
            {FALL_RISK_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={pid('turning_required')} className={labelClass}>
            Turning required
          </label>
          <select
            id={pid('turning_required')}
            value={form.turning_required}
            onChange={(e) => setField('turning_required', e.target.value)}
            className={inputClass}
          >
            {YES_NO.map((o) => (
              <option key={o || 'unset'} value={o}>
                {o || '—'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={pid('rehab_required')} className={labelClass}>
            Rehab required
          </label>
          <select
            id={pid('rehab_required')}
            value={form.rehab_required}
            onChange={(e) => setField('rehab_required', e.target.value)}
            className={inputClass}
          >
            {YES_NO.map((o) => (
              <option key={o || 'unset-rehab'} value={o}>
                {o || '—'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={pid('ot_required')} className={labelClass}>
            OT required
          </label>
          <select
            id={pid('ot_required')}
            value={form.ot_required}
            onChange={(e) => setField('ot_required', e.target.value)}
            className={inputClass}
          >
            {YES_NO.map((o) => (
              <option key={o || 'unset-ot'} value={o}>
                {o || '—'}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={pid('family_contact')} className={labelClass}>
            Family contact
          </label>
          <input
            id={pid('family_contact')}
            type="text"
            value={form.family_contact}
            onChange={(e) => setField('family_contact', e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={pid('status')} className={labelClass}>
            Status
          </label>
          <input
            id={pid('status')}
            type="text"
            placeholder="e.g. Active"
            value={form.status}
            onChange={(e) => setField('status', e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={pid('notes')} className={labelClass}>
            Notes
          </label>
          <textarea
            id={pid('notes')}
            rows={3}
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {submitError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-100">{submitError}</p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="inline-flex justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => {
            setForm(emptyPatientsroomRegistrationForm())
            setErrors({})
            setSubmitError('')
            afterReset?.()
          }}
        >
          Reset form
        </button>
        <button
          type="submit"
          className="inline-flex justify-center rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving…' : 'Save to Patientsroom'}
        </button>
      </div>
    </form>
  )
}
