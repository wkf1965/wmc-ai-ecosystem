import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BellRing,
  ClipboardPlus,
  Dumbbell,
  FileSpreadsheet,
  HeartHandshake,
  Sparkles,
  Stethoscope,
} from 'lucide-react'
import {
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
  appendRehabilitationNote,
  bumpRehabilitationScore,
  upsertRehabilitationPatient,
} from '../db/rehabLoopStorage.js'
import {
  buildAdlIndependenceWeeklyTrend,
  buildRecoveryPredictionSeries,
  buildRehabilitationLoopAiAlerts,
  buildRehabilitationReportCsv,
  buildWalkingDistanceWeeklyTrend,
  buildWeeklyTherapyMinutesSeries,
  formatRehabTime,
  listRehabilitationLoopRows,
  nextRehabSessionIso,
  rehabTypeDisplayLabel,
  rehabilitationLoopAiSummary,
  rehabilitationScoreTotalsDisplay,
} from '../lib/rehabLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnSuccess = `${btn} border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`

/** Simulation clock — deterministic per tick (no Date.now() during render). */
const SIM_CLOCK_ORIGIN_MS = Date.UTC(2025, 0, 1, 8, 0, 0)
const SIM_MS_PER_TICK = 45000

function isoDateLocal(ms) {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const COLS = [
  { key: 'session_due_now', title: 'Session due now', sub: 'Therapy window', badge: 'warning' },
  { key: 'completed_sessions', title: 'Completed sessions', sub: 'Logged today', badge: 'success' },
  { key: 'missed_rehab', title: 'Missed rehab', sub: 'No-show / overdue', badge: 'danger' },
  { key: 'declining_progress', title: 'Declining progress', sub: 'Trend / plateau', badge: 'danger' },
  { key: 'high_recovery_potential', title: 'High recovery potential', sub: 'Strong responders', badge: 'teal' },
]

function BucketBadge({ bucket }) {
  const map = {
    session_due_now: { label: 'Due now', v: 'warning' },
    completed_sessions: { label: 'Completed', v: 'success' },
    missed_rehab: { label: 'Missed', v: 'danger' },
    declining_progress: { label: 'Declining', v: 'danger' },
    high_recovery_potential: { label: 'High potential', v: 'success' },
  }
  const x = map[bucket] || { label: bucket, v: 'info' }
  return <Badge variant={x.v}>{x.label}</Badge>
}

function familyRehabDraft(row) {
  return `${row.patientName} worked with therapy on ${rehabTypeDisplayLabel(row.rehabType)} (${row.therapyMinutesLastSession} min). Focus areas: mobility, safety, and comfort. Pain reported ${row.painScore}/10; therapist adjusting pacing. This is a simulation draft — confirm details before sending to family.`
}

function RehabilitationCard({ row, selected, onSelect }) {
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
            Rm <span className="font-semibold">{row.room}</span>
            {row.escalatedDoctorReview ? (
              <Badge variant="danger" className="ml-2">
                MD review
              </Badge>
            ) : null}
          </p>
        </div>
        <BucketBadge bucket={row.bucket} />
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 shrink-0">Diagnosis</dt>
          <dd className="max-w-[65%] text-right leading-snug">{row.diagnosis}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Rehab type</dt>
          <dd className="font-semibold">{rehabTypeDisplayLabel(row.rehabType)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Therapy minutes</dt>
          <dd>{row.therapyMinutesLastSession} min</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Walking</dt>
          <dd>{row.walkingDistanceM} m</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Transfer</dt>
          <dd>{row.transferAbility}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Balance</dt>
          <dd>{row.balanceScore}/10</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Strength</dt>
          <dd>{row.muscleStrength}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Pain</dt>
          <dd>
            <Badge variant={row.painScore >= 7 ? 'danger' : row.painScore >= 4 ? 'warning' : 'success'}>
              {row.painScore}/10
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">ADL independence</dt>
          <dd>{row.adlIndependence}/100</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Speech progress</dt>
          <dd>{row.rehabType === 'speech_therapy' ? `${row.speechProgress}/100` : `${row.speechProgress}/100 · FYI`}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Therapist</dt>
          <dd>{row.therapistAssigned}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Next session</dt>
          <dd className="font-medium">{formatRehabTime(row.nextSessionDueAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Last session</dt>
          <dd>{formatRehabTime(row.lastSessionAt)}</dd>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          <Badge variant={row.progressTrend === 'improving' ? 'success' : row.progressTrend === 'declining' ? 'danger' : 'info'}>
            {row.progressTrend}
          </Badge>
          <Badge variant={row.recoveryPotential === 'high' ? 'success' : row.recoveryPotential === 'low' ? 'warning' : 'info'}>
            {row.recoveryPotential} potential
          </Badge>
        </div>
      </dl>
    </Card>
  )
}

export default function RehabilitationLoopPage() {
  const { patients } = usePatients()
  const { notes } = useNursingNotes()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [mobileCol, setMobileCol] = useState('session_due_now')
  const [selectedPid, setSelectedPid] = useState(null)

  const nowMs = SIM_CLOCK_ORIGIN_MS + tick * SIM_MS_PER_TICK
  const todayStr = useMemo(() => isoDateLocal(nowMs), [nowMs])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 45 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-rehabilitation-loop-updated', bump)
    return () => window.removeEventListener('wmc-rehabilitation-loop-updated', bump)
  }, [])

  const rows = useMemo(() => listRehabilitationLoopRows(patients, nowMs), [patients, nowMs])

  const weeklyTherapyMinutes = useMemo(() => buildWeeklyTherapyMinutesSeries(rows), [rows])
  const walkingTrend = useMemo(() => buildWalkingDistanceWeeklyTrend(rows), [rows])
  const adlTrend = useMemo(() => buildAdlIndependenceWeeklyTrend(rows), [rows])
  const recoveryPrediction = useMemo(() => buildRecoveryPredictionSeries(rows), [rows])

  const alerts = useMemo(() => buildRehabilitationLoopAiAlerts(rows, notes), [rows, notes])

  const summary = useMemo(() => rehabilitationLoopAiSummary(rows), [rows])

  const scores = rehabilitationScoreTotalsDisplay()

  const buckets = useMemo(() => {
    const base = {
      session_due_now: [],
      completed_sessions: [],
      missed_rehab: [],
      declining_progress: [],
      high_recovery_potential: [],
    }
    for (const r of rows) {
      base[r.bucket]?.push(r)
    }
    return base
  }, [rows])

  const selected = rows.find((r) => r.patientId === selectedPid) || null

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  function requireSelection() {
    if (!selected) {
      showToast('Select a patient card first.', 'warn')
      return null
    }
    return selected
  }

  function handleAddSession() {
    const row = requireSelection()
    if (!row) return
    const raw = window.prompt(`Therapy minutes — ${row.patientName}`, String(Math.max(15, row.therapyMinutesLastSession)))
    if (raw === null) return
    const mins = parseInt(String(raw).replace(/\D/g, ''), 10)
    if (!Number.isFinite(mins) || mins <= 0) {
      showToast('Enter positive minutes.', 'warn')
      return
    }
    const ts = Date.now()
    bumpRehabilitationScore('improving', 1)
    if (row.recoveryPotential === 'high') bumpRehabilitationScore('highRecoveryPotential', 1)
    upsertRehabilitationPatient(row.patientId, {
      therapyMinutesLastSession: mins,
      lastSessionAt: new Date(ts).toISOString(),
      lastSessionCompleted: true,
      lastSessionDay: todayStr,
      nextSessionDueAt: nextRehabSessionIso(ts),
      sessionsCompletedWeek: (row.sessionsCompletedWeek || 0) + 1,
      missedSessionsWeek: Math.max(0, (row.missedSessionsWeek || 0) - 1),
    })
    showToast(`Session logged (${mins} min).`, 'success')
  }

  function handleRecordProgress() {
    const row = requireSelection()
    if (!row) return
    const raw = window.prompt(
      `Balance 0-10, Pain 0-10, Walking meters — ${row.patientName}`,
      `${row.balanceScore},${row.painScore},${row.walkingDistanceM}`,
    )
    if (raw === null) return
    const p = String(raw).split(/[,\s]+/).filter(Boolean)
    const bal = parseInt(p[0], 10)
    const pain = parseInt(p[1], 10)
    const walk = parseInt(p[2], 10)
    if (!Number.isFinite(bal) || bal < 0 || bal > 10) {
      showToast('Balance must be 0–10.', 'warn')
      return
    }
    if (!Number.isFinite(pain) || pain < 0 || pain > 10) {
      showToast('Pain must be 0–10.', 'warn')
      return
    }
    if (!Number.isFinite(walk) || walk < 0) {
      showToast('Walking meters must be a positive number.', 'warn')
      return
    }
    bumpRehabilitationScore('stable', 1)
    let progressTrend = row.progressTrend
    if (bal > row.balanceScore && pain <= row.painScore) progressTrend = 'improving'
    if (pain > row.painScore && bal < row.balanceScore) progressTrend = 'declining'

    upsertRehabilitationPatient(row.patientId, {
      balanceScore: bal,
      painScore: pain,
      walkingDistanceM: walk,
      progressTrend,
    })
    showToast('Progress values saved.', 'success')
  }

  function handleNote() {
    const row = requireSelection()
    if (!row) return
    const text = window.prompt(`Therapist note — ${row.patientName}`, '')
    if (text === null) return
    appendRehabilitationNote(row.patientId, text)
    if (text.trim()) showToast('Note saved.')
  }

  function handleEscalate() {
    const row = requireSelection()
    if (!row) return
    bumpRehabilitationScore('declining', 2)
    bumpRehabilitationScore('doctorReviewNeeded', 1)
    upsertRehabilitationPatient(row.patientId, { escalatedDoctorReview: true })
    showToast('Escalated for physician review (simulation).', 'warn')
  }

  async function copyText(label, text) {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`${label} copied to clipboard.`, 'success')
    } catch {
      showToast(text.slice(0, 200) + '…', 'info')
    }
  }

  function handleGenerateReport() {
    const csv = buildRehabilitationReportCsv(rows.map((r) => ({ ...r })))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rehabilitation-loop-${isoDateLocal(Date.now())}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Rehab report CSV exported.')
  }

  function handleFamilyUpdate() {
    const row = requireSelection()
    if (!row) return
    copyText('Family update', familyRehabDraft(row))
  }

  return (
    <div className="mx-auto max-w-[1680px] pb-8">
      <PageHeader
        title="Rehabilitation Loop"
        description="Simulated therapy surveillance with discipline-specific cues, missed-session workflow, aggregate charts, and AI-style summaries. Demo only."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Simulation mode</Badge>
            <Link
              to="/rehab-tracking"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Rehabilitation Tracking
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

      <Card className="mb-4" padding="p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={handleAddSession} disabled={!selected}>
            Add rehab session
          </button>
          <button type="button" className={btnMuted} onClick={handleRecordProgress} disabled={!selected}>
            Record progress
          </button>
          <button type="button" className={btnMuted} onClick={handleNote} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <ClipboardPlus className="h-4 w-4 shrink-0" aria-hidden />
              Add therapist note
            </span>
          </button>
          <button type="button" className={btnWarn} onClick={handleEscalate} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <Stethoscope className="h-4 w-4 shrink-0" aria-hidden />
              Escalate doctor review
            </span>
          </button>
          <button type="button" className={btnSuccess} onClick={handleGenerateReport}>
            <span className="inline-flex items-center gap-1">
              <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
              Generate rehab report
            </span>
          </button>
          <button type="button" className={btnMuted} onClick={handleFamilyUpdate} disabled={!selected}>
            <span className="inline-flex items-center gap-1">
              <HeartHandshake className="h-4 w-4 shrink-0" aria-hidden />
              Generate family update
            </span>
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Select a resident card on the board, then log sessions or notes. CSV roster export uses Generate rehab report; pick a patient for Generate family update (clipboard).
        </p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="relative overflow-hidden" padding="p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">Weekly therapy minutes</h3>
          </div>
          <p className="mb-2 text-xs text-slate-500">Simulated eight-week roster average</p>
          <div className="h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minHeight={220}>
              <LineChart data={weeklyTherapyMinutes} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 11 }} width={40} stroke="#64748b" />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v) => [`${v} min`, 'Therapy']} />
                <Line type="monotone" dataKey="minutes" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} name="Minutes" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="relative overflow-hidden" padding="p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-5 w-5 text-sky-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">Walking distance trend</h3>
          </div>
          <p className="mb-2 text-xs text-slate-500">Simulated meters · roster average</p>
          <div className="h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minHeight={220}>
              <LineChart data={walkingTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 11 }} width={40} stroke="#64748b" />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v) => [`${v} m`, 'Walking']} />
                <Line type="monotone" dataKey="meters" stroke="#0369a1" strokeWidth={2} dot={{ r: 3 }} name="Meters" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="relative overflow-hidden" padding="p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">ADL independence trend</h3>
          </div>
          <p className="mb-2 text-xs text-slate-500">Index 0–100 · roster average</p>
          <div className="h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minHeight={220}>
              <LineChart data={adlTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={36} stroke="#64748b" />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v) => [`${v}`, 'ADL']} />
                <Line type="monotone" dataKey="adl" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} name="ADL" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="relative overflow-hidden" padding="p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">AI recovery prediction</h3>
          </div>
          <p className="mb-2 text-xs text-slate-500">Functional score projection — illustrative only</p>
          <div className="h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minHeight={220}>
              <LineChart data={recoveryPrediction} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#64748b" interval={0} angle={-16} textAnchor="end" height={48} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={36} stroke="#64748b" />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="functional" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Observed avg" />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={{ r: 3 }}
                  connectNulls
                  name="AI projection"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 mb-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {[
          ['Functional improvement', summary.functionalImprovement],
          ['Rehab focus recommendation', summary.rehabFocusRecommendation],
          ['Therapist action checklist', summary.therapistActionChecklist],
          ['Family encouragement suggestion', summary.familyEncouragementSuggestion],
          ['Doctor review recommendation', summary.doctorReviewRecommendation],
        ].map(([title, body]) => (
          <Card key={title} padding="p-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Dumbbell className="h-4 w-4 text-slate-500" aria-hidden />
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            </div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">{body}</pre>
          </Card>
        ))}
      </div>

      <Card className="mb-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Rehab scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Simulation tally · includes demo baseline</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: 'Improving', val: scores.improving },
            { label: 'Stable', val: scores.stable },
            { label: 'Declining', val: scores.declining },
            { label: 'High recovery potential', val: scores.highRecoveryPotential },
            { label: 'Doctor review needed', val: scores.doctorReviewNeeded },
          ].map((x) => (
            <div key={x.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{x.label}</dt>
              <dd className="text-xl font-bold tabular-nums text-slate-900">{x.val}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mb-8" padding="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-600" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-slate-900">AI alerts</h3>
            <p className="text-sm text-slate-500">
              Declining mobility · Fall risk · Pain · Plateau · Missed session · Cognition · Doctor review
            </p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No rehabilitation alerts on current roster snapshot.
          </p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-sm">
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    a.severity === 'critical' ? 'text-red-600' : a.severity === 'high' ? 'text-orange-600' : 'text-amber-600'
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

      <div className="xl:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Rehabilitation board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`shrink-0 rounded-full px-2.5 py-2 text-[11px] font-semibold ring-1 ring-inset transition-colors ${
                mobileCol === c.key ? 'bg-teal-600 text-white ring-teal-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
              onClick={() => setMobileCol(c.key)}
            >
              <span className="hidden min-[420px]:inline">{c.title}</span>
              <span className="min-[420px]:hidden">{c.title.split(' ')[0]}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3 pb-8">
          {buckets[mobileCol].map((row) => (
            <RehabilitationCard key={row.patientId} row={row} selected={selectedPid === row.patientId} onSelect={setSelectedPid} />
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
          <div key={col.key} className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold leading-tight text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key].length}</Badge>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-14rem)] min-h-[200px] space-y-3 overflow-y-auto overscroll-contain p-2">
              {buckets[col.key].map((row) => (
                <RehabilitationCard key={row.patientId} row={row} selected={selectedPid === row.patientId} onSelect={setSelectedPid} />
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
