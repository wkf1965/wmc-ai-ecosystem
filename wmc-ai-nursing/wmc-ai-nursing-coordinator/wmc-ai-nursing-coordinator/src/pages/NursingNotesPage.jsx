import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Filter, Plus, Trash2, UserRound } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'

function painTone(score) {
  if (score >= 7) return 'text-red-700 bg-red-50 ring-red-100'
  if (score >= 4) return 'text-amber-800 bg-amber-50 ring-amber-100'
  return 'text-emerald-800 bg-emerald-50 ring-emerald-100'
}

function Mini({ label, children }) {
  return (
    <div className="rounded-xl bg-slate-50/90 p-3 ring-1 ring-slate-100">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900 whitespace-pre-wrap">{children || '—'}</p>
    </div>
  )
}

export default function NursingNotesPage() {
  const { patients, getById } = usePatients()
  const { notes, removeNote } = useNursingNotes()
  const [searchParams, setSearchParams] = useSearchParams()
  const [deleteId, setDeleteId] = useState(null)

  const qPatient = searchParams.get('patient')
  const patientId = useMemo(() => {
    if (qPatient && patients.some((p) => p.id === qPatient)) return qPatient
    return 'all'
  }, [qPatient, patients])

  const filtered = useMemo(() => {
    const list = [...notes].sort((a, b) => {
      const da = a.date || ''
      const db = b.date || ''
      if (da !== db) return db.localeCompare(da)
      return (b.createdAt || '').localeCompare(a.createdAt || '')
    })
    if (patientId === 'all') return list
    return list.filter((n) => n.patientId === patientId)
  }, [notes, patientId])

  function onFilterChange(value) {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') {
      next.delete('patient')
    } else {
      next.set('patient', value)
    }
    setSearchParams(next, { replace: true })
  }

  const pendingDelete = deleteId ? notes.find((n) => n.id === deleteId) : null

  return (
    <div>
      <PageHeader
        title="Daily nursing notes"
        description="Patient-linked observations stored locally. Add entries for appetite, sleep, vitals, elimination, skin, and narrative."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
              <Filter className="h-4 w-4 text-slate-400" aria-hidden />
              <label htmlFor="patient-filter" className="sr-only">
                Filter by patient
              </label>
              <select
                id="patient-filter"
                value={patientId}
                onChange={(e) => onFilterChange(e.target.value)}
                className="border-0 bg-transparent text-sm font-medium text-slate-900 outline-none"
              >
                <option value="all">All patients</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </span>
            <Link
              to={
                patientId !== 'all'
                  ? `/nursing-notes/new?patient=${encodeURIComponent(patientId)}`
                  : '/nursing-notes/new'
              }
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add note
            </Link>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <Card padding="p-8" className="text-center text-slate-600">
          <p className="text-sm">No notes for this filter yet.</p>
          <Link
            to={
              patientId !== 'all'
                ? `/nursing-notes/new?patient=${encodeURIComponent(patientId)}`
                : '/nursing-notes/new'
            }
            className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:underline"
          >
            Add the first note
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((n) => {
            const live = getById(n.patientId)
            const displayName = live?.fullName || n.patientNameSnapshot || 'Unknown patient'
            return (
              <Card key={n.id} padding="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{displayName}</h3>
                      {live ? (
                        <Link
                          to={`/patients/${n.patientId}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"
                        >
                          <UserRound className="h-3 w-3" aria-hidden />
                          Patient profile
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">Patient not in roster</span>
                      )}
                      <Badge variant="teal">{n.shift}</Badge>
                      <Badge variant="default">{n.date}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {n.author ? <>By {n.author}</> : <>Author not recorded</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold tabular-nums ring-1 ring-inset ${painTone(n.painScore)}`}
                    >
                      Pain {n.painScore}/10
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeleteId(n.id)}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      title="Delete note"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Mini label="Appetite">{n.appetite}</Mini>
                  <Mini label="Sleep">{n.sleep}</Mini>
                  <Mini label="Mood">{n.mood}</Mini>
                  <Mini label="Blood pressure">{n.bloodPressure}</Mini>
                  <Mini label="Blood sugar">{n.bloodSugar}</Mini>
                  <Mini label="Urination">{n.urination}</Mini>
                  <Mini label="Bowel movement">{n.bowelMovement}</Mini>
                  <Mini label="Skin condition">{n.skinCondition}</Mini>
                  <Mini label="Abnormal events">{n.abnormalEvents}</Mini>
                </div>

                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nurse remarks</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-800">{n.nurseRemarks || '—'}</p>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete nursing note?"
        message={
          pendingDelete
            ? `Remove the ${pendingDelete.date} ${pendingDelete.shift} entry for ${pendingDelete.patientNameSnapshot}?`
            : ''
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) removeNote(deleteId)
          setDeleteId(null)
        }}
      />
    </div>
  )
}
