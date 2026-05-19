import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BrainCircuit, ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import { analyzeAllPatientsFromNotes } from '../lib/aiRiskDetection.js'

function EscalationBanner() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/95 p-4 text-sm text-red-950 ring-1 ring-red-100">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
      <div>
        <p className="font-semibold">Escalation alert</p>
        <p className="mt-1 text-red-900/90">
          One or more risk domains scored at or above the escalation threshold (60/100 in this demo model). Notify
          charge RN or provider per unit policy and document follow-up in the EHR.
        </p>
      </div>
    </div>
  )
}

export default function AIRiskDetectionPage() {
  const { patients, getById } = usePatients()
  const { notes } = useNursingNotes()
  const [openId, setOpenId] = useState(null)

  const analyses = useMemo(
    () => analyzeAllPatientsFromNotes(patients, notes, (id) => getById(id)),
    [patients, notes, getById],
  )

  const escalationCount = analyses.filter((a) => a.anyEscalation && !a.insufficientData).length

  return (
    <div>
      <PageHeader
        title="AI risk detection"
        description="Heuristic analysis of recent daily nursing notes plus fall/pressure context from the patient roster. Demo logic — not a substitute for clinical judgment."
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900">
            <BrainCircuit className="h-3.5 w-3.5" aria-hidden />
            Rule-based engine
          </span>
        }
      />

      <div className="mb-6 flex flex-wrap items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 ring-1 ring-amber-100">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        <p>
          <strong>Governance:</strong> Patterns match keywords and structured fields in locally stored notes. Tune
          thresholds and dictionaries before any production use; validate every alert at the bedside.
        </p>
      </div>

      {escalationCount > 0 ? (
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-slate-700">
            {escalationCount} patient{escalationCount === 1 ? '' : 's'} with active escalation domain(s)
          </p>
          <EscalationBanner />
        </div>
      ) : null}

      <div className="space-y-4">
        {analyses.map((a) => (
          <Card key={a.patientId} padding="p-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenId((id) => (id === a.patientId ? null : a.patientId))}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50/80 sm:px-6"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">{a.patientName}</h3>
                  {a.insufficientData ? (
                    <Badge variant="default">No notes</Badge>
                  ) : (
                    <>
                      {a.anyEscalation ? (
                        <Badge variant="danger" className="gap-1">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Escalation
                        </Badge>
                      ) : (
                        <Badge variant="success">Stable</Badge>
                      )}
                      <Badge variant="teal">{a.noteCount} note{a.noteCount === 1 ? '' : 's'} analyzed</Badge>
                      {a.lastNoteDate ? (
                        <span className="text-xs text-slate-500">Latest {a.lastNoteDate}</span>
                      ) : null}
                    </>
                  )}
                </div>
                {!a.insufficientData ? (
                  <p className="mt-1 text-sm text-slate-600">
                    Composite risk score{' '}
                    <span className="font-bold tabular-nums text-slate-900">{a.overallScore}</span>
                    <span className="text-slate-400"> /100</span> — highest domain score across categories.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Add nursing notes to enable AI risk scoring.</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {!a.insufficientData ? (
                  <span className="hidden rounded-xl bg-slate-900 px-3 py-2 text-xl font-bold tabular-nums text-white sm:inline-block">
                    {a.overallScore}
                  </span>
                ) : null}
                {openId === a.patientId ? (
                  <ChevronDown className="h-5 w-5 text-slate-400" aria-hidden />
                ) : (
                  <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
                )}
              </div>
            </button>

            {!a.insufficientData && openId === a.patientId ? (
              <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-5 sm:px-6">
                <div className="mb-4 flex flex-wrap gap-2">
                  <Link
                    to={`/patients/${a.patientId}`}
                    className="text-xs font-semibold text-teal-700 hover:underline"
                  >
                    Open patient profile
                  </Link>
                  <span className="text-slate-300">·</span>
                  <Link
                    to={`/nursing-notes?patient=${encodeURIComponent(a.patientId)}`}
                    className="text-xs font-semibold text-teal-700 hover:underline"
                  >
                    View nursing notes
                  </Link>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {a.categories.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-2xl border bg-white p-4 shadow-sm ${
                        c.escalation ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200/90'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-slate-900">{c.label}</h4>
                        <Badge variant={c.badge}>{c.levelLabel}</Badge>
                      </div>
                      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                        {c.score}
                        <span className="text-lg font-medium text-slate-400">/100</span>
                      </p>
                      {c.escalationAlert ? (
                        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-800 ring-1 ring-red-100">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Escalation alert
                        </div>
                      ) : (
                        <p className="mt-2 text-xs font-medium text-slate-500">No escalation threshold met</p>
                      )}
                      <div className="mt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Signals</p>
                        <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                          {c.signals.length ? (
                            c.signals.slice(0, 5).map((s) => <li key={s}>{s}</li>)
                          ) : (
                            <li>No keyword hits in recent notes</li>
                          )}
                        </ul>
                      </div>
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Recommended action
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-800">{c.recommendedAction}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  )
}
