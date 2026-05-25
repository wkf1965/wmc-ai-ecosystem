import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { usePatients } from '../hooks/usePatients.js'
import { deriveRiskScore, initialsFromFullName } from '../db/patientSchema.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import {
  RESET_PATIENTS_CONFIRM,
  RESET_PATIENTS_SUCCESS,
  deletePatientRecords,
} from '../api/dashboardApi.js'

function riskVariant(score) {
  if (score >= 70) return 'danger'
  if (score >= 55) return 'warning'
  return 'success'
}

export default function PatientsPage() {
  const { patients, removePatient, refresh: refreshPatients } = usePatients()
  const { refresh: refreshNotes } = useNursingNotes()
  const [query, setQuery] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deleteAllFeedback, setDeleteAllFeedback] = useState(null)

  const handleDeletePatientRecords = useCallback(async () => {
    if (!window.confirm(RESET_PATIENTS_CONFIRM)) return

    setDeletingAll(true)
    setDeleteAllFeedback(null)
    try {
      await deletePatientRecords()
      refreshPatients()
      refreshNotes()
      setDeleteAllFeedback({ type: 'success', message: RESET_PATIENTS_SUCCESS })
    } catch (error) {
      const offline = error instanceof Error && error.name === 'BackendOfflineError'
      const message = offline ? 'Backend offline' : error instanceof Error ? error.message : 'Failed to delete patient records.'
      console.error('[Patients] Delete patient records failed:', error)
      setDeleteAllFeedback({ type: 'error', message })
    } finally {
      setDeletingAll(false)
    }
  }, [refreshNotes, refreshPatients])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((p) => {
      const blob = [
        p.fullName,
        p.diagnosis,
        p.assignedNurse,
        p.rehabilitationStatus,
        p.familyContact,
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [patients, query])

  const pendingDelete = deleteId ? patients.find((p) => p.id === deleteId) : null

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Live list backed by a local mock database (browser localStorage). Add, edit, or remove residents and rehab clients."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleDeletePatientRecords}
              disabled={deletingAll}
              className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              {deletingAll ? 'Deleting...' : 'Delete Patient Records'}
            </button>
            <Link
              to="/patients/new"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add patient
            </Link>
          </div>
        }
      />

      {deleteAllFeedback ? (
        <section
          role="status"
          className={`mb-4 rounded-2xl border p-3 text-sm ${
            deleteAllFeedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {deleteAllFeedback.message}
        </section>
      ) : null}

      <Card className="mb-4" padding="p-4 sm:p-5">
        <label htmlFor="patient-search" className="sr-only">
          Search patients
        </label>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="patient-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, diagnosis, nurse…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none ring-teal-500/25 focus:border-teal-400 focus:ring-2"
          />
        </div>
      </Card>

      <Card padding="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Age / gender</th>
                <th className="px-4 py-3">Admission</th>
                <th className="px-4 py-3">Rehabilitation</th>
                <th className="px-4 py-3">Risks</th>
                <th className="px-4 py-3">Nurse</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    No patients match your search.{' '}
                    <Link to="/patients/new" className="font-semibold text-teal-700 hover:underline">
                      Add a patient
                    </Link>
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const score = deriveRiskScore(p)
                  const initials = initialsFromFullName(p.fullName)
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{p.fullName}</p>
                            <p className="truncate text-xs text-slate-500">{p.diagnosis}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">
                        {p.age} · {p.gender}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{p.admissionDate || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.rehabilitationStatus === 'Active rehabilitation' ? 'info' : 'default'}>
                          {p.rehabilitationStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200/60">
                            Fall {p.fallRisk}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                              riskVariant(score) === 'danger'
                                ? 'bg-red-50 text-red-800 ring-red-200/60'
                                : riskVariant(score) === 'warning'
                                  ? 'bg-amber-50 text-amber-900 ring-amber-200/60'
                                  : 'bg-emerald-50 text-emerald-800 ring-emerald-200/60'
                            }`}
                          >
                            Idx {score}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-slate-700" title={p.assignedNurse}>
                        {p.assignedNurse || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/patients/${p.id}`}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                            <span className="text-xs font-medium">View</span>
                          </Link>
                          <Link
                            to={`/patients/${p.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="text-xs font-medium">Edit</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteId(p.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="text-xs font-medium">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete resident?"
        message="Are you sure you want to delete this resident?"
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            removePatient(deleteId)
            refreshPatients()
          }
          setDeleteId(null)
        }}
      />
    </div>
  )
}
