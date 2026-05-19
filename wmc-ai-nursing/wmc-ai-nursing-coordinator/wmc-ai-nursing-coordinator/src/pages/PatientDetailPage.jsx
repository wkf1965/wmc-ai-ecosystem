import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { usePatients } from '../hooks/usePatients.js'
import { deriveRiskScore, initialsFromFullName } from '../db/patientSchema.js'

function riskVariant(score) {
  if (score >= 70) return 'danger'
  if (score >= 55) return 'warning'
  return 'success'
}

function Field({ label, children }) {
  return (
    <div className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-100">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium whitespace-pre-wrap text-slate-900">{children || '—'}</p>
    </div>
  )
}

export default function PatientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getById, removePatient } = usePatients()
  const patient = getById(id)
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!patient) {
    return (
      <div>
        <PageHeader title="Patient not found" description="This record may have been deleted or the link is invalid." />
        <Link to="/patients" className="text-sm font-semibold text-teal-700 hover:text-teal-900">
          Return to patient list
        </Link>
      </div>
    )
  }

  const score = deriveRiskScore(patient)
  const initials = initialsFromFullName(patient.fullName)
  const isActiveRehab = patient.rehabilitationStatus === 'Active rehabilitation'

  function handleDelete() {
    removePatient(patient.id)
    setConfirmOpen(false)
    navigate('/patients', { replace: true })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to="/patients"
          className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Patient list
        </Link>
      </div>

      <PageHeader
        title={patient.fullName}
        description={`Admitted ${patient.admissionDate || '—'} · Assigned ${patient.assignedNurse || '—'}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/patients/${patient.id}/edit`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </Link>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-lg font-bold text-white shadow-md">
          {initials}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={isActiveRehab ? 'info' : 'default'}>{patient.rehabilitationStatus}</Badge>
          <Badge variant={riskVariant(score)}>Risk index {score}</Badge>
          <Badge variant="teal">
            Fall {patient.fallRisk} · Pressure {patient.pressureSoreRisk}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding="p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-900">Identification &amp; care team</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Age">{patient.age}</Field>
            <Field label="Gender">{patient.gender}</Field>
            <Field label="Admission date">{patient.admissionDate}</Field>
            <Field label="Assigned nurse">{patient.assignedNurse}</Field>
            <div className="sm:col-span-2">
              <Field label="Family contact">{patient.familyContact}</Field>
            </div>
          </div>
        </Card>

        <Card padding="p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-900">Clinical overview</h3>
          <div className="mt-4 grid gap-3">
            <Field label="Diagnosis">{patient.diagnosis}</Field>
            <Field label="Rehabilitation status">{patient.rehabilitationStatus}</Field>
            <Field label="Current medications">{patient.currentMedications}</Field>
          </div>
        </Card>

        <Card padding="p-5 sm:p-6" className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Functional &amp; safety</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Mobility status">{patient.mobilityStatus}</Field>
            <Field label="Feeding status">{patient.feedingStatus}</Field>
            <Field label="Toilet assistance">{patient.toiletAssistance}</Field>
            <Field label="Mental status">{patient.mentalStatus}</Field>
            <Field label="Fall risk">{patient.fallRisk}</Field>
            <Field label="Pressure sore risk">{patient.pressureSoreRisk}</Field>
          </div>
        </Card>

        <Card padding="p-5 sm:p-6" className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Record metadata</h3>
          <p className="mt-2 text-xs text-slate-500">
            Created {patient.createdAt ? new Date(patient.createdAt).toLocaleString() : '—'} · Updated{' '}
            {patient.updatedAt ? new Date(patient.updatedAt).toLocaleString() : '—'}
          </p>
          <p className="mt-3 text-xs text-slate-500">Patient id: {patient.id}</p>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to={`/nursing-notes?patient=${encodeURIComponent(patient.id)}`}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Nursing notes
        </Link>
        <Link
          to="/rehab"
          className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
        >
          Rehabilitation
        </Link>
        <Link
          to="/family-updates"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Family updates
        </Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete patient record?"
        message={`Remove ${patient.fullName} from the local patient list. Demo nursing notes may still reference this id until refreshed in a future version.`}
        confirmLabel="Delete permanently"
        danger
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
