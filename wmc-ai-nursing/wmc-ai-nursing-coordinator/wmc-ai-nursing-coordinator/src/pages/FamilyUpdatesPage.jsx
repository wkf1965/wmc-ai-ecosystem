import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Sparkles } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { generateFamilyUpdate } from '../data/dummyData'
import { usePatients } from '../hooks/usePatients.js'

export default function FamilyUpdatesPage() {
  const { patients } = usePatients()
  const [selectedId, setSelectedId] = useState(null)
  const [manualDraft, setManualDraft] = useState(null)

  const activeId = useMemo(() => {
    if (!patients.length) return ''
    if (selectedId && patients.some((p) => p.id === selectedId)) return selectedId
    return patients[0].id
  }, [patients, selectedId])

  const selected = useMemo(() => patients.find((p) => p.id === activeId), [patients, activeId])

  const templateDraft = useMemo(() => generateFamilyUpdate(selected), [selected])

  const draft = manualDraft !== null ? manualDraft : templateDraft

  function regenerate() {
    setManualDraft(generateFamilyUpdate(selected))
  }

  function copy() {
    navigator.clipboard.writeText(draft).catch(() => {})
  }

  if (patients.length === 0) {
    return (
      <div>
        <PageHeader
          title="Family updates"
          description="Add at least one patient to generate drafts from the local roster."
        />
        <p className="text-sm text-slate-600">
          No patients in your local database.{' '}
          <Link to="/patients/new" className="font-semibold text-teal-700 hover:underline">
            Create a patient
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Family updates"
        description="Generate empathetic, plain-language summaries for caregivers — review and personalize before sending."
        action={
          <Badge variant="teal" className="self-start sm:self-auto">
            Demo generator
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1" padding="p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-slate-900">Recipient context</h3>
          <label htmlFor="fam-patient" className="mt-4 block text-xs font-medium text-slate-500">
            Patient
          </label>
          <select
            id="fam-patient"
            value={activeId}
            onChange={(e) => {
              setSelectedId(e.target.value)
              setManualDraft(null)
            }}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-teal-500/30 focus:ring-2"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>

          {selected ? (
            <dl className="mt-6 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500">Contact on file</dt>
                <dd className="mt-0.5 text-slate-800">{selected.familyContact}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Care focus</dt>
                <dd className="mt-0.5 text-slate-800">{selected.diagnosis}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Mobility</dt>
                <dd className="mt-0.5 text-slate-800">{selected.mobilityStatus}</dd>
              </div>
            </dl>
          ) : null}

          <button
            type="button"
            onClick={regenerate}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:from-teal-700 hover:to-cyan-700"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Regenerate draft
          </button>
        </Card>

        <Card className="lg:col-span-2" padding="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Draft message</h3>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy to clipboard
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setManualDraft(e.target.value)}
            rows={16}
            className="mt-4 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/50 p-4 font-sans text-sm leading-relaxed text-slate-800 outline-none ring-teal-500/20 focus:border-teal-300 focus:bg-white focus:ring-2"
            spellCheck
          />
          <p className="mt-3 text-xs text-slate-500">
            This template merges profile fields with a neutral tone. Replace placeholders, add specific vitals or
            appointments, and route through your secure family portal or approved email workflow.
          </p>
        </Card>
      </div>
    </div>
  )
}
