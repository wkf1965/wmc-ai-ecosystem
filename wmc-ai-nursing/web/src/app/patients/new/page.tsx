"use client"

import Link from "next/link"
import PatientForm from "../_components/PatientForm"

export default function CreatePatientPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">New resident</p>
          <h1 className="text-2xl font-semibold text-slate-900">Create patient record</h1>
        </div>
        <Link href="/patients" className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900">
          Back to patients
        </Link>
      </div>
      <PatientForm mode="create" />
    </main>
  )
}
