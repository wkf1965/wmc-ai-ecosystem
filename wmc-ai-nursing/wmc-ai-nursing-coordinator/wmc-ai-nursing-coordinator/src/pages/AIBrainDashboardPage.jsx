import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  ClipboardList,
  HeartHandshake,
  MessageSquare,
  Siren,
  Stethoscope,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import {
  BRAIN_DATA_SOURCES,
  DECISION_LEVEL_LABELS,
  DECISION_LEVEL_ORDER,
  RISK_DIMENSION_LABELS,
  buildNursingBrainSnapshot,
  composePatientIntelligenceSummary,
  computePatientRiskProfile,
  generateWardIntelligenceSummaryFrom,
} from '../lib/aiNursingBrain.js'

const SIM_ORIGIN_MS = Date.UTC(2026, 0, 1, 12, 0, 0)
const SIM_TICK_MS = 60_000

function levelVariant(lv) {
  if (lv === 'critical') return 'danger'
  if (lv === 'high_risk') return 'danger'
  if (lv === 'warning') return 'warning'
  if (lv === 'monitor') return 'info'
  return 'success'
}

export default function AIBrainDashboardPage() {
  const { patients } = usePatients()
  const { notes } = useNursingNotes()
  const [tick, setTick] = useState(0)
  const [telegramEntries, setTelegramEntries] = useState([])
  const [selectedPatientId, setSelectedPatientId] = useState('')

  const nowMs = SIM_ORIGIN_MS + tick * SIM_TICK_MS

  const effectivePatientId = useMemo(() => {
    if (selectedPatientId && patients.some((p) => p.id === selectedPatientId)) return selectedPatientId
    return patients[0]?.id || ''
  }, [selectedPatientId, patients])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/integrations/telegram/entries?limit=15')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.ok && Array.isArray(j.entries)) setTelegramEntries(j.entries)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tick])

  const ward = useMemo(
    () => generateWardIntelligenceSummaryFrom(patients, notes, nowMs, { telegramEntries }),
    [patients, notes, nowMs, telegramEntries],
  )

  const snapshot = useMemo(() => buildNursingBrainSnapshot(patients, notes, nowMs), [patients, notes, nowMs])

  const patientIntel = useMemo(() => {
    if (!effectivePatientId) return null
    const profile = computePatientRiskProfile(snapshot, effectivePatientId)
    const full = composePatientIntelligenceSummary(effectivePatientId, snapshot)
    return { profile, full }
  }, [snapshot, effectivePatientId])

  return (
    <div className="mx-auto max-w-[1680px] pb-10">
      <PageHeader
        title="AI Intelligent Nursing Brain"
        description="Simulation-only fusion engine: nursing notes plus fourteen care-loop datasets drive nine risk axes, five decision tiers, and role-based recommendations. Not a regulated clinical device."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Simulation mode only</Badge>
            <Link
              to="/alerts"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              AI Alerts
            </Link>
          </div>
        }
      />

      <Card className="mb-4 border-teal-100 bg-gradient-to-br from-teal-50/90 to-white" padding="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <BrainCircuit className="h-8 w-8 shrink-0 text-teal-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">Ward intelligence summary</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-800">{ward.executiveSummary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DECISION_LEVEL_ORDER.map((lv) => (
                <Badge key={lv} variant={levelVariant(lv)}>
                  {DECISION_LEVEL_LABELS[lv]}
                </Badge>
              ))}
              <span className="self-center text-[11px] text-slate-500">Composite score bands</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-4 border-sky-100 bg-sky-50/40" padding="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <MessageSquare className="h-7 w-7 shrink-0 text-sky-600" aria-hidden />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Telegram nursing channel (recent)</h2>
              <p className="mt-1 text-xs text-slate-600">
                Pulled from the local webhook mock store (telegram-mock-store.json). Refreshes with the ward timer.
              </p>
            </div>
            {ward.recentTelegramNursingNotes?.length ? (
              <ul className="space-y-2 text-sm text-slate-800">
                {ward.recentTelegramNursingNotes.slice(0, 6).map((row, idx) => (
                  <li key={`${row.receivedAt}-${idx}`} className="rounded-lg border border-sky-100 bg-white/90 px-3 py-2">
                    <span className="font-medium text-slate-900">
                      {row.room ? `Room ${row.room}` : 'Room —'}
                      {row.patient ? ` · ${row.patient}` : ''}
                    </span>
                    <span className="text-slate-600">
                      {' '}
                      · {row.category || '—'} · workflow risk: {row.workflowRisk || '—'}
                    </span>
                    {row.notePreview ? (
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{row.notePreview}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No Telegram webhook rows yet — POST a dev webhook or use the Telegram test page pipeline.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Detected risks (keywords)</p>
                {ward.telegramDetectedRisks?.length ? (
                  <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
                    {ward.telegramDetectedRisks.slice(0, 10).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">None aggregated.</p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Suggested actions</p>
                {ward.telegramSuggestedActions?.length ? (
                  <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
                    {ward.telegramSuggestedActions.slice(0, 8).map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">None aggregated.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-4" padding="p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fused data sources</p>
        <p className="mt-1 text-xs text-slate-600">
          Engine ingests the following simulation feeds into one snapshot (plus nursing notes narrative).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {BRAIN_DATA_SOURCES.map((s) => (
            <span
              key={s.id}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 shadow-sm"
            >
              {s.label}
            </span>
          ))}
        </div>
      </Card>

      <Card className="mb-4" padding="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <BrainCircuit className="h-5 w-5 text-teal-600" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Patient intelligence drill-down</h2>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-xs font-semibold text-slate-600">
            Select patient
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
              value={effectivePatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName || p.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        {patientIntel ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overall</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={levelVariant(patientIntel.profile.overallLevel)}>
                  {DECISION_LEVEL_LABELS[patientIntel.profile.overallLevel]}
                </Badge>
                <span className="text-sm text-slate-600">
                  Score {patientIntel.profile.overallScore}/100 · Rm {patientIntel.profile.room}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-800">{patientIntel.full.narrativeSummary}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nine-axis risk scoring</p>
              <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {Object.entries(RISK_DIMENSION_LABELS).map(([key, label]) => {
                  const d = patientIntel.profile.dimensions[key]
                  return (
                    <li key={key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-600">{label}</span>
                      <Badge variant={levelVariant(d.level)} className="shrink-0">
                        {DECISION_LEVEL_LABELS[d.level]}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Recommendations</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['Nurse action', patientIntel.full.recommendations.nurseAction],
                  ['Supervisor action', patientIntel.full.recommendations.supervisorAction],
                  ['Doctor review', patientIntel.full.recommendations.doctorReview],
                  ['Family update', patientIntel.full.recommendations.familyUpdate],
                  ['Emergency escalation', patientIntel.full.recommendations.emergencyEscalation],
                ].map(([title, items]) => (
                  <div key={title}>
                    <p className="text-[11px] font-bold text-teal-900">{title}</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-teal-950">
                      {(items || []).length ? (
                        items.map((x, i) => <li key={i}>{x}</li>)
                      ) : (
                        <li className="list-none pl-0 text-slate-500">None indicated</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600">No patients loaded.</p>
        )}
      </Card>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card padding="p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">Top high-risk patients</h3>
          </div>
          <p className="mb-3 text-xs text-slate-500">Overall fusion level High risk or Critical</p>
          <ul className="space-y-2">
            {ward.topHighRiskPatients.length === 0 ? (
              <li className="text-sm text-slate-600">No patients in high/critical overall band.</li>
            ) : (
              ward.topHighRiskPatients.map((p) => (
                <li
                  key={p.patientId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-slate-900">{p.patientName}</span>
                  <Badge variant={levelVariant(p.overallLevel)}>{DECISION_LEVEL_LABELS[p.overallLevel]}</Badge>
                  <span className="w-full text-xs text-slate-600 sm:w-auto">Rm {p.room} · {p.overallScore}/100</span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card padding="p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-5 w-5 text-amber-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">Predicted deterioration</h3>
          </div>
          <p className="mb-3 text-xs text-slate-500">Multi-axis warning pattern or critical vitals snapshot</p>
          <ul className="space-y-2">
            {ward.predictedDeterioration.length === 0 ? (
              <li className="text-sm text-slate-600">No multi-factor deterioration pattern flagged.</li>
            ) : (
              ward.predictedDeterioration.map((p) => (
                <li key={p.patientId} className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                  <span className="font-semibold">{p.patientName}</span>
                  <span className="text-xs text-amber-900"> · Rm {p.room}</span>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card padding="p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-slate-700" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">Missed care loops</h3>
          </div>
          <ul className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
            {ward.missedCareLoops.length === 0 ? (
              <li className="text-sm text-slate-600">No consolidated misses on this snapshot.</li>
            ) : (
              ward.missedCareLoops.map((m) => (
                <li key={m.patientId} className="rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2">
                  <p className="font-semibold text-slate-900">{m.patientName}</p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">
                    {m.items.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card padding="p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">Recommended nursing actions</h3>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-800">
            {ward.recommendedNursingActions.length === 0 ? (
              <li className="list-none pl-0 text-slate-600">No consolidated nursing actions.</li>
            ) : (
              ward.recommendedNursingActions.map((a, i) => <li key={i}>{a}</li>)
            )}
          </ul>
        </Card>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Card padding="p-4 sm:p-5" className="lg:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-violet-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">Doctor review queue</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {ward.doctorReviewQueue.length === 0 ? (
              <p className="text-sm text-slate-600">Queue clear on fused snapshot.</p>
            ) : (
              ward.doctorReviewQueue.map((r, idx) => (
                <div key={r.id || `${r.patientId}-${idx}`} className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs">
                  <p className="font-semibold text-slate-900">{r.patientName}</p>
                  <p className="mt-0.5 text-violet-900">{r.triggerReason}</p>
                  <p className="mt-1 text-slate-600">
                    {r.severityLevel} · {r.bucket?.replace(/_/g, ' ')}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card padding="p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-rose-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">Family update suggestions</h3>
          </div>
          <ul className="space-y-2 text-xs text-slate-700">
            {ward.familyUpdateSuggestions.length === 0 ? (
              <li>No simulation drafts.</li>
            ) : (
              ward.familyUpdateSuggestions.map((f) => (
                <li key={f.patientId} className="rounded-lg border border-rose-100 bg-rose-50/50 px-2 py-2">
                  <span className="font-semibold text-slate-900">{f.patientName}</span>
                  <p className="mt-1 leading-snug">{f.suggestion}</p>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      <Card padding="p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <Siren className="h-5 w-5 text-red-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Emergency escalation suggestions</h3>
        </div>
        <ul className="grid gap-2 lg:grid-cols-2">
          {ward.emergencyEscalationSuggestions.length === 0 ? (
            <li className="text-sm text-slate-600">No active emergency records requiring escalation language.</li>
          ) : (
            ward.emergencyEscalationSuggestions.map((e) => (
              <li key={`${e.patientId}-${e.detail.slice(0, 24)}`} className="rounded-xl border border-red-100 bg-red-50/70 px-3 py-2 text-sm text-red-950">
                <span className="font-semibold">{e.patientName}</span>
                <p className="mt-1 text-xs leading-relaxed">{e.detail}</p>
              </li>
            ))
          )}
        </ul>
      </Card>

      <p className="mt-6 text-center text-[11px] text-slate-500">
        Intelligence engine:{' '}
        {(ward.snapshotMeta.dataSources || BRAIN_DATA_SOURCES).map((s) => s.label).join(' · ')}. Snapshot{' '}
        {new Date(ward.generatedAt).toLocaleString()}
      </p>
    </div>
  )
}
