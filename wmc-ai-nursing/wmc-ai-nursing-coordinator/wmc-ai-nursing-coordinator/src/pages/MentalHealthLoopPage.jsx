import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  Brain,
  ClipboardPlus,
  HeartHandshake,
  Smile,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import {
  appendMentalHealthNote,
  bumpMentalHealthScore,
  upsertMentalHealthPatient,
} from '../db/mentalHealthLoopStorage.js'
import {
  buildMentalHealthLoopAiAlerts,
  formatMentalHealthTime,
  listMentalHealthLoopRows,
  mentalHealthLoopAiSummary,
  mentalHealthScoreTotalsDisplay,
  nextMentalHealthDueIso,
} from '../lib/mentalHealthLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`

const COLS = [
  { key: 'due_now', title: 'Due now', sub: 'Round / overdue', badge: 'warning' },
  { key: 'agitated_patients', title: 'Agitated', sub: 'Elevated agitation', badge: 'danger' },
  { key: 'confusion_delirium_risk', title: 'Confusion / delirium', sub: 'Cognition / wandering', badge: 'danger' },
  { key: 'depression_concern', title: 'Depression concern', sub: 'Mood / withdrawal', badge: 'warning' },
  { key: 'sleep_disturbance', title: 'Sleep disturbance', sub: 'Rest fragmentation', badge: 'warning' },
  { key: 'doctor_counsellor_review_needed', title: 'MD / counsellor', sub: 'Escalated', badge: 'danger' },
]

function BucketBadge({ bucket }) {
  const map = {
    due_now: { label: 'Due', v: 'warning' },
    agitated_patients: { label: 'Agitated', v: 'danger' },
    confusion_delirium_risk: { label: 'Delirium risk', v: 'danger' },
    depression_concern: { label: 'Depression', v: 'warning' },
    sleep_disturbance: { label: 'Sleep', v: 'warning' },
    doctor_counsellor_review_needed: { label: 'Escalated', v: 'danger' },
  }
  const x = map[bucket] || { label: bucket, v: 'info' }
  return <Badge variant={x.v}>{x.label}</Badge>
}

function familyMentalDraft(row) {
  return `${row.patientName}: Today appeared ${String(row.moodStatus || '').toLowerCase()} with ${String(row.sleepQuality || '').toLowerCase()} sleep reported. Staff offered reassurance and structured activities. Simulation-only draft — confirm before messaging family.`
}

function MentalHealthCard({
  row,
  onMoodCheck,
  onNote,
  onEscalateDoctor,
  onEscalateCounsellor,
  onFamily,
  onStable,
}) {
  return (
    <Card className="border-slate-100 shadow-sm" padding="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.room}</span>
            {row.escalatedDoctor ? (
              <Badge variant="danger" className="ml-2">
                MD
              </Badge>
            ) : null}
            {row.escalatedCounsellor ? (
              <Badge variant="warning" className="ml-2">
                Counsellor
              </Badge>
            ) : null}
          </p>
        </div>
        <BucketBadge bucket={row.bucket} />
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Mood</dt>
          <dd className="font-medium">{row.moodStatus}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Anxiety</dt>
          <dd>
            <Badge variant={/severe|moderate/i.test(row.anxietyLevel) ? 'danger' : row.anxietyLevel === 'Mild' ? 'warning' : 'success'}>
              {row.anxietyLevel}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Sleep</dt>
          <dd>{row.sleepQuality}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Appetite Δ</dt>
          <dd>{row.appetiteChange}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Confusion</dt>
          <dd>
            <Badge variant={/severe|moderate/i.test(row.confusionLevel) ? 'danger' : row.confusionLevel === 'Mild' ? 'warning' : 'success'}>
              {row.confusionLevel}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Agitation</dt>
          <dd>
            <Badge variant={/severe|moderate/i.test(row.agitationLevel) ? 'danger' : 'success'}>{row.agitationLevel}</Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Social</dt>
          <dd className="max-w-[58%] text-right">{row.socialInteraction}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Hallucination / delusion</dt>
          <dd>{row.hallucinationDelusionObs}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Wandering</dt>
          <dd>{row.wanderingBehavior}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Self-harm obs.</dt>
          <dd>
            <Badge variant={/high|moderate/i.test(row.selfHarmRiskObs) ? 'danger' : row.selfHarmRiskObs === 'Low' ? 'warning' : 'success'}>
              {row.selfHarmRiskObs}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Nurse</dt>
          <dd>{row.nurseAssigned}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Last check</dt>
          <dd>{formatMentalHealthTime(row.lastMentalHealthCheckAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Next due</dt>
          <dd className="font-semibold text-slate-900">{formatMentalHealthTime(row.nextDueAt)}</dd>
        </div>
      </dl>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" className={btnPrimary} onClick={() => onMoodCheck(row)}>
          Record mood check
        </button>
        <button type="button" className={btnMuted} onClick={() => onNote(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <ClipboardPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Behavioral note
          </span>
        </button>
        <button type="button" className={btnDanger} onClick={() => onEscalateDoctor(row)}>
          Escalate to doctor
        </button>
        <button type="button" className={btnWarn} onClick={() => onEscalateCounsellor(row)}>
          Escalate to counsellor
        </button>
        <button type="button" className={btnMuted} onClick={() => onFamily(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <HeartHandshake className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Family update
          </span>
        </button>
        <button type="button" className={`${btnMuted} border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`} onClick={() => onStable(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <Smile className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Mark as stable
          </span>
        </button>
      </div>
    </Card>
  )
}

export default function MentalHealthLoopPage() {
  const { patients } = usePatients()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [mobileCol, setMobileCol] = useState('due_now')

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 45 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-mental-health-loop-updated', bump)
    return () => window.removeEventListener('wmc-mental-health-loop-updated', bump)
  }, [])

  const rows = useMemo(() => listMentalHealthLoopRows(patients, Date.now()), [patients, tick])

  const alerts = useMemo(() => buildMentalHealthLoopAiAlerts(rows), [rows])

  const summary = useMemo(() => mentalHealthLoopAiSummary(rows), [rows, tick])

  const scores = useMemo(() => mentalHealthScoreTotalsDisplay(), [tick])

  const buckets = useMemo(() => {
    const base = {
      due_now: [],
      agitated_patients: [],
      confusion_delirium_risk: [],
      depression_concern: [],
      sleep_disturbance: [],
      doctor_counsellor_review_needed: [],
    }
    for (const r of rows) {
      base[r.bucket]?.push(r)
    }
    return base
  }, [rows])

  function showToast(msg, tone = 'info') {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  function handleMoodCheck(row) {
    const raw = window.prompt(
      `Mood, Anxiety, Sleep (comma) — ${row.patientName}\nExamples: Neutral, Mild, Fair`,
      `${row.moodStatus},${row.anxietyLevel},${row.sleepQuality}`,
    )
    if (raw === null) return
    const p = String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (p.length < 3) {
      showToast('Enter three values: mood, anxiety, sleep.', 'warn')
      return
    }
    const ts = Date.now()
    bumpMentalHealthScore('monitor', 1)
    if (/severe|moderate/i.test(p[1]) || /poor|minimal/i.test(p[2])) {
      bumpMentalHealthScore('moderateRisk', 1)
    }
    upsertMentalHealthPatient(row.patientId, {
      moodStatus: p[0],
      anxietyLevel: p[1],
      sleepQuality: p[2],
      lastMentalHealthCheckAt: new Date(ts).toISOString(),
      nextDueAt: nextMentalHealthDueIso(ts),
    })
    showToast('Mood check saved.', 'success')
  }

  function handleNote(row) {
    const text = window.prompt(`Behavioral note — ${row.patientName}`, '')
    if (text === null) return
    appendMentalHealthNote(row.patientId, text)
    if (text.trim()) showToast('Note saved.')
  }

  function handleEscalateDoctor(row) {
    bumpMentalHealthScore('urgentReview', 2)
    bumpMentalHealthScore('highRisk', 1)
    upsertMentalHealthPatient(row.patientId, { escalatedDoctor: true })
    showToast('Escalated to physician (simulation).', 'warn')
  }

  function handleEscalateCounsellor(row) {
    bumpMentalHealthScore('monitor', 1)
    bumpMentalHealthScore('moderateRisk', 1)
    upsertMentalHealthPatient(row.patientId, { escalatedCounsellor: true })
    showToast('Counsellor escalation flagged (simulation).', 'warn')
  }

  async function handleFamily(row) {
    const t = familyMentalDraft(row)
    try {
      await navigator.clipboard.writeText(t)
      showToast('Family update copied.', 'success')
    } catch {
      showToast(t.slice(0, 200) + '…', 'info')
    }
  }

  function handleStable(row) {
    bumpMentalHealthScore('stable', 2)
    upsertMentalHealthPatient(row.patientId, {
      escalatedDoctor: false,
      escalatedCounsellor: false,
      moodStatus: 'Neutral',
      agitationLevel: 'None',
      confusionLevel: 'None',
      anxietyLevel: 'Mild',
    })
    showToast('Marked stable — escalation flags cleared (sim).', 'success')
  }

  return (
    <div className="mx-auto max-w-[1800px] pb-8">
      <PageHeader
        title="Mental health loop"
        description="Simulated behavioral health surveillance with escalation pathways and family messaging drafts. Demo only — not a psychiatric assessment."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Simulation mode</Badge>
            <Link
              to="/family-updates"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Family updates
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="relative overflow-hidden p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-violet-400 to-purple-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <HeartHandshake className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Emotional support</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.emotionalSupportCount}</p>
              <p className="text-xs text-slate-600">Low mood / withdrawn</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-orange-400 to-rose-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Behavioral changes</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.behavioralChangeCount}</p>
              <p className="text-xs text-slate-600">Agitation / confusion cluster</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden p-4 sm:col-span-2 xl:col-span-1">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-sky-400 to-indigo-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-sky-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sleep / mood trend</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.sleepMoodTrendSummary}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-3" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ClipboardPlus className="h-5 w-5 text-slate-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Nurse action checklist</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary.nurseActionChecklist}</p>
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card padding="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">Counsellor review recommendation</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary.counsellorReviewRecommendation}</p>
        </Card>
        <Card padding="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900">Family communication suggestion</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary.familyCommunicationSuggestion}</p>
        </Card>
      </div>

      <Card className="mt-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Mental health scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Simulation tally · includes demo baseline</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Stable', val: scores.stable },
            { label: 'Monitor', val: scores.monitor },
            { label: 'Moderate risk', val: scores.moderateRisk },
            { label: 'High risk', val: scores.highRisk },
            { label: 'Urgent review', val: scores.urgentReview },
          ].map((x) => (
            <div key={x.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{x.label}</dt>
              <dd className="text-xl font-bold tabular-nums text-slate-900">{x.val}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mt-4" padding="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-600" aria-hidden />
          <div>
            <h3 className="text-base font-semibold text-slate-900">AI alerts</h3>
            <p className="text-sm text-slate-500">Confusion · agitation · mood · sleep · wandering · delirium · safety · MD</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No mental health alerts on current roster snapshot.
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

      <div className="mt-6 xl:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mental health board</p>
        <div className="flex gap-1 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
          {COLS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`shrink-0 rounded-full px-2 py-2 text-[10px] font-semibold ring-1 ring-inset transition-colors sm:px-2.5 sm:text-[11px] ${
                mobileCol === c.key ? 'bg-teal-600 text-white ring-teal-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
              onClick={() => setMobileCol(c.key)}
            >
              <span className="hidden min-[480px]:inline">{c.title}</span>
              <span className="min-[480px]:hidden">{c.title.split(' ')[0]}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {buckets[mobileCol].map((row) => (
            <MentalHealthCard
              key={row.patientId}
              row={row}
              onMoodCheck={handleMoodCheck}
              onNote={handleNote}
              onEscalateDoctor={handleEscalateDoctor}
              onEscalateCounsellor={handleEscalateCounsellor}
              onFamily={handleFamily}
              onStable={handleStable}
            />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No patients in this column.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 hidden gap-2 xl:grid xl:grid-cols-6">
        {COLS.map((col) => (
          <div key={col.key} className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-2 py-2.5">
              <div className="flex items-center justify-between gap-1">
                <h3 className="text-[10px] font-bold leading-tight text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key].length}</Badge>
              </div>
              <p className="mt-0.5 text-[9px] text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-14rem)] min-h-[200px] space-y-3 overflow-y-auto overscroll-contain p-2">
              {buckets[col.key].map((row) => (
                <MentalHealthCard
                  key={row.patientId}
                  row={row}
                  onMoodCheck={handleMoodCheck}
                  onNote={handleNote}
                  onEscalateDoctor={handleEscalateDoctor}
                  onEscalateCounsellor={handleEscalateCounsellor}
                  onFamily={handleFamily}
                  onStable={handleStable}
                />
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
