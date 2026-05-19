import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import PatientsroomRegistrationForm from '../components/PatientsroomRegistrationForm.jsx'
import { getGoogleSheetConfig } from '../lib/googleSheetSync.js'

export default function PatientRegistrationPage() {
  const sheetCfg = useMemo(() => getGoogleSheetConfig(), [])

  return (
    <div className="space-y-6 px-4 pb-10 pt-6 md:px-8">
      <div className="mb-2">
        <Link
          to="/patients"
          className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Patients
        </Link>
      </div>

      <PageHeader
        title="Patient registration"
        description="Registers or updates one row in Google Sheet tab Patientsroom. Same room number updates the existing patient; a new room appends a row."
      />

      {sheetCfg.isSimulation ? (
        <Card className="border-amber-200 bg-amber-50 text-sm text-amber-950">
          <strong>Offline:</strong> Set <code className="rounded bg-white px-1">VITE_GOOGLE_SHEET_MODE</code> to{' '}
          <code className="rounded bg-white px-1">live</code> or <code className="rounded bg-white px-1">production</code>{' '}
          with webhook URL and Sheet ID to submit this form.
        </Card>
      ) : null}

      <Card padding="p-5 sm:p-8">
        <PatientsroomRegistrationForm formIdPrefix="reg-" />
      </Card>

      <p className="text-xs leading-relaxed text-slate-500">
        Upsert uses a normalized room match (spaces ignored, case-insensitive). Deploy the latest Apps Script so{' '}
        <code className="text-slate-700">patientsroom</code> writes upsert instead of blind append.
      </p>
    </div>
  )
}
