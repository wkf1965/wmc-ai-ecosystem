import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { usePatients } from '../hooks/usePatients.js'
import { deriveRiskScore, initialsFromFullName } from '../db/patientSchema.js'

function riskVariant(score) {
  if (score >= 70) return 'danger'
  if (score >= 55) return 'warning'
  return 'success'
}

export default function PatientsPage() {
  const { patients, removePatient } = usePatients()
  const [query, setQuery] = useState('')
  const [deleteId, setDeleteId] = useState(null)

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
          <Link
            to="/patients/new"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add patient
          </Link>
        }
      />

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
                        <div className="flex justify-end gap-1">
                          <Link
                            to={`/patients/${p.id}`}
                            className="inline-flex rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link
                            to={`/patients/${p.id}/edit`}
                            className="inline-flex rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteId(p.id)}
                            className="inline-flex rounded-lg p-2 text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
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
        title="Delete patient?"
        message={
          pendingDelete
            ? `Remove ${pendingDelete.fullName} from the local database. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) removePatient(deleteId)
          setDeleteId(null)
        }}
      />
    </div>
  )
}
