"use client"

import Link from "next/link"
import PatientForm from "../../_components/PatientForm"

type Params = { params: { id: string } }

export default function EditPatientPage({ params }: Params) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Resident update</p>
          <h1 className="text-2xl font-semibold text-slate-900">Edit patient profile</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/patients/${params.id}`} className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900">
            Back to profile
          </Link>
          <Link href="/patients" className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900">
            Back to list
          </Link>
        </div>
      </div>
      <PatientForm mode="edit" patientId={params.id} />
    </main>
  )
}