import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import {
  NOTE_SHIFT_OPTIONS,
  emptyNursingNoteForm,
  formToNursingNotePayload,
} from '../db/nursingNoteSchema.js'

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-teal-500/25 focus:border-teal-400 focus:ring-2'
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-slate-500'

export default function NursingNoteFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prePatient = searchParams.get('patient') || ''

  const { patients, getById } = usePatients()
  const { addNote } = useNursingNotes()

  const [form, setForm] = useState(() => emptyNursingNoteForm())

  const validPrePatient = useMemo(
    () => (prePatient && patients.some((p) => p.id === prePatient) ? prePatient : ''),
    [prePatient, patients],
  )

  const mergedPatientId = (form.patientId || validPrePatient || '').trim()

  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastKind, setToastKind] = useState('success')

  function showToast(message, kind = 'success') {
    setToastMessage(message)
    setToastKind(kind)
    if (!message) return
    window.setTimeout(() => {
      setToastMessage('')
    }, 2200)
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    setToastMessage('')
    const next = {}
    if (!mergedPatientId) {
      next.patientId = 'Select a patient.'
    }
    if (!String(form.date || '').trim()) {
      next.date = 'Note date is required.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const patient = getById(mergedPatientId)
    const name = patient?.fullName?.trim() || 'Unknown patient'
    const payload = formToNursingNotePayload({ ...form, patientId: mergedPatientId }, name)
    setIsSubmitting(true)
    try {
      const result = await addNote(payload)
      if (result?.googleSheetSyncStatus === 'failed') {
        throw new Error(result?.googleSheetSyncMessage || 'Failed to sync note to Google Sheet.')
      }
      showToast('Saved to Google Sheet database', 'success')
      navigate('/nursing-notes', { replace: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save note.'
      setSubmitError(message)
      showToast(message, 'error')
      setIsSubmitting(false)
      return
    }
    setIsSubmitting(false)
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          to="/nursing-notes"
          className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to daily notes
        </Link>
      </div>

      <PageHeader
        title="Add daily nursing note"
        description="Structured observation entry linked to a patient. Stored locally in your browser."
      />

      {patients.length === 0 ? (
        <p className="text-sm text-slate-600">
          Add a patient before creating notes.{' '}
          <Link to="/patients/new" className="font-semibold text-teal-700 hover:underline">
            Create patient
          </Link>
        </p>
      ) : (
      <Card padding="p-5 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
            {toastMessage ? (
              <p
                className={`rounded-xl px-3 py-2 text-sm ${
                  toastKind === 'error' ? 'bg-red-50 text-red-800 ring-1 ring-red-100' : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
                }`}
              >
                {toastMessage}
              </p>
            ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="nn-patient" className={labelClass}>
                Patient <span className="text-red-600">*</span>
              </label>
              <select
                id="nn-patient"
                value={mergedPatientId}
                onChange={(e) => setField('patientId', e.target.value)}
                className={inputClass}
                aria-invalid={Boolean(errors.patientId)}
              >
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
              {errors.patientId ? <p className="mt-1 text-xs text-red-600">{errors.patientId}</p> : null}
            </div>

            <div>
              <label htmlFor="nn-date" className={labelClass}>
                Date <span className="text-red-600">*</span>
              </label>
              <input
                id="nn-date"
                type="date"
                value={form.date}
                onChange={(e) => setField('date', e.target.value)}
                className={inputClass}
                aria-invalid={Boolean(errors.date)}
              />
              {errors.date ? <p className="mt-1 text-xs text-red-600">{errors.date}</p> : null}
            </div>

            <div>
              <label htmlFor="nn-shift" className={labelClass}>
                Shift
              </label>
              <select
                id="nn-shift"
                value={form.shift}
                onChange={(e) => setField('shift', e.target.value)}
                className={inputClass}
              >
                {NOTE_SHIFT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="nn-author" className={labelClass}>
                Documenting nurse
              </label>
              <input
                id="nn-author"
                type="text"
                value={form.author}
                onChange={(e) => setField('author', e.target.value)}
                className={inputClass}
                placeholder="e.g. R.N. Patel"
              />
            </div>

            <div>
              <label htmlFor="nn-appetite" className={labelClass}>
                Appetite
              </label>
              <textarea
                id="nn-appetite"
                rows={2}
                value={form.appetite}
                onChange={(e) => setField('appetite', e.target.value)}
                className={inputClass}
                placeholder="% meals, preferences, supplements"
              />
            </div>

            <div>
              <label htmlFor="nn-sleep" className={labelClass}>
                Sleep
              </label>
              <textarea
                id="nn-sleep"
                rows={2}
                value={form.sleep}
                onChange={(e) => setField('sleep', e.target.value)}
                className={inputClass}
                placeholder="Quality, interruptions, naps"
              />
            </div>

            <div>
              <label htmlFor="nn-pain" className={labelClass}>
                Pain score (0–10)
              </label>
              <input
                id="nn-pain"
                type="number"
                min={0}
                max={10}
                step={1}
                value={form.painScore}
                onChange={(e) => setField('painScore', e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="nn-mood" className={labelClass}>
                Mood
              </label>
              <input
                id="nn-mood"
                type="text"
                value={form.mood}
                onChange={(e) => setField('mood', e.target.value)}
                className={inputClass}
                placeholder="Affect, cooperation, agitation"
              />
            </div>

            <div>
              <label htmlFor="nn-bp" className={labelClass}>
                Blood pressure
              </label>
              <input
                id="nn-bp"
                type="text"
                value={form.bloodPressure}
                onChange={(e) => setField('bloodPressure', e.target.value)}
                className={inputClass}
                placeholder="e.g. 128/76 mmHg"
              />
            </div>

            <div>
              <label htmlFor="nn-bs" className={labelClass}>
                Blood sugar
              </label>
              <input
                id="nn-bs"
                type="text"
                value={form.bloodSugar}
                onChange={(e) => setField('bloodSugar', e.target.value)}
                className={inputClass}
                placeholder="mg/dL, timing, route"
              />
            </div>

            <div>
              <label htmlFor="nn-urine" className={labelClass}>
                Urination
              </label>
              <textarea
                id="nn-urine"
                rows={2}
                value={form.urination}
                onChange={(e) => setField('urination', e.target.value)}
                className={inputClass}
                placeholder="I/O, colour, frequency, catheter"
              />
            </div>

            <div>
              <label htmlFor="nn-bm" className={labelClass}>
                Bowel movement
              </label>
              <textarea
                id="nn-bm"
                rows={2}
                value={form.bowelMovement}
                onChange={(e) => setField('bowelMovement', e.target.value)}
                className={inputClass}
                placeholder="Last BM, consistency, laxatives"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="nn-skin" className={labelClass}>
                Skin condition
              </label>
              <textarea
                id="nn-skin"
                rows={2}
                value={form.skinCondition}
                onChange={(e) => setField('skinCondition', e.target.value)}
                className={inputClass}
                placeholder="Turgor, wounds, pressure areas, dressings"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="nn-abn" className={labelClass}>
                Abnormal events
              </label>
              <textarea
                id="nn-abn"
                rows={2}
                value={form.abnormalEvents}
                onChange={(e) => setField('abnormalEvents', e.target.value)}
                className={inputClass}
                placeholder="Falls, desaturation, behaviour, refusals — or None"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="nn-remarks" className={labelClass}>
                Nurse remarks
              </label>
              <textarea
                id="nn-remarks"
                rows={4}
                value={form.nurseRemarks}
                onChange={(e) => setField('nurseRemarks', e.target.value)}
                className={inputClass}
                placeholder="Holistic narrative, care given, education, follow-up"
              />
            </div>
          </div>

          {submitError ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-100">{submitError}</p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
            <Link
              to="/nursing-notes"
              className="inline-flex justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex justify-center rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save note'}
            </button>
          </div>
        </form>
      </Card>
      )}
    </div>
  )
}
