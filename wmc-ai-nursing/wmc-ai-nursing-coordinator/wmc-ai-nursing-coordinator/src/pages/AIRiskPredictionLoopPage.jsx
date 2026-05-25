import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  BrainCircuit,
  Download,
  FileText,
  HeartHandshake,
  Minus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserCheck,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import {
  aiRiskPredictionScoreTotalsDisplay,
  bumpAiRiskPredictionScore,
  mergeAiRiskPredictionInstances,
  upsertAiRiskPredictionInstance,
  getAiRiskPredictionInstancesObject,
} from '../db/aiRiskPredictionLoopStorage.js'
import {
  PREDICTION_RISK_LABELS,
  buildDailyPredictionChangeBars,
  buildPredictionAiAlerts,
  buildRiskHeatmapMatrix,
  buildWardRiskTrendChart,
  exportPredictionReportCsv,
  listPredictionRows,
  predictionAiSummaryBlocks,
  predictionBoardBucket,
  predictionMasterAiSummary,
} from '../lib/aiRiskPredictionLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`
const btnSuccess = `${btn} border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`

const COLS = [
  { key: 'high_risk_patients', title: 'High-risk patients', sub: 'Elevated composite score', badge: 'danger' },
  { key: 'worsening_trends', title: 'Worsening trends', sub: 'Trajectory concern', badge: 'warning' },
  { key: 'immediate_action_needed', title: 'Immediate action', sub: 'Critical / emergency band', badge: 'danger' },
  { key: 'stable_patients', title: 'Stable patients', sub: 'Lower acuity snapshot', badge: 'success' },
  {
    key: 'escalation_recommendations',
    title: 'Escalation recommendations',
    sub: 'Supervisor / MD routing',
    badge: 'info',
  },
]

function severityBadgeVariant(sev) {
  if (sev === 'emergency') return 'danger'
  if (sev === 'critical') return 'danger'
  if (sev === 'high') return 'warning'
  if (sev === 'moderate') return 'info'
  return 'success'
}

function trendIcon(trend) {
  if (trend === 'worsening') return <ArrowUpRight className="h-4 w-4 text-rose-600" aria-hidden />
  if (trend === 'improving') return <ArrowDownRight className="h-4 w-4 text-emerald-600" aria-hidden />
  return <Minus className="h-4 w-4 text-slate-400" aria-hidden />
}

function PredictionCard({ row, selected, onSelect }) {
  const bucket = row.boardBucket ?? predictionBoardBucket(row)
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row.patientId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(row.patientId)
        }
      }}
      className={`cursor-pointer border shadow-sm transition-shadow ${selected ? 'ring-2 ring-teal-500 ring-offset-2' : 'border-slate-100'}`}
      padding="p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.roomNumber}</span>
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Badge variant={severityBadgeVariant(row.severityLevel)}>{row.severityLevel}</Badge>
          <Badge variant="info">{bucket.replace(/_/g, ' ')}</Badge>
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Predicted risk</dt>
          <dd className="max-w-[58%] text-right font-semibold text-slate-900">{row.predictedRisk}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Risk score</dt>
          <dd className="tabular-nums font-bold text-slate-900">{row.riskScore}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Trend</dt>
          <dd className="flex items-center gap-1 capitalize">
            {trendIcon(row.trend)}
            {row.trend}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">AI confidence</dt>
          <dd className="tabular-nums">{Math.round((row.aiConfidence ?? 0) * 100)}%</dd>
        </div>
        <div className="rounded-lg bg-teal-50/80 px-2 py-1.5 text-[11px] text-teal-950">
          <p className="font-semibold text-teal-800">Suggested action</p>
          <p className="mt-0.5 leading-snug">{row.suggestedAction}</p>
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <dt className="text-slate-500">Generated</dt>
          <dd className="text-[10px] text-slate-600">
            {row.timeGenerated ? new Date(row.timeGenerated).toLocaleString() : '—'}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          {row.escalatedToDoctor ? (
            <Badge variant="danger">MD escalated</Badge>
          ) : null}
          {row.supervisorNotified ? (
            <Badge variant="warning">Supervisor</Badge>
          ) : null}
          {row.reviewedAt ? (
            <Badge variant="success">Reviewed</Badge>
          ) : null}
        </div>
      </dl>
    </Card>
  )
}

function heatColor(v) {
  if (v >= 75) return 'bg-rose-500'
  if (v >= 55) return 'bg-orange-400'
  if (v >= 35) return 'bg-amber-300'
  if (v >= 18) return 'bg-teal-300'
  return 'bg-slate-200'
}

export default function AIRiskPredictionLoopPage() {
  const { patients } = usePatients()
  const { notes } = useNursingNotes()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [selectedPid, setSelectedPid] = useState(null)
  const [mobileCol, setMobileCol] = useState('high_risk_patients')

  const rawMap = useMemo(() => {
    mergeAiRiskPredictionInstances(patients, notes)
    return getAiRiskPredictionInstancesObject()
  }, [patients, notes, tick])

  const rows = useMemo(() => listPredictionRows(rawMap), [rawMap])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-ai-risk-prediction-loop-updated', bump)
    return () => window.removeEventListener('wmc-ai-risk-prediction-loop-updated', bump)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 120 * 1000)
    return () => window.clearInterval(id)
  }, [])

  const alerts = useMemo(() => buildPredictionAiAlerts(rows), [rows])
  const scores = useMemo(() => aiRiskPredictionScoreTotalsDisplay(), [tick])
  const masterAi = useMemo(() => predictionMasterAiSummary(rows), [rows])
  const summaryBlocks = useMemo(() => predictionAiSummaryBlocks(rows), [rows])
  const trendChart = useMemo(() => buildWardRiskTrendChart(rows), [rows])
  const dailyBars = useMemo(() => buildDailyPredictionChangeBars(rows), [rows])
  const heatmap = useMemo(() => buildRiskHeatmapMatrix(rows, 12), [rows])

  const buckets = useMemo(() => {
    return {
      high_risk_patients: rows.filter((r) => r.boardBucket === 'high_risk_patients'),
      worsening_trends: rows.filter((r) => r.boardBucket === 'worsening_trends'),
      immediate_action_needed: rows.filter((r) => r.boardBucket === 'immediate_action_needed'),
      stable_patients: rows.filter((r) => r.boardBucket === 'stable_patients'),
      escalation_recommendations: rows.filter((r) => r.boardBucket === 'escalation_recommendations'),
    }
  }, [rows])

  const selected = rows.find((r) => r.patientId === selectedPid) || null

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2800)
  }

  function requireSelection() {
    if (!selected) {
      showToast('Select a patient card first.', 'warn')
      return null
    }
    return selected
  }

  function handleGeneratePrediction() {
    mergeAiRiskPredictionInstances(patients, notes)
    const fields = ['lowRisk', 'moderateRisk', 'highRisk', 'critical', 'emergencyEscalation']
    bumpAiRiskPredictionScore(fields[Math.floor(Math.random() * fields.length)], 1)
    showToast('AI prediction pass completed.', 'success')
  }

  function handleEscalateDoctor() {
    const row = requireSelection()
    if (!row) return
    upsertAiRiskPredictionInstance(row.patientId, { escalatedToDoctor: true })
    bumpAiRiskPredictionScore('critical', 1)
    showToast('Escalated to doctor.', 'warn')
  }

  function handleNotifySupervisor() {
    const row = requireSelection()
    if (!row) return
    upsertAiRiskPredictionInstance(row.patientId, { supervisorNotified: true })
    bumpAiRiskPredictionScore('highRisk', 1)
    showToast('Supervisor notification logged.', 'success')
  }

  function handleFamilyUpdate() {
    const row = requireSelection()
    if (!row) return
    const draft = `${row.patientName} (Rm ${row.roomNumber}): care team monitoring ${row.predictedRisk.toLowerCase()} pattern (score ${row.riskScore}, trend ${row.trend}). Interventions in progress per nursing protocol. Please verify before sending to family.`
    showToast(`Family update draft: ${draft}`, 'info')
  }

  function handleMarkReviewed() {
    const row = requireSelection()
    if (!row) return
    upsertAiRiskPredictionInstance(row.patientId, { reviewedAt: new Date().toISOString() })
    bumpAiRiskPredictionScore('lowRisk', 1)
    showToast('Marked reviewed.', 'success')
  }

  function formatDayFile() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function handleExport() {
    const csv = exportPredictionReportCsv(rows, new Date().toISOString())
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-risk-prediction-loop-${formatDayFile()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Prediction report exported.', 'success')
  }

  const selectedTrend =
    selected?.historyScores?.map((h) => ({ day: h.day.slice(5), score: h.score })) ?? []

  return (
    <div className="mx-auto max-w-[1600px] pb-8">
      <PageHeader
        title="AI Risk Prediction Loop"
        description="Continuous local fusion of nursing notes, vitals, and care-loop telemetry into risk forecasts — not a regulated medical device."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Local mode</Badge>
            <Link
              to="/ai-risk"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              AI Risk Detection
            </Link>
          </div>
        }
      />

      {toast ? (
        <div
          role="status"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
            toast.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : toast.tone === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      <Card className="mb-3" padding="p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={handleGeneratePrediction}>
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
              Generate AI prediction
            </span>
          </button>
          <button type="button" className={btnDanger} onClick={handleEscalateDoctor} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Stethoscope className="h-4 w-4 shrink-0" aria-hidden />
              Escalate to doctor
            </span>
          </button>
          <button type="button" className={btnWarn} onClick={handleNotifySupervisor} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
              Notify supervisor
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleFamilyUpdate} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <HeartHandshake className="h-4 w-4 shrink-0" aria-hidden />
              Generate family update
            </span>
          </button>
          <button type="button" className={btnSuccess} onClick={handleMarkReviewed} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <UserCheck className="h-4 w-4 shrink-0" aria-hidden />
              Mark reviewed
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleExport}>
            <span className="inline-flex items-center gap-1">
              <Download className="h-4 w-4 shrink-0" aria-hidden />
              Export prediction report
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Signals analyzed across nursing notes, vitals, medications, sleep, hydration, nutrition, mobility, mental
          health, falls, wounds, and rehabilitation — refreshed with roster changes and on a gentle timer.
        </p>
      </Card>

      <Card className="mb-3" padding="p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI summary</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">{masterAi}</p>
          </div>
        </div>
      </Card>

      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        {[
          ['Top high-risk patients', summaryBlocks.topHighRisk],
          ['Predicted deterioration trends', summaryBlocks.deteriorationTrends],
          ['Recommended preventive actions', summaryBlocks.preventiveActions],
          ['Nursing action checklist', summaryBlocks.nursingChecklist],
          ['Doctor review recommendation', summaryBlocks.doctorReview],
          ['Supervisor escalation summary', summaryBlocks.supervisorEscalation],
        ].map(([title, body]) => (
          <Card key={title} padding="p-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <FileText className="h-4 w-4 text-slate-500" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            </div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">{body}</pre>
          </Card>
        ))}
      </div>

      <Card className="mb-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Prediction scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Local tally · baseline + updates from loop actions</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Low risk', val: scores.lowRisk },
            { label: 'Moderate risk', val: scores.moderateRisk },
            { label: 'High risk', val: scores.highRisk },
            { label: 'Critical', val: scores.critical },
            { label: 'Emergency escalation', val: scores.emergencyEscalation },
          ].map((x) => (
            <div key={x.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{x.label}</dt>
              <dd className="text-xl font-bold tabular-nums text-slate-900">{x.val}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mb-4" padding="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-600" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-slate-900">AI alerts</h3>
            <p className="text-sm text-slate-500">
              Critical deterioration · hospitalization · fall window · dehydration · delirium · sepsis pattern
            </p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No priority alerts on current snapshot.
          </p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-sm">
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    a.severity === 'critical'
                      ? 'text-red-600'
                      : a.severity === 'high'
                        ? 'text-orange-600'
                        : 'text-amber-600'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{a.title}</p>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{a.category}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <Card padding="p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-900">Risk trend graph (ward average)</h3>
          <p className="text-xs text-slate-500">Historical points pooled across roster predictions</p>
          <div className="mt-3 min-h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={32} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="avgScore" name="Avg score" stroke="#0d9488" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-900">Daily prediction changes</h3>
          <p className="text-xs text-slate-500">Patients with score ↑ / ↓ versus prior day (threshold ±4)</p>
          <div className="mt-3 min-h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip />
                <Legend />
                <Bar dataKey="increased" name="Worsened" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="decreased" name="Improved" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="mb-8 overflow-x-auto" padding="p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-slate-900">Risk heatmap</h3>
        <p className="text-xs text-slate-500">Top patients by composite score × prediction dimensions</p>
        <div className="mt-3 min-w-[720px]">
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `112px repeat(${PREDICTION_RISK_LABELS.length}, minmax(28px,1fr))` }}
          >
            <div />
            {PREDICTION_RISK_LABELS.map((lab) => (
              <div
                key={lab}
                className="flex justify-center px-0.5 text-[9px] font-semibold uppercase leading-tight text-slate-500 [writing-mode:vertical-rl] rotate-180"
              >
                {lab.length > 14 ? `${lab.slice(0, 12)}…` : lab}
              </div>
            ))}
            {heatmap.map((row) => (
              <Fragment key={row.patientId}>
                <div className="truncate py-1 text-[11px] font-medium text-slate-800">{row.label}</div>
                {row.cells.map((c, i) => (
                  <div
                    key={`${row.patientId}-${i}`}
                    className={`flex h-8 items-center justify-center rounded ${heatColor(c.value)}`}
                    title={`${c.label}: ${c.value}`}
                  >
                    <span
                      className={`text-[10px] font-bold ${c.value >= 40 ? 'text-white' : 'text-slate-700'}`}
                    >
                      {c.value >= 22 ? c.value : ''}
                    </span>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-slate-200" /> Low
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-teal-300" /> Moderate
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-amber-300" /> Elevated
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-orange-400" /> High
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-rose-500" /> Critical
          </span>
        </div>
      </Card>

      {selected ? (
        <Card className="mb-8" padding="p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Selected: {selected.patientName} · risk trend graph
            </h3>
            <Badge variant={severityBadgeVariant(selected.severityLevel)}>{selected.predictedRisk}</Badge>
          </div>
          <div className="min-h-[220px] w-full max-w-3xl min-w-0">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={selectedTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={32} />
                <Tooltip />
                <Line type="monotone" dataKey="score" name="Score" stroke="#6366f1" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      <div className="xl:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">AI prediction board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-inset transition-colors ${
                mobileCol === c.key ? 'bg-teal-600 text-white ring-teal-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
              onClick={() => setMobileCol(c.key)}
            >
              <span className="line-clamp-2 max-w-[118px] text-left">{c.title}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3 pb-8">
          {buckets[mobileCol].map((row) => (
            <PredictionCard key={row.patientId} row={row} selected={selectedPid === row.patientId} onSelect={setSelectedPid} />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No patients in this column.
            </p>
          ) : null}
        </div>
      </div>

      <div className="hidden gap-3 xl:grid xl:grid-cols-5">
        {COLS.map((col) => (
          <div key={col.key} className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold leading-tight text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key].length}</Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-14rem)] min-h-[220px] space-y-3 overflow-y-auto overscroll-contain p-3">
              {buckets[col.key].map((row) => (
                <PredictionCard key={row.patientId} row={row} selected={selectedPid === row.patientId} onSelect={setSelectedPid} />
              ))}
              {buckets[col.key].length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">Empty</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
