import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  UtensilsCrossed,
  BellRing,
  CheckCircle2,
  ClipboardPlus,
  HeartHandshake,
  Sparkles,
  UserRoundX,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, Badge } from '../components/ui'
import { usePatients } from '../hooks/usePatients.js'
import { useNursingNotes } from '../hooks/useNursingNotes.js'
import {
  appendNutritionNote,
  bumpNutritionScore,
  upsertNutritionPatient,
} from '../db/nutritionLoopStorage.js'
import { listHydrationLoopRows } from '../lib/hydrationLoopSimulation.js'
import {
  buildNutritionLoopAiAlerts,
  dietLabel,
  formatNutritionTime,
  mealLabel,
  nextMealDueIso,
  nutritionBoardBucket,
  nutritionLoopAiSummary,
  nutritionScoreTotalsDisplay,
  listNutritionLoopRows,
} from '../lib/nutritionLoopSimulation.js'

const btn =
  'min-h-[44px] touch-manipulation rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'
const btnPrimary = `${btn} bg-teal-600 text-white hover:bg-teal-700`
const btnMuted = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
const btnWarn = `${btn} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`
const btnDanger = `${btn} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`

const COLS = [
  { key: 'meal_due_now', title: 'Meal due now', sub: 'Tray / feeding round', badge: 'warning' },
  { key: 'poor_intake', title: 'Poor intake', sub: '< ~52% or refusals', badge: 'danger' },
  { key: 'swallowing_risk', title: 'Swallowing risk', sub: 'Texture / tube / assist', badge: 'warning' },
  { key: 'completed_meals', title: 'Completed meals', sub: 'Adequate % logged', badge: 'success' },
  { key: 'weight_loss_concern', title: 'Weight loss concern', sub: 'Trend watch list', badge: 'danger' },
]

function BucketBadge({ bucket }) {
  const map = {
    meal_due_now: { label: 'Meal due', v: 'warning' },
    poor_intake: { label: 'Poor intake', v: 'danger' },
    swallowing_risk: { label: 'Swallow risk', v: 'warning' },
    completed_meals: { label: 'Completed', v: 'success' },
    weight_loss_concern: { label: 'Wt concern', v: 'danger' },
  }
  const x = map[bucket] || { label: bucket, v: 'info' }
  return <Badge variant={x.v}>{x.label}</Badge>
}

function familyDraftForPatient(row) {
  const diet = dietLabel(row.dietType)
  const meal = mealLabel(row.trackedMealType)
  return `${row.patientName} (Rm ${row.room}): ${meal} ~${row.foodIntakePercent}% eaten with ~${row.fluidIntakeMl} mL fluids at last documentation. Diet ${diet}; appetite ${row.appetiteLevel}; assistance ${row.feedingAssistanceNeeded}. Swallowing tier ${row.swallowingRiskTier}. Simulation-only draft — verify with chart before sending to family.`
}

function NutritionCard({ row, onRecordMeal, onRefused, onNote, onEscalate, onFamilyUpdate }) {
  return (
    <Card className="border-slate-100 shadow-sm" padding="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{row.patientName}</p>
          <p className="text-xs text-slate-600">
            Rm <span className="font-semibold">{row.room}</span>
            {row.escalatedPoorIntake ? (
              <Badge variant="danger" className="ml-2">
                Escalated
              </Badge>
            ) : null}
          </p>
        </div>
        <BucketBadge bucket={row.bucket} />
      </div>

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Meal focus</dt>
          <dd className="font-semibold">{mealLabel(row.trackedMealType)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Food intake</dt>
          <dd>
            <span className="font-bold text-slate-900">{row.foodIntakePercent}%</span>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Fluid (meal)</dt>
          <dd>{row.fluidIntakeMl} mL</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Next meal due</dt>
          <dd className="font-medium">{formatNutritionTime(row.nextMealDueAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Last recorded</dt>
          <dd>{formatNutritionTime(row.lastMealRecordedAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Nurse</dt>
          <dd>{row.nurseAssigned}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Diet</dt>
          <dd>{dietLabel(row.dietType)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Swallowing</dt>
          <dd className="max-w-[58%] text-right leading-snug">{row.swallowingRisk}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Assist</dt>
          <dd>{row.feedingAssistanceNeeded}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Appetite</dt>
          <dd>
            <Badge variant={row.appetiteLevel === 'Poor' ? 'danger' : row.appetiteLevel === 'Fair' ? 'warning' : 'success'}>
              {row.appetiteLevel}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Weight trend</dt>
          <dd>
            <Badge variant={/concern/i.test(row.weightTrend) ? 'danger' : /decline/i.test(row.weightTrend) ? 'warning' : 'success'}>
              {row.weightTrend}
            </Badge>
          </dd>
        </div>
        {(row.refusedToday || 0) > 0 ? (
          <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900">
            Meal refusals today: {row.refusedToday}
          </p>
        ) : null}
      </dl>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" className={btnPrimary} onClick={() => onRecordMeal(row)}>
          Record meal
        </button>
        <button type="button" className={btnDanger} onClick={() => onRefused(row)}>
          Patient refused food
        </button>
        <button type="button" className={btnMuted} onClick={() => onNote(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <ClipboardPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Feeding note
          </span>
        </button>
        <button type="button" className={btnWarn} onClick={() => onEscalate(row)}>
          Escalate poor intake
        </button>
        <button type="button" className={`${btnMuted} sm:col-span-2`} onClick={() => onFamilyUpdate(row)}>
          <span className="inline-flex items-center justify-center gap-1">
            <HeartHandshake className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Generate family update
          </span>
        </button>
      </div>
    </Card>
  )
}

export default function NutritionLoopPage() {
  const { patients } = usePatients()
  const { notes } = useNursingNotes()
  const [tick, setTick] = useState(0)
  const [toast, setToast] = useState(null)
  const [mobileCol, setMobileCol] = useState('meal_due_now')

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [tick])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 45 * 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('wmc-nutrition-loop-updated', bump)
    return () => window.removeEventListener('wmc-nutrition-loop-updated', bump)
  }, [])

  const nowMs = Date.now()
  const rows = useMemo(() => listNutritionLoopRows(patients, nowMs), [patients, tick])

  const hydrationByPatientId = useMemo(() => {
    const hRows = listHydrationLoopRows(patients)
    const o = {}
    for (const r of hRows) {
      o[r.patientId] = { bucket: r.bucket, intakePercent: r.intakePercent }
    }
    return o
  }, [patients, tick])

  const alerts = useMemo(
    () => buildNutritionLoopAiAlerts(rows, notes, hydrationByPatientId),
    [rows, notes, hydrationByPatientId],
  )

  const summary = useMemo(() => nutritionLoopAiSummary(rows, notes), [rows, notes, tick])

  const scores = useMemo(() => nutritionScoreTotalsDisplay(), [tick])

  const buckets = useMemo(() => {
    const base = {
      meal_due_now: [],
      poor_intake: [],
      swallowing_risk: [],
      completed_meals: [],
      weight_loss_concern: [],
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

  function handleRecordMeal(row) {
    const raw = window.prompt(`Food intake % , fluid mL — ${row.patientName} (${mealLabel(row.trackedMealType)})`, `${Math.min(95, row.foodIntakePercent + 10)},${row.fluidIntakeMl}`)
    if (raw === null) return
    const parts = String(raw).split(/[,\s]+/).filter(Boolean)
    const pct = parseInt(parts[0]?.replace(/\D/g, '') || '', 10)
    const fluid = parts[1] != null ? parseInt(String(parts[1]).replace(/\D/g, '') || '', 10) : row.fluidIntakeMl
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      showToast('Enter food % between 0 and 100.', 'warn')
      return
    }
    const fluidMl = Number.isFinite(fluid) && fluid >= 0 ? fluid : row.fluidIntakeMl
    const ts = Date.now()
    if (pct >= 75) bumpNutritionScore('goodIntake', 1)
    else if (pct >= 45) bumpNutritionScore('moderateIntake', 1)
    else bumpNutritionScore('poorIntake', 1)

    upsertNutritionPatient(row.patientId, {
      foodIntakePercent: pct,
      fluidIntakeMl: fluidMl,
      mealType: row.trackedMealType,
      recordedForSlot: row.trackedMealType,
      lastMealRecordedAt: new Date(ts).toISOString(),
      nextMealDueAt: nextMealDueIso(ts),
      refusedDay: todayStr,
      mealTrackingDay: todayStr,
    })

    const nextRow = {
      ...row,
      foodIntakePercent: pct,
      fluidIntakeMl: fluidMl,
      recordedForSlot: row.trackedMealType,
      escalatedPoorIntake: row.escalatedPoorIntake,
      nextMealDueAt: nextMealDueIso(ts),
    }
    const b = nutritionBoardBucket({ ...nextRow, trackedMealType: row.trackedMealType }, ts)
    showToast(`Saved ${pct}% · board: ${COLS.find((c) => c.key === b)?.title || b}`, 'success')
  }

  function handleRefused(row) {
    const refusedToday = (row.refusedToday || 0) + 1
    bumpNutritionScore('refused', 1)
    bumpNutritionScore('poorIntake', 1)
    upsertNutritionPatient(row.patientId, {
      refusedToday,
      refusedDay: todayStr,
      foodIntakePercent: Math.min(row.foodIntakePercent, 35),
    })
    showToast('Food refusal documented.', 'warn')
  }

  function handleNote(row) {
    const text = window.prompt(`Feeding note — ${row.patientName}`, '')
    if (text === null) return
    appendNutritionNote(row.patientId, text)
    if (text.trim()) showToast('Note saved.')
  }

  function handleEscalate(row) {
    bumpNutritionScore('highRisk', 1)
    bumpNutritionScore('poorIntake', 1)
    upsertNutritionPatient(row.patientId, { escalatedPoorIntake: true })
    showToast('Poor intake escalated (simulation).', 'warn')
  }

  async function handleFamilyUpdate(row) {
    const draft = familyDraftForPatient(row)
    try {
      await navigator.clipboard.writeText(draft)
      showToast('Family update copied to clipboard.', 'success')
    } catch {
      showToast(draft.slice(0, 220) + '…', 'info')
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] pb-8">
      <PageHeader
        title="Feeding / nutrition loop"
        description="Simulated meal rounds with intake %, diet texture cues, and escalation hooks. Demo only — not a clinical nutrition order set."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Simulation mode</Badge>
            <Link
              to="/hydration-loop"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Hydration Loop
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-orange-400 to-red-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <UserRoundX className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Poor intake</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.poorIntakeCount}</p>
              <p className="text-xs text-slate-600">Low % / appetite / refusal cluster</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-violet-400 to-purple-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Swallowing risk cases</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.swallowRiskCount}</p>
              <p className="text-xs text-slate-600">Texture / tube / assist flags</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-amber-400 to-orange-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <UtensilsCrossed className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Weight warnings</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary.weightLossWarningCount}</p>
              <p className="text-xs text-slate-600">Trend watch list</p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden sm:col-span-2 xl:col-span-1" padding="p-4">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-linear-to-br from-teal-400 to-emerald-600 opacity-15 blur-2xl" />
          <div className="relative flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nurse checklist</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.nurseActionChecklist}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-3" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Family update suggestion</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary.familyUpdateSuggestion}</p>
      </Card>

      <Card className="mt-4" padding="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5 text-teal-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">Nutrition scoring</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Simulation tally · includes demo baseline</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Good intake', val: scores.goodIntake },
            { label: 'Moderate intake', val: scores.moderateIntake },
            { label: 'Poor intake', val: scores.poorIntake },
            { label: 'Refused', val: scores.refused },
            { label: 'High risk', val: scores.highRisk },
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
            <p className="text-sm text-slate-500">Appetite · refusal · swallow · weight · hydration crossover · MD/RD</p>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
            No nutrition alerts on current roster snapshot.
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
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Nutrition board</p>
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
              <span className="hidden min-[380px]:inline">{c.title}</span>
              <span className="min-[380px]:hidden">{c.title.split(' ')[0]}</span>
              <span className="ml-1 tabular-nums opacity-80">({buckets[c.key].length})</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {buckets[mobileCol].map((row) => (
            <NutritionCard
              key={row.patientId}
              row={row}
              onRecordMeal={handleRecordMeal}
              onRefused={handleRefused}
              onNote={handleNote}
              onEscalate={handleEscalate}
              onFamilyUpdate={handleFamilyUpdate}
            />
          ))}
          {buckets[mobileCol].length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-600">
              No patients in this column.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 hidden gap-3 xl:grid xl:grid-cols-5">
        {COLS.map((col) => (
          <div key={col.key} className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50">
            <div className="shrink-0 border-b border-slate-200/80 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold leading-tight text-slate-900">{col.title}</h3>
                <Badge variant={col.badge}>{buckets[col.key].length}</Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">{col.sub}</p>
            </div>
            <div className="max-h-[calc(100vh-14rem)] min-h-[200px] space-y-3 overflow-y-auto overscroll-contain p-2">
              {buckets[col.key].map((row) => (
                <NutritionCard
                  key={row.patientId}
                  row={row}
                  onRecordMeal={handleRecordMeal}
                  onRefused={handleRefused}
                  onNote={handleNote}
                  onEscalate={handleEscalate}
                  onFamilyUpdate={handleFamilyUpdate}
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
