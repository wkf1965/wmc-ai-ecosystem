import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import PatientFormFields from '../components/PatientFormFields.jsx'
import { usePatients } from '../hooks/usePatients.js'
import { emptyPatientForm, formToPatientPayload, patientToForm } from '../db/patientSchema.js'

function validate(form) {
  const errors = {}
  if (!String(form.fullName || '').trim()) {
    errors.fullName = 'Full name is required.'
  }
  const age = parseInt(String(form.age), 10)
  if (!Number.isFinite(age) || age < 0 || age > 130) {
    errors.age = 'Enter a valid age (0–130).'
  }
  return errors
}

function PatientFormInner({ mode, patientId, initialForm }) {
  const navigate = useNavigate()
  const { addPatient, savePatient } = usePatients()
  const [form, setForm] = useState(() => initialForm)
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

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload = formToPatientPayload(form)
    setIsSubmitting(true)
    try {
      if (mode === 'edit') {
        const updated = await savePatient(patientId, payload)
        if (!updated) {
          throw new Error('Could not save patient. They may have been removed.')
        }
        if (updated?.googleSheetSyncStatus === 'failed') {
          throw new Error(updated?.googleSheetSyncMessage || 'Failed to sync patient to Google Sheet.')
        }
        showToast('Saved to Google Sheet database', 'success')
        navigate(`/patients/${patientId}`, { replace: true })
      } else {
        const created = await addPatient(payload)
        if (!created) {
          throw new Error('Could not create patient.')
        }
        if (created?.googleSheetSyncStatus === 'failed') {
          throw new Error(created?.googleSheetSyncMessage || 'Failed to sync patient to Google Sheet.')
        }
        showToast('Saved to Google Sheet database', 'success')
        navigate(`/patients/${created.id}`, { replace: true })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save patient.'
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
          to={mode === 'edit' ? `/patients/${patientId}` : '/patients'}
          className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {mode === 'edit' ? 'Back to profile' : 'Back to patient list'}
        </Link>
      </div>

      <PageHeader
        title={mode === 'edit' ? 'Edit patient' : 'Add patient'}
        description="Patient records are saved locally and synced to Google Sheet when configured."
      />

      <Card padding="p-5 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {toastMessage ? (
            <p
              className={`rounded-xl px-3 py-2 text-sm ${toastKind === 'error' ? 'bg-red-50 text-red-800 ring-1 ring-red-100' : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'}`}
            >
              {toastMessage}
            </p>
          ) : null}
          <PatientFormFields form={form} setForm={setForm} errors={errors} />

          {submitError ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-100">{submitError}</p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
            <Link
              to={mode === 'edit' ? `/patients/${patientId}` : '/patients'}
              className="inline-flex justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex justify-center rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create patient'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default function PatientFormPage() {
  const params = useParams()
  const location = useLocation()
  const { getById } = usePatients()
  const isNew = location.pathname.endsWith('/new')
  const editId = isNew ? undefined : params.id

  if (!isNew) {
    const existing = getById(editId)
    if (!existing) {
      return <Navigate to="/patients" replace />
    }
    return (
      <PatientFormInner
        key={editId}
        mode="edit"
        patientId={editId}
        initialForm={patientToForm(existing)}
      />
    )
  }

  return <PatientFormInner key="new" mode="new" patientId={undefined} initialForm={emptyPatientForm()} />
}
